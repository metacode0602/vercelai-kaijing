import { AUTH_PATH, normalizeContactPhone } from '@/lib/auth/constants'
import { schema } from '@workspace/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { emailOTP, phoneNumber } from 'better-auth/plugins'
import { websiteConfig } from '@/lib/config/website'
import { db } from '@/lib/db'
import { sendEmailOtpStub, sendPhoneOtpStub } from '@/lib/auth/otp-adapters'

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
    enabled: false,
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
