import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as aftersaleDa from '@/lib/server/dataaccess/aftersale'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    const notFound = /不存在/.test(message)
    throw new TRPCError({ code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const aftersaleRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return aftersaleDa.listTickets(ctx.db, ctx.organizationId, input)
  }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    return aftersaleDa.ticketStats(ctx.db, ctx.organizationId)
  }),

  meta: tenantProcedure.query(async () => aftersaleDa.aftersaleMeta()),

  get: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await aftersaleDa.getTicket(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到售后单 ${input.id}` })
      return row
    }),

  listReturns: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return aftersaleDa.listReturns(ctx.db, ctx.organizationId, input)
  }),

  returnStats: tenantProcedure.query(async ({ ctx }) => {
    return aftersaleDa.returnStats(ctx.db, ctx.organizationId)
  }),

  getReturn: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await aftersaleDa.getReturn(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到退货单 ${input.id}` })
      return row
    }),

  listCancels: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return aftersaleDa.listCancels(ctx.db, ctx.organizationId, input)
  }),

  cancelStats: tenantProcedure.query(async ({ ctx }) => {
    return aftersaleDa.cancelStats(ctx.db, ctx.organizationId)
  }),

  getCancel: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await aftersaleDa.getCancel(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到取消单 ${input.id}` })
      return row
    }),

  upsert: tenantProcedure
    .input(
      z.object({
        shopId: z.string().optional(),
        shopName: z.string().optional(),
        externalReverseOrderId: z.string().min(1),
        externalTradeOrderId: z.string().optional(),
        orderId: z.string().optional(),
        requestType: z.string().optional(),
        typeLabel: z.string().optional(),
        platformStatus: z.string().optional(),
        fulfillmentStatus: z.string().optional(),
        uiId: z.string().optional(),
        reason: z.string().optional(),
        reasonCode: z.string().optional(),
        refundAmount: z.number().optional(),
        currency: z.string().optional(),
        sku: z.string().optional(),
        warehouse: z.string().optional(),
        bin: z.string().optional(),
        qty: z.number().optional(),
        returned: z.number().optional(),
        releaseReserved: z.number().optional(),
        packageCondition: z.string().optional(),
        remark: z.string().optional(),
        tracking: z.string().optional(),
        status: z.string().optional(),
        lines: z
          .array(
            z.object({
              externalReverseLineId: z.string().min(1),
              externalOrderLineId: z.string().optional(),
              orderLineId: z.string().optional(),
              reasonCode: z.string().optional(),
              reasonText: z.string().optional(),
              refundAmount: z.number().optional(),
              currency: z.string().optional(),
              qty: z.number().optional(),
              sku: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => aftersaleDa.upsertAftersale(ctx.db, ctx.organizationId, input)),
    ),

  /**
   * 平台售后列表未接线：调用会诚实失败，不写演示逆向单。
   * 手工登记请用 createTicket / createCancel。
   */
  syncStub: tenantProcedure
    .input(
      z
        .object({
          shopId: z.string().optional(),
          limit: z.number().int().min(1).max(20).optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => aftersaleDa.syncAftersaleFromPlatform(ctx.db, ctx.organizationId, input ?? {})),
    ),

  createTicket: tenantProcedure
    .input(
      z.object({
        order: z.string().min(1),
        sku: z.string().min(1),
        type: z.string().min(1),
        reason: z.string().min(1),
        refund: z.number(),
        currency: z.string().min(1),
        returned: z.number().optional(),
        qc: z.string().optional(),
        status: z.string().optional(),
        shop: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => aftersaleDa.createTicket(ctx.db, ctx.organizationId, input)),
    ),

  createCancel: tenantProcedure
    .input(
      z.object({
        order: z.string().min(1),
        shop: z.string().min(1),
        sku: z.string().min(1),
        type: z.string().min(1),
        reason: z.string().min(1),
        refund: z.number(),
        currency: z.string().min(1),
        releaseReserved: z.number().optional(),
        warehouse: z.string().optional(),
        bin: z.string().optional(),
        remark: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => aftersaleDa.createCancel(ctx.db, ctx.organizationId, input)),
    ),

  registerReceive: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        order: z.string().optional(),
        shop: z.string().optional(),
        sku: z.string().optional(),
        warehouse: z.string().optional(),
        bin: z.string().min(1),
        tracking: z.string().min(1),
        qty: z.number(),
        packageCondition: z.string().optional(),
        remark: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => aftersaleDa.registerReturnReceive(ctx.db, ctx.organizationId, input)),
    ),

  completeQc: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        qcPass: z.number(),
        qcDefect: z.number(),
        actor: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        aftersaleDa.completeReturnQc(ctx.db, ctx.organizationId, {
          id: input.id,
          qcPass: input.qcPass,
          qcDefect: input.qcDefect,
          actor: input.actor ?? ctx.user?.id ?? ctx.user?.email ?? undefined,
        }),
      ),
    ),

  approveCancel: tenantProcedure
    .input(z.object({ id: z.string().min(1), actor: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        aftersaleDa.approveCancel(
          ctx.db,
          ctx.organizationId,
          input.id,
          input.actor ?? ctx.user?.id ?? ctx.user?.email ?? undefined,
        ),
      ),
    ),

  rejectCancel: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        reason: z.string().optional(),
        actor: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        aftersaleDa.rejectCancel(
          ctx.db,
          ctx.organizationId,
          input.id,
          input.reason,
          input.actor ?? ctx.user?.id ?? ctx.user?.email ?? undefined,
        ),
      ),
    ),

  updateRefundStatus: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        status: z.string().min(1),
        refundedAt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => aftersaleDa.updateRefundStatus(ctx.db, ctx.organizationId, input)),
    ),

  // ---- 售后策略 / 占库释放 / 退款决定 ----
  policyList: tenantProcedure.query(async ({ ctx }) =>
    aftersaleDa.listAftersalePolicies(ctx.db, ctx.organizationId),
  ),

  policyGet: tenantProcedure
    .input(z.object({ shopId: z.string().min(1) }))
    .query(async ({ ctx, input }) =>
      aftersaleDa.getAftersalePolicy(ctx.db, ctx.organizationId, input.shopId),
    ),

  policyUpsert: tenantProcedure
    .input(
      z.object({
        shopId: z.string().min(1),
        inventoryReleaseMode: z.enum(['manual', 'auto']),
        refundMode: z.enum(['manual', 'auto']),
        refundWaitDays: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => aftersaleDa.upsertAftersalePolicy(ctx.db, ctx.organizationId, input)),
    ),

  releaseReserved: tenantProcedure
    .input(z.object({ id: z.string().min(1), actor: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        aftersaleDa.releaseReserved(
          ctx.db,
          ctx.organizationId,
          input.id,
          input.actor ?? ctx.user?.id ?? ctx.user?.email ?? undefined,
        ),
      ),
    ),

  decideRefund: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        action: z.enum(['agree', 'reject']),
        reason: z.string().optional(),
        actor: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        aftersaleDa.decideRefund(ctx.db, ctx.organizationId, {
          id: input.id,
          action: input.action,
          reason: input.reason,
          actor: input.actor ?? ctx.user?.id ?? ctx.user?.email ?? undefined,
        }),
      ),
    ),

  cancelScheduledRefund: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        aftersaleDa.cancelScheduledRefund(ctx.db, ctx.organizationId, input.id),
      ),
    ),
})
