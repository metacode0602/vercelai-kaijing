import { schema } from '@workspace/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { emailOTP, organization, phoneNumber } from 'better-auth/plugins'
import { sendOtpSmsWithRateLimit, SmsRateLimitError } from '@workspace/redis'
import { db } from './db'
import {
  ac,
  tenant_owner,
  tenant_engineer,
  tenant_viewer,
  member as memberRole,
  getOrganizationTypeFieldConfig,
  resolveLocaleFromCookieHeader,
} from '@workspace/auth'
import { sendEmail } from './mail'
import { LOCALE_COOKIE_NAME, LOCALES, routing } from './i18n/routing'
import { websiteConfig } from './config/website'
import { consumeAndValidateToken } from '@workspace/sms-captcha/server'
import { user as userTable } from '@workspace/db/schema'
import { eq } from 'drizzle-orm'
import { ensureBillingTenant, getOrCreateTenantBalance } from '@workspace/billing'
import { attributePromoSignup, getPromoCodeFromRequest } from './server/promo-attribution'
import { findTenantMembership } from './server/dataaccess/tenant-membership'

const isProd = process.env.NODE_ENV === 'production'

export const auth = betterAuth({
  advanced: {
    cookiePrefix: websiteConfig.auth.cookiePrefix,
    ...(isProd && {
      crossSubDomainCookies: {
        enabled: true,
        domain: websiteConfig.auth.cookieDomain,
        additionalCookies: ['gpus.session_token'],
      },
    }),
  },
  emailAndPassword: {
    enabled: true,
  },
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  plugins: [
    emailOTP({
      sendVerificationOTP: async ({ email, otp, type }, ctx) => {
        const locale = resolveLocaleFromCookieHeader(ctx?.request?.headers.get('cookie'), {
          cookieName: LOCALE_COOKIE_NAME,
          locales: LOCALES,
          fallback: routing.defaultLocale,
        })
        await sendEmail({
          to: email,
          template: 'emailOtp',
          context: { code: otp, purpose: type },
          locale,
        })
      },
      changeEmail: { enabled: true, verifyCurrentEmail: false },
      storeOTP: 'hashed',
      expiresIn: 300,
      rateLimit: { window: 60, max: 3 },
    }),
    organization({
      schema: {
        organization: {
          additionalFields: {
            orgType: getOrganizationTypeFieldConfig('gpus'),
          },
        },
      },
      ac,
      roles: {
        tenant_owner,
        tenant_engineer,
        tenant_viewer,
        owner: tenant_owner,
        admin: tenant_engineer,
        member: memberRole,
      },
    }),
    phoneNumber({
      sendOTP: async ({ phoneNumber: _phone, code }, request) => {
        // Validate captcha token from header before sending OTP
        const captchaToken = request?.headers?.get('x-temp-captcha-token')
        if (captchaToken) {
          const valid = await consumeAndValidateToken(captchaToken)
          if (!valid) {
            console.warn(`[auth] Invalid captcha token for phone ${_phone}`)
            return // silently drop; client will see no OTP sent
          }
        } else {
          console.warn(`[auth] Missing captcha token for phone ${_phone}`)
          return
        }

        console.log(`[auth] Sending OTP ${code} to phone number ${_phone}`)
        try {
          await sendOtpSmsWithRateLimit({ scope: 'gpus-auth', phone: _phone, code })
        } catch (err) {
          if (err instanceof SmsRateLimitError) {
            console.warn(`[auth] 短信限流 phone ${_phone}: ${err.message}`)
          } else {
            console.warn(`[auth] 短信发送失败 phone ${_phone}:`, err)
          }
        }
      },
      signUpOnVerification: {
        getTempEmail: (phoneNumber: string) => {
          return `${phoneNumber}@${websiteConfig.auth.emailSuffix}`
        },
        getTempName: (phoneNumber: string) => {
          return phoneNumber
        },
      },
    }),
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (userRow) => {
          try {
            await ensureTenantOrganization(userRow.id)
          } catch (error) {
            console.error('[auth] Failed to auto-create organization for user:', error)
          }
        },
      },
    },
    session: {
      create: {
        before: async (sessionData, request): Promise<{ data: typeof sessionData }> => {
          const preferredOrganizationId =
            (sessionData.activeOrganizationId as string | null) ?? null
          const existingMembership = await findTenantMembership(
            sessionData.userId,
            preferredOrganizationId
          )
          let tenantOrgId = existingMembership?.organizationId

          if (!tenantOrgId && preferredOrganizationId) {
            tenantOrgId = (
              await findTenantMembership(sessionData.userId)
            )?.organizationId
          }

          if (!tenantOrgId) {
            try {
              tenantOrgId = await ensureTenantOrganization(sessionData.userId)
            } catch (error) {
              console.error('[auth] Failed to create tenant organization for session:', error)
              return { data: sessionData }
            }
          }

          if (request) {
            const cookieHeader = request.headers?.get('cookie')
            const promoCode = getPromoCodeFromRequest(cookieHeader)
            if (promoCode) {
              const userInfo = await db.query.user.findFirst({
                where: eq(userTable.id, sessionData.userId),
              })
              if (userInfo) {
                await attributePromoSignup({
                  tenantOrgId,
                  userId: sessionData.userId,
                  userEmail: userInfo.email,
                  userName: userInfo.name,
                  promoCode,
                  ipAddress: request.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers?.get('x-real-ip') || undefined,
                  userAgent: request.headers?.get('user-agent') || undefined,
                })
              }
            }
          }

          return {
            data: {
              ...sessionData,
              activeOrganizationId: tenantOrgId,
            },
          }
        },
      },
    },
  },
  trustedOrigins: [...websiteConfig.auth.trustedOrigins],
  onAPIError: {
    errorURL: '/auth/error',
    onError: (error, ctx) => {
      console.error('[auth error]', error, ctx?.session?.user)
    },
  },
})

export async function ensureTenantOrganization(userId: string): Promise<string> {
  const existingMembership = await findTenantMembership(userId)
  if (existingMembership) {
    await ensureBillingTenant(db, existingMembership.organizationId, {
      name: existingMembership.organization.name,
      organizationId: existingMembership.organizationId,
      merchantId: null,
    })
    await getOrCreateTenantBalance(
      db,
      existingMembership.organizationId,
      existingMembership.organizationId
    )
    return existingMembership.organizationId
  }

  const [userInfo] = await db
    .select({ name: userTable.name, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1)

  if (!userInfo) {
    throw new Error(`User not found: ${userId}`)
  }

  const organizationName = userInfo.name || userInfo.email?.split('@')[0] || 'user'

  try {
    const newOrg = await auth.api.createOrganization({
      body: {
        name: organizationName,
        slug: `tenant-${userId}`,
        userId,
      },
    }) as { id?: string } | undefined

    if (!newOrg?.id) {
      throw new Error('Failed to create tenant organization')
    }

    await ensureBillingTenant(db, newOrg.id, {
      name: organizationName,
      organizationId: newOrg.id,
      merchantId: null,
    })
    await getOrCreateTenantBalance(db, newOrg.id, newOrg.id)
    return newOrg.id
  } catch (error) {
    const fallbackMembership = await findTenantMembership(userId)
    if (!fallbackMembership) throw error

    await ensureBillingTenant(db, fallbackMembership.organizationId, {
      name: fallbackMembership.organization.name,
      organizationId: fallbackMembership.organizationId,
      merchantId: null,
    })
    await getOrCreateTenantBalance(
      db,
      fallbackMembership.organizationId,
      fallbackMembership.organizationId
    )
    return fallbackMembership.organizationId
  }
}
