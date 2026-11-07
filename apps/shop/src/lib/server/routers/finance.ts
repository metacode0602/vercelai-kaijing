import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
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

  updateSettlementStatus: tenantProcedure
    .input(z.object({ id: z.string().min(1), status: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        financeDa.updateSettlementStatus(ctx.db, ctx.organizationId, input.id, input.status),
      ),
    ),

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
              feesTotal: z.number().optional(),
              payoutAmount: z.number().optional(),
              status: z.string().optional(),
              note: z.string().optional(),
              lines: z
                .array(
                  z.object({
                    externalOrderNo: z.string().optional(),
                    feeKind: z.string().optional(),
                    feeType: z.string().optional(),
                    feeName: z.string().optional(),
                    amount: z.number().optional(),
                    currency: z.string().optional(),
                    note: z.string().optional(),
                    sellerSku: z.string().optional(),
                  }),
                )
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
