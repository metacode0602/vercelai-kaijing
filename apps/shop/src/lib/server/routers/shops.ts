import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as shopsDa from '@/lib/server/dataaccess/shop-connections'
import { UI_SHOP_AUTH_STATUSES } from '@/lib/server/mappers/ops-master'

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
    note: '读 shops / integration_*；OAuth 未联调时仅展示待授权，禁止假成功',
  })),
  get: tenantProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const row = await shopsDa.getShopConnection(ctx.db, ctx.organizationId, input.id)
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到店铺 ${input.id}` })
    return row
  }),
  createDraft: tenantProcedure
    .input(
      z.object({
        name: z.string().min(1),
        platform: z.string().min(1),
        region: z.string().optional(),
        currency: z.string().optional(),
        externalShopId: z.string().optional(),
        sellerId: z.string().optional(),
        shopGroup: z.string().optional(),
        fulfillmentMode: z.string().optional(),
        owner: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => wrap(() => shopsDa.createShopDraft(ctx.db, ctx.organizationId, input))),
  setSyncPaused: tenantProcedure
    .input(z.object({ id: z.string().min(1), paused: z.boolean() }))
    .mutation(async ({ ctx, input }) => wrap(() => shopsDa.setShopSyncPaused(ctx.db, ctx.organizationId, input))),
  queueReauth: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => wrap(() => shopsDa.queueShopReauth(ctx.db, ctx.organizationId, input))),
})
