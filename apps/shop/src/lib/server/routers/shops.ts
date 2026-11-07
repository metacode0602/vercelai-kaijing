import { TRPCError } from '@trpc/server'
import {
  isMarketplacePlatform,
  resolveMarketplaceAppCredential,
} from '@workspace/marketplace'
import { z } from 'zod'
import {
  createTRPCRouter,
  tenantAdminProcedure,
  tenantProcedure,
} from '@/lib/server/trpc'
import * as shopsDa from '@/lib/server/dataaccess/shop-connections'
import {
  getOnboardingState,
  isShopBindingAllowed,
} from '@/lib/server/dataaccess/onboarding'
import { UI_SHOP_AUTH_STATUSES } from '@/lib/server/mappers/ops-master'
import { allowRateLimited } from '@/lib/server/rate-limit'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const shopsRouter = createTRPCRouter({
  list: tenantProcedure
    .input(
      z.object({
        page: z.number().optional(),
        pageSize: z.number().optional(),
        q: z.string().optional(),
        authStatus: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => shopsDa.listShopConnections(ctx.db, ctx.organizationId, input)),
  meta: tenantProcedure.query(async () => ({
    authStatuses: [...UI_SHOP_AUTH_STATUSES],
    note: '授权跳转真实平台 OAuth；回调成功后才写入加密凭证并更新授权状态。',
  })),
  get: tenantProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const row = await shopsDa.getShopConnection(ctx.db, ctx.organizationId, input.id)
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到店铺 ${input.id}` })
    return row
  }),
  createDraft: tenantAdminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        platform: z.enum(['daraz', 'lazada', 'tiktok_shop']),
        region: z.string().optional(),
        currency: z.string().optional(),
        externalShopId: z.string().optional(),
        sellerId: z.string().optional(),
        shopGroup: z.string().optional(),
        fulfillmentMode: z.string().optional(),
        owner: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const onboarding = await getOnboardingState(ctx.db, ctx.user.id, ctx.organizationId)
      if (!isShopBindingAllowed(onboarding)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '请先完成入驻并通过审核后再新增店铺',
        })
      }
      return wrap(() => shopsDa.createShopDraft(ctx.db, ctx.organizationId, input))
    }),
  beginAuthorization: tenantAdminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        mode: z.enum(['bind', 'reauth']).optional(),
        locale: z.string().max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (
        !(await allowRateLimited(
          `oauth.authorize:${ctx.organizationId}`,
          20,
          3600,
        ))
      ) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: '授权操作过于频繁，请稍后再试',
        })
      }
      const shop = await shopsDa.getShopConnection(ctx.db, ctx.organizationId, input.id)
      if (!shop) throw new TRPCError({ code: 'NOT_FOUND', message: '店铺不存在' })
      if (!isMarketplacePlatform(shop.platform)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '暂不支持该平台授权' })
      }
      const onboarding = await getOnboardingState(ctx.db, ctx.user.id, ctx.organizationId)
      if (!isShopBindingAllowed(onboarding)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '请先完成入驻并通过审核后再授权店铺',
        })
      }
      if (!isMarketplacePlatform(shop.platform)) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `暂不支持平台 ${shop.platform}`,
        })
      }
      const appCredential = await resolveMarketplaceAppCredential(ctx.db, {
        organizationId: ctx.organizationId,
        platform: shop.platform,
        region: shop.region ?? '',
      })
      if (!appCredential) {
        const configParams = new URLSearchParams({
          reason: 'missing-app',
          platform: shop.platform,
          shopId: shop.id,
        })
        return {
          url: `/console/settings/marketplace-apps?${configParams.toString()}`,
          missingConfig: true,
        }
      }
      const params = new URLSearchParams({
        platform: shop.platform,
        shopId: shop.id,
        mode: input.mode ?? (shop.dbStatus === 'active' ? 'reauth' : 'bind'),
        locale: input.locale ?? 'zh',
      })
      return { url: `/api/marketplace/oauth/authorize?${params.toString()}` }
    }),
  updateDraft: tenantAdminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1).max(120).optional(),
        region: z.string().max(32).optional(),
        currency: z.string().max(8).optional(),
        externalShopId: z.string().max(120).optional(),
        sellerId: z.string().max(120).optional(),
        shopGroup: z.string().max(120).optional(),
        fulfillmentMode: z.string().max(32).optional(),
        owner: z.string().max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => shopsDa.updateShopDraft(ctx.db, ctx.organizationId, input)),
    ),
  removeCredential: tenantAdminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => shopsDa.removeShopCredential(ctx.db, ctx.organizationId, input)),
    ),
  setSyncPaused: tenantAdminProcedure
    .input(z.object({ id: z.string().min(1), paused: z.boolean() }))
    .mutation(async ({ ctx, input }) => wrap(() => shopsDa.setShopSyncPaused(ctx.db, ctx.organizationId, input))),
  queueReauth: tenantAdminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => wrap(() => shopsDa.queueShopReauth(ctx.db, ctx.organizationId, input))),
  disable: tenantAdminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => wrap(() => shopsDa.disableShop(ctx.db, ctx.organizationId, input))),
})
