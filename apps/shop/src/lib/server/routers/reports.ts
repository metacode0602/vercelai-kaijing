import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as reportsDa from '@/lib/server/dataaccess/reports'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  flag: z.string().optional(),
})

export const reportsRouter = createTRPCRouter({
  sellThrough: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return reportsDa.listSellThrough(ctx.db, ctx.organizationId, input)
  }),
  stockRisk: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return reportsDa.listStockRisk(ctx.db, ctx.organizationId, input)
  }),
})
