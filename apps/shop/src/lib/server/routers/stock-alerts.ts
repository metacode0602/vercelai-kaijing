import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as stockAlertsDa from '@/lib/server/dataaccess/stock-alerts'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

const actor = (ctx: {
  user?: { id?: string; name?: string | null; email?: string | null } | null
}) => ({
  actorUserId: ctx.user?.id,
  actorLabel: ctx.user?.name || ctx.user?.email || undefined,
})

export const stockAlertsRouter = createTRPCRouter({
  list: tenantProcedure
    .input(
      z.object({
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        q: z.string().optional(),
        status: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) =>
      stockAlertsDa.listStockAlerts(ctx.db, ctx.organizationId, input),
    ),

  get: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await stockAlertsDa.getStockAlert(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到预警配置 ${input.id}` })
      return row
    }),

  /** 新建或更新某 variant 的阈值；阈值变更实时生效并写审计。 */
  upsert: tenantProcedure
    .input(
      z.object({
        variantId: z.string().min(1),
        threshold: z.number().int().min(0).max(1_000_000),
        reason: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        stockAlertsDa.upsertStockAlert(ctx.db, ctx.organizationId, {
          ...input,
          ...actor(ctx),
        }),
      ),
    ),

  /** 静音 / 取消静音；写审计。 */
  setMuted: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        muted: z.boolean(),
        reason: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        stockAlertsDa.setStockAlertMuted(ctx.db, ctx.organizationId, {
          ...input,
          ...actor(ctx),
        }),
      ),
    ),

  /** 删除预警配置；历史审计保留。 */
  delete: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        reason: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        stockAlertsDa.deleteStockAlert(ctx.db, ctx.organizationId, {
          ...input,
          ...actor(ctx),
        }),
      ),
    ),

  meta: tenantProcedure.query(async () => ({
    defaultThreshold: stockAlertsDa.DEFAULT_STOCK_THRESHOLD,
    ageDaysThreshold: stockAlertsDa.STOCK_AGE_DAYS_THRESHOLD,
    statuses: ['critical', 'open', 'muted', 'resolved'] as const,
    note:
      '库存预警阈值按内部 SKU 维护；阈值变更实时影响列表告警派生，历史阈值在变更审计中可查；muted 行不参与告警通知与徽章。',
  })),
})
