import { ORG_ROLES } from '@workspace/auth'
import { webMember, webOrganization, webUser } from '@workspace/db'
import { eq, type SQL } from 'drizzle-orm'
import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { webAuthDb } from '@/lib/db'

/**
 * 平台管理员判定与登录门禁。
 *
 * 口径：org_type='platform' 的组织成员，且 member.role ∈
 * ORG_ROLES.platform（platform_admin / platform_operator / platform_finance）。
 * 查询落在 web_auth schema（与租户 public 物理隔离），见 @workspace/db web-auth-schema。
 */

const PLATFORM_ROLES: readonly string[] = ORG_ROLES.platform

async function matchPlatformAdmin(where: SQL): Promise<boolean> {
  const rows = await webAuthDb
    .select({ role: webMember.role, orgType: webOrganization.orgType })
    .from(webMember)
    .innerJoin(webOrganization, eq(webMember.organizationId, webOrganization.id))
    .innerJoin(webUser, eq(webMember.userId, webUser.id))
    .where(where)

  return rows.some(
    (row) => row.orgType === 'platform' && PLATFORM_ROLES.includes(row.role)
  )
}

export async function isPlatformAdminByEmail(email: string): Promise<boolean> {
  return matchPlatformAdmin(eq(webUser.email, email))
}

export async function isPlatformAdminByPhone(phoneNumber: string): Promise<boolean> {
  return matchPlatformAdmin(eq(webUser.phoneNumber, phoneNumber))
}

export async function isPlatformAdminUserId(userId: string): Promise<boolean> {
  const rows = await webAuthDb
    .select({ role: webMember.role, orgType: webOrganization.orgType })
    .from(webMember)
    .innerJoin(webOrganization, eq(webMember.organizationId, webOrganization.id))
    .where(eq(webMember.userId, userId))

  return rows.some(
    (row) => row.orgType === 'platform' && PLATFORM_ROLES.includes(row.role)
  )
}

function resolveGateLocale(headers?: Headers): 'zh' | 'en' {
  const locale = headers
    ?.get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('NEXT_LOCALE='))
    ?.split('=')[1]
  return locale === 'en' ? 'en' : 'zh'
}

function gateMessage(headers?: Headers): string {
  return resolveGateLocale(headers) === 'en'
    ? 'Platform administrators only'
    : '仅限平台管理员登录'
}

function signUpClosedMessage(headers?: Headers): string {
  return resolveGateLocale(headers) === 'en'
    ? 'Registration is disabled. Contact your platform administrator'
    : '注册已关闭，请联系平台管理员'
}

/**
 * apps/web 登录门禁插件（better-auth plugin hooks.before）：
 * - 关闭注册（/sign-up/* 全部 403）
 * - /sign-in/email：仅平台管理员可登录
 * - /phone-number/send-otp：仅平台管理员可取手机验证码
 * 受保护页面与 tRPC 另有会话级校验（layout / protectedProcedure），此处是第一道闸。
 */
export const platformAdminGate: BetterAuthPlugin = {
  id: 'platform-admin-gate',
  hooks: {
    before: [
      {
        matcher: (ctx) => !!ctx.path && ctx.path.includes('/sign-up'),
        handler: createAuthMiddleware(async (ctx) => {
          throw new APIError('FORBIDDEN', { message: signUpClosedMessage(ctx.headers ?? undefined) })
        }),
      },
      {
        matcher: (ctx) => !!ctx.path && ctx.path.includes('/sign-in/email'),
        handler: createAuthMiddleware(async (ctx) => {
          const email =
            typeof ctx.body?.email === 'string' ? ctx.body.email.trim() : ''
          if (!email || !(await isPlatformAdminByEmail(email))) {
            throw new APIError('FORBIDDEN', { message: gateMessage(ctx.headers ?? undefined) })
          }
        }),
      },
      {
        matcher: (ctx) => !!ctx.path && ctx.path.includes('/phone-number/send-otp'),
        handler: createAuthMiddleware(async (ctx) => {
          const phoneNumber =
            typeof ctx.body?.phoneNumber === 'string'
              ? ctx.body.phoneNumber.trim()
              : ''
          if (!phoneNumber || !(await isPlatformAdminByPhone(phoneNumber))) {
            throw new APIError('FORBIDDEN', { message: gateMessage(ctx.headers ?? undefined) })
          }
        }),
      },
    ],
  },
}
