import { sharedAuthOptions } from '@workspace/auth'
import { schema } from '@workspace/db'
import { getSmsOtpValidityMinutes, sendTencentSms } from '@workspace/redis'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { admin as adminPlugin, lastLoginMethod, phoneNumber } from 'better-auth/plugins'
import type { Locale } from 'next-intl'
import { consumeAndValidateToken } from './captcha/sms-captcha-server'
import { sendEmail } from './mail'
import { routing } from './i18n/routing'
import { db } from './db'

const isProd = process.env.NODE_ENV === 'production'

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

async function sendSmsCodeByTecent(phone: string, code: string) {
  try {
    const resp = await sendTencentSms({
      phone,
      templateParams: [code, String(getSmsOtpValidityMinutes())],
    })
    return { code: 200, data: { requestId: resp.requestId, sendStatus: resp.sendStatus } }
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    console.warn('[auth] 腾讯云短信发送失败:', message)
    return { code: 500, msg: message }
  }
}

export const auth = betterAuth({
  ...sharedAuthOptions,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { schema, provider: 'pg' }),
  advanced: {
    // Must match createAuthClient cookiePrefix in @/lib/auth-client
    cookiePrefix: 'web',
    ...(isProd && {
      useSecureCookies: true,
    }),
  },
  emailAndPassword: {
    enabled: true,
    // 找回密码邮件：/api/auth/request-password-reset 触发（防账号探测，未知邮箱不发信）
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
    ...(sharedAuthOptions.plugins ?? []),
    phoneNumber({
      sendOTP: async ({ phoneNumber, code }, request) => {
        // 校验拼图验证码令牌，通过后才真正下发短信，避免验证码被绕过
        const captchaToken = request?.headers?.get('x-temp-captcha-token')
        if (captchaToken) {
          const valid = await consumeAndValidateToken(captchaToken)
          if (!valid) {
            console.warn(`[auth] Invalid captcha token for phone ${phoneNumber}`)
            return
          }
        } else {
          console.warn(`[auth] Missing captcha token for phone ${phoneNumber}`)
          return
        }

        console.log(`Sending OTP ${code} to phone number ${phoneNumber}`)
        if (isProd) {
          // 生产环境下才发送短信
          await sendSmsCodeByTecent(phoneNumber, code)
        }
      },
    }),
    adminPlugin(),
    lastLoginMethod(),
    nextCookies(),
  ],
})
