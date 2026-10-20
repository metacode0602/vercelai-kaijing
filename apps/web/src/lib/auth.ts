import { db } from './db'

import { OrganizationInvitationEmail } from '@workspace/email'
import {
  assertLoginAllowed,
  assertUserMayLogin,
  findProvisionedUserByEmail,
} from '@/lib/auth-login-guard'
import { resolveUserRoleFromStaffRoles } from '@/lib/crm/staff-constants'
import { getProvisioningContext, isTrustedProvisioning } from '@/lib/auth-provisioning'
import { normalizePhone } from '@/lib/utils/phone'
import { getActiveOrganization } from '@/lib/server/actions/organizations'
import { assertPasswordPolicy } from '@workspace/auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import {
  admin as adminPlugin,
  emailOTP,
  lastLoginMethod,
  organization as organizationPlugin,
  phoneNumber,
} from 'better-auth/plugins'
import { admin, member as MemberRole, owner, getOrganizationTypeFieldConfig } from '@workspace/auth'
import { invitation, member, organization } from '@workspace/db/schema'
import { account, session,user, verification } from '@workspace/db/schema'
import { Locale } from 'next-intl'
import { parse as parseCookies } from 'cookie'
import { websiteConfig } from './config/website'
import { getUrlWithLocaleInCallbackUrl } from '@/lib/utils/urls'
import { getUserById } from '@/lib/server/actions/users'
import { sendEmail } from '@/lib/mail'
import { sendTencentSms, getSmsOtpValidityMinutes } from '@workspace/redis'
import { consumeAndValidateToken } from '@/lib/captcha/sms-captcha-server'
import { LOCALE_COOKIE_NAME, routing } from '@/lib/i18n/routing'
import { render } from '@react-email/render'
import { createElement } from 'react'

const isProd = process.env.NODE_ENV === 'production'

export const auth = betterAuth({
  advanced: {
    cookiePrefix: websiteConfig.auth.cookiePrefix,
    ...(isProd && {
      crossSubDomainCookies: {
        enabled: true,
        domain: websiteConfig.auth.cookieDomain,
        additionalCookies: ['web.session_token'],
      },
    }),
  },
  trustedOrigins: websiteConfig.auth.trustedOrigins,

  emailAndPassword: {
    enabled: true,
    // 管理端 signUpEmail 建号时勿自动登录，避免覆盖管理员 session 并触发 mustChangePassword 拦截
    autoSignIn: false,
    // https://www.better-auth.com/docs/concepts/email#2-require-email-verification
    requireEmailVerification: websiteConfig.auth.requireEmailVerification,
    // https://www.better-auth.com/docs/authentication/email-password#forget-password
    async sendResetPassword({ user, url }, request) {
      const provisioned = await findProvisionedUserByEmail(user.email)
      if (!provisioned) {
        return
      }

      const locale = getLocaleFromRequest(request)
      const localizedUrl = getUrlWithLocaleInCallbackUrl(url, locale)

      const sent = await sendEmail({
        to: user.email,
        template: 'forgotPassword',
        context: {
          url: localizedUrl,
          name: user.name,
        },
        locale,
      })

      // 发送失败必须抛错，否则 better-auth 仍返回 200，前端只会提示"请检查邮箱"，
      // 用户永远收不到邮件且无从得知原因。
      if (!sent) {
        throw new APIError('INTERNAL_SERVER_ERROR', {
          message: '重置密码邮件发送失败，请稍后重试或联系管理员',
        })
      }
    },
  },
  emailVerification: {
    // https://www.better-auth.com/docs/concepts/email#auto-signin-after-verification
    autoSignInAfterVerification: websiteConfig.auth.autoSignInAfterVerification,
    // https://www.better-auth.com/docs/authentication/email-password#require-email-verification
    sendVerificationEmail: async ({ user, url, token }, request) => {
      const locale = getLocaleFromRequest(request)
      const localizedUrl = getUrlWithLocaleInCallbackUrl(url, locale)

      await sendEmail({
        to: user.email,
        template: 'verifyEmail',
        context: {
          url: localizedUrl,
          name: user.name,
        },
        locale,
      })
    },
    // 邮箱验证成功后的钩子
    onVerification: async ({ user }: any) => {
      // 邮箱验证成功后自动订阅新闻邮件
      if (
        user.email &&
        websiteConfig.newsletter.autoSubscribeAfterSignUp &&
        !user.email.endsWith(websiteConfig.auth.emailSuffix)
      ) {
        try {
          const subscribed = await subscribeUserToNewsletter(user.email)
          if (!subscribed) {
            console.error(`Failed to subscribe user ${user.email} to newsletter`)
          } else {
            console.log(`User ${user.email} subscribed to newsletter after email verification`)
          }
        } catch (error) {
          console.error('Newsletter subscription error after email verification:', error)
        }
      }
    },
  },
  socialProviders: {
    ...(websiteConfig.auth.enableGoogleLogin && {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      },
    }),
    ...(websiteConfig.auth.enableGithubLogin && {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID as string,
        clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      },
    }),
  },
  account: {
    // https://www.better-auth.com/docs/concepts/users-accounts#account-linking
    accountLinking: {
      enabled: true,
      trustedProviders: ['github'],
    },
  },
  user: {
    // https://www.better-auth.com/docs/concepts/database#extending-core-schema
    additionalFields: {
      customerId: {
        type: 'string',
        required: false,
      },
      mustChangePassword: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
      provisionedBy: {
        type: 'string',
        required: false,
        input: false,
      },
      provisionedAt: {
        type: 'date',
        required: false,
        input: false,
      },
    },
    // https://www.better-auth.com/docs/concepts/users-accounts#delete-user
    deleteUser: {
      enabled: true,
    },
  },
  databaseHooks: {
    // https://www.better-auth.com/docs/concepts/database#database-hooks
    account: {
      // 忘记密码流程重置成功后清除 must_change_password，
      // 否则用户刚设完新密码仍会被强制跳转改密码页。
      update: {
        after: async (updatedAccount) => {
          if (updatedAccount?.providerId !== 'credential' || !updatedAccount?.userId) {
            return
          }
          try {
            const { clearMustChangePassword } = await import(
              '@/lib/server/dataaccess/crm/staff-auth'
            )
            await clearMustChangePassword(updatedAccount.userId)
          } catch (error) {
            console.error('Failed to clear mustChangePassword after password reset:', error)
          }
        },
      },
    },
    user: {
      create: {
        before: async (user) => {
          if (!websiteConfig.auth.allowPublicSignUp && !isTrustedProvisioning()) {
            throw new APIError('FORBIDDEN', {
              message: '注册已关闭，请联系管理员开通账号',
            })
          }

          const provisioning = getProvisioningContext()
          if (provisioning) {
            const mobile = provisioning.mobile?.trim()
            const normalizedPhone = mobile ? normalizePhone(mobile) : ''
            const roles = provisioning.roles ?? []
            return {
              data: {
                ...user,
                provisionedBy: provisioning.operatorUserId,
                provisionedAt: new Date(),
                mustChangePassword: true,
                emailVerified: true,
                role: roles.length > 0 ? resolveUserRoleFromStaffRoles(roles) : 'user',
                ...(mobile
                  ? {
                      phoneNumber: mobile,
                      phoneNumberVerified: normalizedPhone.length > 0,
                    }
                  : {}),
              },
            }
          }

          return { data: user }
        },
        after: async (user) => {
          try {
            await ensurePlatformOrganization(user.id, user.name, user.email)
          } catch (error) {
            console.error('Failed to create organization for user:', error)
          }
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          // 管理端 signUpEmail 建号时尚未写入 provisioned_by，需跳过校验
          if (
            websiteConfig.auth.requireProvisionedToLogin &&
            !isTrustedProvisioning()
          ) {
            const userInfo = await getUserById(session.userId)
            try {
              assertUserMayLogin(
                userInfo
                  ? {
                      provisionedBy: userInfo.provisionedBy ?? null,
                      banned: userInfo.banned ?? null,
                      phoneNumberVerified: userInfo.phoneNumberVerified,
                      phoneNumber: userInfo.phoneNumber,
                    }
                  : undefined,
              )
            } catch (error) {
              throw new APIError('FORBIDDEN', {
                message: error instanceof Error ? error.message : '账号未开通或已禁用',
              })
            }
          }

          let activeOrganizationId = (
            await getActiveOrganization(
              session.userId,
              (session.activeOrganizationId as string | null) ?? null
            )
          )?.organization?.id

          if (!activeOrganizationId) {
            const userInfo = await getUserById(session.userId)
            if (userInfo?.id) {
              activeOrganizationId = await ensurePlatformOrganization(
                userInfo.id,
                userInfo.name ?? undefined,
                userInfo.email ?? undefined
              )
            }
          }

          return {
            data: {
              ...session,
              activeOrganizationId: activeOrganizationId ?? null,
            },
          }
        },
        after: async (createdSession) => {
          try {
            const userInfo = await getUserById(createdSession.userId)
            if (!userInfo) return
            const { autoLinkStaffForAuthUser } = await import(
              '@/lib/server/dataaccess/crm/staff-auth'
            )
            await autoLinkStaffForAuthUser({
              id: userInfo.id,
              email: userInfo.email,
              phoneNumber: userInfo.phoneNumber,
            })
          } catch (error) {
            console.error('Failed to auto-link staff for auth user:', error)
          }
        },
      },
    },
  },

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: user,
      session: session,
      account: account,
      verification: verification,
      organization: organization,
      member: member,
      invitation: invitation,
    },
  }),
  plugins: [
    emailOTP({
      sendVerificationOTP: async ({ email, otp, type }, ctx) => {
        const locale = getLocaleFromRequest(ctx?.request)
        await sendEmail({
          to: email,
          template: 'emailOtp',
          context: { code: otp, purpose: type },
          locale,
        })
      },
      changeEmail: { enabled: true, verifyCurrentEmail: false },
      // 运营平台闭注册：邮箱 OTP 只能用于已开通账号，禁止自动建号
      disableSignUp: true,
      storeOTP: 'hashed',
      expiresIn: 300,
      rateLimit: { window: 60, max: 3 },
    }),
    organizationPlugin({
      schema: {
        organization: {
          additionalFields: {
            orgType: getOrganizationTypeFieldConfig('web'),
          },
        },
      },
      async sendInvitationEmail(data) {
        const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL}/api/accept-invitation/${data.id}`
        const html = await render(
          createElement(OrganizationInvitationEmail, {
            email: data.email,
            invitedByUsername: data.inviter.user.name,
            invitedByEmail: data.inviter.user.email,
            teamName: data.organization.name,
            inviteLink,
          }),
        )
        const text = await render(
          createElement(OrganizationInvitationEmail, {
            email: data.email,
            invitedByUsername: data.inviter.user.name,
            invitedByEmail: data.inviter.user.email,
            teamName: data.organization.name,
            inviteLink,
          }),
          { plainText: true },
        )
        await sendEmail({
          to: data.email,
          subject: "You've been invited to join our organization",
          html,
          text,
        })
      },
      roles: {
        owner,
        admin,
        member: MemberRole,
      },
    }),
    // https://www.better-auth.com/docs/plugins/admin
    // support user management, ban/unban user, manage user roles, etc.
    adminPlugin({
      // https://www.better-auth.com/docs/plugins/admin#default-ban-reason
      // defaultBanReason: 'Spamming',
      defaultBanExpiresIn: undefined,
      bannedUserMessage:
        'You have been banned from this application. Please contact support if you believe this is an error.',
    }),
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
    lastLoginMethod(),
    nextCookies(),
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const path = ctx.path

      if (path === '/sign-up/email' && !websiteConfig.auth.allowPublicSignUp) {
        if (!isTrustedProvisioning()) {
          throw new APIError('FORBIDDEN', {
            message: '注册已关闭，请联系管理员开通账号',
          })
        }
      }

      if (path === '/sign-in/email') {
        const body = ctx.body as { email?: string }
        if (body?.email && websiteConfig.auth.requireProvisionedToLogin) {
          try {
            await assertLoginAllowed({ type: 'email', email: body.email })
          } catch (error) {
            throw new APIError('FORBIDDEN', {
              message: error instanceof Error ? error.message : '账号未开通或已禁用',
            })
          }
        }
      }

      if (path === '/sign-in/phone-number' || path === '/phone-number/send-otp') {
        const body = ctx.body as { phoneNumber?: string }
        if (body?.phoneNumber && websiteConfig.auth.requireProvisionedToLogin) {
          try {
            await assertLoginAllowed(
              { type: 'phone', phoneNumber: body.phoneNumber },
              { requireVerifiedPhone: path === '/sign-in/phone-number' },
            )
          } catch (error) {
            throw new APIError('FORBIDDEN', {
              message: error instanceof Error ? error.message : '账号未开通或已禁用',
            })
          }
        }
      }

      if (path === '/change-password') {
        const body = ctx.body as {
          newPassword?: string
          currentPassword?: string
        }
        const sessionUser = ctx.context.session?.user as
          | { email?: string; name?: string }
          | undefined
        if (body?.newPassword) {
          if (body.currentPassword && body.newPassword === body.currentPassword) {
            throw new APIError('BAD_REQUEST', { message: '新密码不能与当前密码相同' })
          }
          try {
            assertPasswordPolicy(body.newPassword, {
              email: sessionUser?.email,
              name: sessionUser?.name,
            })
          } catch (error) {
            throw new APIError('BAD_REQUEST', {
              message: error instanceof Error ? error.message : '密码不符合安全要求',
            })
          }
        }
      }

      if (path === '/reset-password') {
        const body = ctx.body as { newPassword?: string }
        if (body?.newPassword) {
          try {
            assertPasswordPolicy(body.newPassword)
          } catch (error) {
            throw new APIError('BAD_REQUEST', {
              message: error instanceof Error ? error.message : '密码不符合安全要求',
            })
          }
        }
      }
    }),
  },
  onAPIError: {
    // https://www.better-auth.com/docs/reference/options#onapierror
    errorURL: '/auth/error',
    onError: (error, ctx) => {
      console.error('auth error:', error, ctx?.session?.user)
    },
  },
})

export async function ensurePlatformOrganization(
  userId: string,
  userName?: string | null,
  userEmail?: string | null
): Promise<string> {
  const existing = await getActiveOrganization(userId)
  if (existing.organization?.id) {
    return existing.organization.id
  }

  const name = userName || userEmail?.split('@')[0] || 'user'

  try {
    const created = await auth.api.createOrganization({
      body: {
        name,
        slug: `platform-${userId}`,
        userId,
      },
    })
    if (created?.id) {
      return created.id
    }
    throw new Error('Failed to create platform organization')
  } catch (error) {
    const fallback = await getActiveOrganization(userId)
    if (fallback.organization?.id) {
      return fallback.organization.id
    }
    throw error
  }
}

/**
 * Gets the locale from a request by parsing the cookies
 * If no locale is found in the cookies, returns the default locale
 *
 * @param request - The request to get the locale from
 * @returns The locale from the request or the default locale
 */
export function getLocaleFromRequest(request?: Request): Locale {
  const cookies = parseCookies(request?.headers.get('cookie') ?? '')
  return (cookies[LOCALE_COOKIE_NAME] as Locale) ?? routing.defaultLocale
}

/** Hook newsletter provider here (e.g. mailing list API). */
async function subscribeUserToNewsletter(_email: string): Promise<boolean> {
  return false
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
