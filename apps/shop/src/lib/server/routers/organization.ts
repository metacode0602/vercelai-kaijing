import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import {
  LAST_ORGANIZATION_COOKIE,
  readCookieFromHeader,
} from '@/lib/organization/constants'
import {
  createTRPCRouter,
  tenantProcedure,
  userProcedure,
} from '@/lib/server/trpc'
import * as organizationDa from '@/lib/server/dataaccess/organization'
import * as organizationContextDa from '@/lib/server/dataaccess/organization-context'
import * as orgSettingsDa from '@/lib/server/dataaccess/organization-settings'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

/** 设置 · 企业信息、偏好与钉钉通知；同时提供多组织选择接口。 */
export const organizationRouter = createTRPCRouter({
  listMine: userProcedure.query(async ({ ctx }) => {
    const memberships = await organizationContextDa.listUserOrganizations(
      ctx.db,
      ctx.user.id,
      ctx.organizationId,
    )
    return {
      memberships,
      activeOrganizationId: ctx.organizationId,
      lastOrganizationId: readCookieFromHeader(
        ctx.headers.get('cookie'),
        LAST_ORGANIZATION_COOKIE,
      ),
      entryState:
        memberships.length === 0
          ? ('no_org' as const)
          : memberships.length === 1
            ? ('single_org' as const)
            : ('multiple_orgs' as const),
    }
  }),

  setActive: userProcedure
    .input(z.object({ organizationId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const membership = await organizationContextDa.getUserOrganization(
        ctx.db,
        ctx.user.id,
        input.organizationId,
      )
      if (!membership) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '组织不存在或你不是组织成员' })
      }
      if (membership.organizationStatus !== 'active') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '该组织已暂停，请联系平台运营' })
      }
      await auth.api.setActiveOrganization({
        headers: ctx.headers,
        body: { organizationId: membership.organizationId },
      })
      const canEnterConsole =
        membership.onboardingStatus === 'submitted' ||
        membership.onboardingStatus === 'approved'
      return {
        organizationId: membership.organizationId,
        organizationName: membership.name,
        onboardingStatus: membership.onboardingStatus,
        redirectTo: canEnterConsole ? ('/console/dashboard' as const) : ('/onboarding' as const),
      }
    }),

  get: tenantProcedure.query(async ({ ctx }) => {
    const profile = await organizationDa.getOrganizationProfile(ctx.db, ctx.organizationId)
    if (!profile) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '当前组织不存在或已被删除' })
    }
    return profile
  }),

  update: tenantProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        logo: z.string().max(2048).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => organizationDa.updateOrganizationProfile(ctx.db, ctx.organizationId, input)),
    ),

  getPreferences: tenantProcedure.query(async ({ ctx }) =>
    orgSettingsDa.getOrganizationPreferences(ctx.db, ctx.organizationId),
  ),

  updatePreferences: tenantProcedure
    .input(
      z.object({
        defaultShopId: z.string().min(1).nullable().optional(),
        timezone: z.string().min(1).max(64).optional(),
        displayCurrency: z.string().min(3).max(8).optional(),
        tableDensity: z.string().min(1).max(16).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => orgSettingsDa.updateOrganizationPreferences(ctx.db, ctx.organizationId, input)),
    ),

  getNotificationSettings: tenantProcedure.query(async ({ ctx }) =>
    orgSettingsDa.getOrganizationNotificationSettings(ctx.db, ctx.organizationId),
  ),

  updateNotificationSettings: tenantProcedure
    .input(
      z.object({
        dingtalkEnabled: z.boolean(),
        webhookUrl: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        orgSettingsDa.updateOrganizationNotificationSettings(ctx.db, ctx.organizationId, input),
      ),
    ),

  sendDingTalkTest: tenantProcedure
    .input(z.object({ webhookUrl: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(async () => {
        await orgSettingsDa.sendDingTalkTextForOrg(
          ctx.db,
          ctx.organizationId,
          '【好市云】这是一条钉钉测试消息。收到即表示 Webhook 配置有效。',
          input.webhookUrl,
        )
        return { ok: true as const, message: '测试消息已发送到钉钉' }
      }),
    ),
})
