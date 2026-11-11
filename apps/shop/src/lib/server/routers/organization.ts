import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as organizationDa from '@/lib/server/dataaccess/organization'
import * as orgSettingsDa from '@/lib/server/dataaccess/organization-settings'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

/** 设置 · 企业信息、偏好与钉钉通知。 */
export const organizationRouter = createTRPCRouter({
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
