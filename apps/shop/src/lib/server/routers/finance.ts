import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, requirePermission, tenantProcedure } from '@/lib/server/trpc'
import { appendAuditEvent } from '@/lib/server/dataaccess/audit'
import * as financeDa from '@/lib/server/dataaccess/finance'
import * as mappingsDa from '@/lib/server/dataaccess/mappings'
import { UI_SETTLEMENT_STATUSES } from '@/lib/server/mappers/finance'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  status: z.string().optional(),
  shopId: z.string().optional(),
  currency: z.string().optional(),
  view: z.enum(['order', 'sku']).optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    const notFound = /不存在/.test(message)
    throw new TRPCError({ code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const financeRouter = createTRPCRouter({
  overview: tenantProcedure.query(async ({ ctx }) => {
    return financeDa.financeOverview(ctx.db, ctx.organizationId)
  }),

  settlementStats: tenantProcedure.query(async ({ ctx }) => {
    return financeDa.settlementStats(ctx.db, ctx.organizationId)
  }),

  listSettlements: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return financeDa.listSettlements(ctx.db, ctx.organizationId, input)
  }),

  getSettlement: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await financeDa.getSettlement(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到结算单 ${input.id}` })
      return row
    }),

  updateSettlementStatus: requirePermission('finance.approve')
    .input(z.object({ id: z.string().min(1), status: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await wrap(() =>
        financeDa.updateSettlementStatus(ctx.db, ctx.organizationId, input.id, input.status),
      )
      await appendAuditEvent(ctx.db, ctx.organizationId, {
        actorUserId: ctx.user?.id,
        actorLabel: ctx.user?.name || ctx.user?.email || ctx.user?.id,
        action: 'settlement.confirm',
        entityType: 'settlement',
        entityId: input.id,
        result: 'ok',
        detail: `更新结算单状态为 ${input.status}`,
        after: { status: input.status },
      })
      return result
    }),

  listCosts: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return financeDa.listSkuCosts(ctx.db, ctx.organizationId, input)
  }),


  importSettlements: tenantProcedure
    .input(
      z.object({
        rows: z
          .array(
            z.object({
              shopId: z.string().min(1),
              externalSettlementId: z.string().min(1),
              currency: z.string().optional(),
              periodStart: z.string().optional(),
              periodEnd: z.string().optional(),
              billAmount: z.number().optional(),
              itemRevenue: z.number().optional(),
              otherRevenueTotal: z.number().optional(),
              subtotal1: z.number().optional(),
              subtotal2: z.number().optional(),
              refundsAmount: z.number().optional(),
              feesOnRefundsTotal: z.number().optional(),
              shipmentFee: z.number().optional(),
              shipmentFeeCredit: z.number().optional(),
              feesTotal: z.number().optional(),
              guaranteeDeposit: z.number().optional(),
              openingBalance: z.number().optional(),
              closingBalance: z.number().optional(),
              payoutAmount: z.number().optional(),
              payoutStatus: z.string().optional(),
              paid: z.boolean().optional(),
              platformCreatedAt: z.string().optional(),
              platformUpdatedAt: z.string().optional(),
              status: z.string().optional(),
              note: z.string().optional(),
              lines: z
                .array(
                  z.object({
                    externalTransactionId: z.string().optional(),
                    externalOrderNo: z.string().optional(),
                    transactionType: z.string().optional(),
                    feeKind: z.string().optional(),
                    feeType: z.string().optional(),
                    feeName: z.string().optional(),
                    amount: z.number().optional(),
                    taxAmount: z.number().optional(),
                    whtAmount: z.number().optional(),
                    whtIncludedInAmount: z.boolean().optional(),
                    currency: z.string().optional(),
                    paidStatus: z.string().optional(),
                    paymentReference: z.string().optional(),
                    sellerSku: z.string().optional(),
                    platformSkuId: z.string().optional(),
                    shippingProvider: z.string().optional(),
                    shippingSpeed: z.string().optional(),
                    shipmentType: z.string().optional(),
                    note: z.string().optional(),
                  }),
                )
                .max(5000)
                .optional(),
            }),
          )
          .min(1)
          .max(200),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => financeDa.importSettlements(ctx.db, ctx.organizationId, input)),
    ),

  getProfit: tenantProcedure
    .input(z.object({ id: z.string().min(1), view: z.enum(['order', 'sku']).optional() }))
    .query(async ({ ctx, input }) => {
      const row = await financeDa.getProfit(ctx.db, ctx.organizationId, input)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到利润行 ${input.id}` })
      return row
    }),

  profitKpis: tenantProcedure
    .input(z.object({ view: z.enum(['order', 'sku']).optional() }).optional())
    .query(async ({ ctx, input }) => financeDa.profitKpis(ctx.db, ctx.organizationId, input?.view ?? 'order')),

  listProfits: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return financeDa.listProfits(ctx.db, ctx.organizationId, {
      page: input.page,
      pageSize: input.pageSize,
      q: input.q,
      view: input.view,
    })
  }),

  listFreight: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return financeDa.listFreightEstimates(ctx.db, ctx.organizationId, input)
  }),

  getFreight: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await financeDa.getFreightEstimate(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到运费估算 ${input.id}` })
      return row
    }),

  syncSettlementsFromPlatform: tenantProcedure
    .input(z.object({ shopId: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) =>
      wrap(() => financeDa.syncSettlementsFromPlatform(ctx.db, ctx.organizationId, input ?? {})),
    ),

  meta: tenantProcedure.query(async ({ ctx }) => {
    const shops = await mappingsDa.listShopsForSelect(ctx.db, ctx.organizationId)
    const settlementSync = await financeDa.settlementSyncCapability(ctx.db, ctx.organizationId)
    return { settlementStatuses: [...UI_SETTLEMENT_STATUSES], shops, settlementSync }
  }),


  getSkuCostBySku: tenantProcedure
    .input(z.object({ sku: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await financeDa.getSkuCostsBySku(ctx.db, ctx.organizationId, input.sku)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到成本 ${input.sku}` })
      return row
    }),

  byPlatform: tenantProcedure
    .input(z.object({ platform: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await financeDa.getFinanceByPlatform(ctx.db, ctx.organizationId, input.platform)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到平台财务 ${input.platform}` })
      return row
    }),
})
