import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as pendingDa from '@/lib/server/dataaccess/pending'
import { appendAuditEvent } from '@/lib/server/dataaccess/audit'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  kind: z.string().optional(),
  status: z.string().optional(),
  shopId: z.string().optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const pendingRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return pendingDa.listPendingActions(ctx.db, ctx.organizationId, input)
  }),
  stats: tenantProcedure.query(async ({ ctx }) => pendingDa.pendingStats(ctx.db, ctx.organizationId)),
  get: tenantProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const row = await pendingDa.getPendingAction(ctx.db, ctx.organizationId, input.id)
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到待审单 ${input.id}` })
    return row
  }),
  confirm: tenantProcedure
    .input(z.object({ id: z.string().min(1), actor: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const actor = input.actor ?? ctx.user?.id
      const result = await wrap(() =>
        pendingDa.confirmPendingAction(ctx.db, ctx.organizationId, input.id, actor),
      )
      await appendAuditEvent(ctx.db, ctx.organizationId, {
        actorUserId: ctx.user?.id,
        actorLabel: ctx.user?.name || ctx.user?.email || ctx.user?.id,
        action: 'pending.confirm',
        entityType: 'pending_action',
        entityId: input.id,
        result: 'ok',
        detail: `确认待审单 ${result.kindLabel}：${result.title}`,
        after: { status: result.status, kind: result.kind, listingId: result.listingId },
      })
      return result
    }),
  reject: tenantProcedure
    .input(z.object({ id: z.string().min(1), reason: z.string().optional(), actor: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const actor = input.actor ?? ctx.user?.id
      const result = await wrap(() =>
        pendingDa.rejectPendingAction(
          ctx.db,
          ctx.organizationId,
          input.id,
          input.reason,
          actor,
        ),
      )
      await appendAuditEvent(ctx.db, ctx.organizationId, {
        actorUserId: ctx.user?.id,
        actorLabel: ctx.user?.name || ctx.user?.email || ctx.user?.id,
        action: 'pending.reject',
        entityType: 'pending_action',
        entityId: input.id,
        result: 'ok',
        detail: `拒绝待审单 ${result.kindLabel}：${input.reason || '人工拒绝'}`,
        after: { status: result.status, kind: result.kind },
      })
      return result
    }),
  /** 补全 listing_submit（mode=create）payload（店铺 / SKU / 售价等）。 */
  complete: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        shopId: z.string().optional(),
        sku: z.string().optional(),
        sellerSku: z.string().optional(),
        title: z.string().optional(),
        sellPrice: z.number().optional(),
        currency: z.string().optional(),
        brandName: z.string().optional(),
        categoryPath: z.string().optional(),
        categoryExternalId: z.string().optional(),
        note: z.string().optional(),
        color: z.string().optional(),
        size: z.string().optional(),
        warehouseCode: z.string().optional(),
        logisticsChannel: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input
      const result = await wrap(() =>
        pendingDa.completeListingSubmit(ctx.db, ctx.organizationId, id, patch),
      )
      await appendAuditEvent(ctx.db, ctx.organizationId, {
        actorUserId: ctx.user?.id,
        actorLabel: ctx.user?.name || ctx.user?.email || ctx.user?.id,
        action: 'pending.complete',
        entityType: 'pending_action',
        entityId: id,
        result: 'ok',
        detail: `补全刊登提交待审字段：${Object.keys(patch).join(', ')}`,
        after: patch as Record<string, unknown>,
      })
      return result
    }),
})
