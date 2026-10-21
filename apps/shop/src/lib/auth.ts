import { AUTH_PATH, normalizeContactPhone } from '@/lib/auth/constants'
import { schema } from '@workspace/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { emailOTP, phoneNumber } from 'better-auth/plugins'
import type { Locale } from 'next-intl'
import { websiteConfig } from '@/lib/config/website'
import { db } from '@/lib/db'
import { sendEmailOtpStub, sendPhoneOtpStub } from '@/lib/auth/otp-adapters'
import { sendEmail } from '@/lib/mail'
import { routing } from '@/lib/i18n/routing'

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
  plugins: [
    phoneNumber({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 5,
      phoneNumberValidator: (phone) => isValidCnMobile(phone),
      sendOTP: async ({ phoneNumber: phone, code }) => {
        await sendPhoneOtpStub({ phoneNumber: normalizeContactPhone(phone), code })
      },
      signUpOnVerification: {
        getTempEmail: (phone) => {
          const normalized = normalizeContactPhone(phone)
          return `${normalized}@${websiteConfig.auth.emailSuffix}`
        },
        getTempName: (phone) => normalizeContactPhone(phone),
      },
    }),
    emailOTP({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 5,
      disableSignUp: false,
      // Built-in BA window; shop also enforces stronger limits in the route wrapper
      rateLimit: {
        window: 60,
        max: 1,
      },
      sendVerificationOTP: async ({ email, otp, type }) => {
        await sendEmailOtpStub({ email: email.trim().toLowerCase(), otp, type })
      },
    }),
    nextCookies(),
  ],
})

export type ShopAuth = typeof auth
