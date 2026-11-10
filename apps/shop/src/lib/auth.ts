import { AUTH_PATH, normalizeContactPhone } from '@/lib/auth/constants'
import { sharedAuthOptions } from '@workspace/auth'
import { schema } from '@workspace/db'
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { emailOTP, phoneNumber } from 'better-auth/plugins'
import type { Locale } from 'next-intl'
import { websiteConfig } from '@/lib/config/website'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/mail'
import { routing } from '@/lib/i18n/routing'
import { consumeAndValidateToken } from '@workspace/sms-captcha/server'
import { sendOtpSmsWithRateLimit, SmsRateLimitError } from '@workspace/redis'
import { acceptPendingInvitationsForPhone } from '@/lib/server/dataaccess/members'

const isProd = process.env.NODE_ENV === 'production'

function resolveBaseURL() {
  return (
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_URL ||
    'http://localhost:3000'
  )
}

function isValidCnMobile(phone: string) {
  const normalized = normalizeContactPhone(phone)
  return /^1\d{10}$/.test(normalized)
}

/** 从 NEXT_LOCALE cookie 解析邮件语言，缺省回退默认语言。 */
function resolveMailLocale(request?: Request): Locale {
  const cookie = request?.headers?.get('cookie')
  const locale = cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('NEXT_LOCALE='))
    ?.split('=')[1]
  return locale === 'en' || locale === 'zh' ? (locale as Locale) : routing.defaultLocale
}

/** 通过腾讯云短信下发验证码，带冷却与每日上限；失败时抛出可展示给用户的错误。 */
async function sendPhoneOtp(params: { phone: string; code: string }) {
  try {
    await sendOtpSmsWithRateLimit({
      scope: 'shop-auth',
      phone: params.phone,
      code: params.code,
    })
  } catch (error) {
    if (error instanceof SmsRateLimitError) {
      throw new APIError('TOO_MANY_REQUESTS', { message: error.message })
    }
    console.error('[auth] 短信验证码发送失败:', error)
    throw new APIError('INTERNAL_SERVER_ERROR', {
      message: '验证码发送失败，请稍后重试',
    })
  }
}

/** 通过 SMTP 下发邮箱验证码；发送失败只记录日志，不阻断主流程。 */
async function sendEmailOtp(params: {
  email: string
  otp: string
  type: 'sign-in' | 'email-verification' | 'forget-password' | 'change-email'
  request?: Request
}) {
  try {
    const ok = await sendEmail({
      to: params.email,
      template: 'emailOtp',
      context: { code: params.otp, purpose: params.type },
      locale: resolveMailLocale(params.request),
    })
    if (!ok) {
      console.error(`[auth] 邮箱验证码发送失败: ${params.email}`)
    }
  } catch (error) {
    console.error('[auth] 邮箱验证码发送失败:', error)
  }
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET || 'shop-dev-secret-change-me',
  baseURL: resolveBaseURL(),
  basePath: AUTH_PATH,
  trustedOrigins: [
    ...(websiteConfig.auth.trustedOrigins ?? []),
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ??
      []),
  ],
  database: drizzleAdapter(db, { schema, provider: 'pg' }),
  advanced: {
    cookiePrefix: websiteConfig.auth.cookiePrefix,
    ...(isProd ? { useSecureCookies: true } : {}),
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: websiteConfig.auth.requireEmailVerification,
    // 找回密码邮件：/api/auth/realm-forgot-password 触发（防账号探测，未知邮箱不发信）
    sendResetPassword: async ({ user, url }, request) => {
      try {
        await sendEmail({
          to: user.email,
          template: 'forgotPassword',
          context: { url, name: user.name },
          locale: resolveMailLocale(request),
        })
      } catch (error) {
        console.error('[auth] 找回密码邮件发送失败:', error)
      }
    },
  },
  emailVerification: {
    sendOnSignUp: websiteConfig.auth.enableEmailVerification,
    sendVerificationEmail: async ({ user, url }, request) => {
      try {
        const ok = await sendEmail({
          to: user.email,
          template: 'verifyEmail',
          context: { url, name: user.name },
          locale: resolveMailLocale(request),
        })
        if (!ok) {
          console.error(`[auth] 激活邮件发送失败: ${user.email}`)
        }
      } catch (error) {
        console.error('[auth] 激活邮件发送失败:', error)
      }
    },
  },
  plugins: [
    ...(sharedAuthOptions.plugins ?? []),
    phoneNumber({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 5,
      phoneNumberValidator: (phone) => isValidCnMobile(phone),
      sendOTP: async ({ phoneNumber: phone, code }, request) => {
        // 校验滑块验证码 token，未通过则不发送短信，避免验证码被绕过
        const captchaToken = request?.headers?.get('x-temp-captcha-token')
        if (!captchaToken) {
          throw new APIError('BAD_REQUEST', { message: '安全验证已失效，请重新验证' })
        }
        const valid = await consumeAndValidateToken(captchaToken)
        if (!valid) {
          throw new APIError('BAD_REQUEST', { message: '安全验证已失效，请重新验证' })
        }
        await sendPhoneOtp({ phone: normalizeContactPhone(phone), code })
      },
      signUpOnVerification: {
        getTempEmail: (phone) => {
          const normalized = normalizeContactPhone(phone)
          return `${normalized}@${websiteConfig.auth.emailSuffix}`
        },
        getTempName: (phone) => normalizeContactPhone(phone),
      },
      callbackOnVerification: async ({ phoneNumber: phone, user }) => {
        try {
          const result = await acceptPendingInvitationsForPhone(
            db,
            user.id,
            normalizeContactPhone(phone),
          )
          if (result.accepted > 0) {
            console.info(
              `[auth] phone invite auto-bind: user=${user.id} orgs=${result.organizationIds.join(',')}`,
            )
          }
        } catch (error) {
          console.error('[auth] phone invite auto-bind failed:', error)
        }
      },
    }),
    emailOTP({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 5,
      disableSignUp: false,
      rateLimit: {
        window: 60,
        max: 1,
      },
      sendVerificationOTP: async ({ email, otp, type }) => {
        await sendEmailOtp({ email: email.trim().toLowerCase(), otp, type })
      },
    }),
    nextCookies(),
  ],
})

export type ShopAuth = typeof auth
