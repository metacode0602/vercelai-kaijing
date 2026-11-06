import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as dashboardDa from '@/lib/server/dataaccess/dashboard'

const rangeInput = z.object({
  range: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(7),
})

export const dashboardRouter = createTRPCRouter({
  kpis: tenantProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    return dashboardDa.getDashboardKpis(ctx.db, ctx.organizationId, input.range)
  }),

  trends: tenantProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    return dashboardDa.getDashboardTrends(ctx.db, ctx.organizationId, input.range)
  }),

  todos: tenantProcedure.query(async ({ ctx }) => {
    return dashboardDa.getDashboardTodos(ctx.db, ctx.organizationId)
  }),

  inventory: tenantProcedure.query(async ({ ctx }) => {
    return dashboardDa.getDashboardInventorySummary(ctx.db, ctx.organizationId)
  }),

  inventoryByCategory: tenantProcedure.query(async ({ ctx }) => {
    return dashboardDa.getDashboardInventoryByCategory(ctx.db, ctx.organizationId)
  }),

  platformMix: tenantProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    return dashboardDa.getDashboardPlatformMix(ctx.db, ctx.organizationId, input.range)
  }),

  alerts: tenantProcedure.query(async ({ ctx }) => {
    return dashboardDa.getDashboardAlerts(ctx.db, ctx.organizationId)
  }),

  costCalcSeed: tenantProcedure
    .input(z.object({ sku: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return dashboardDa.getCostCalcSeed(ctx.db, ctx.organizationId, input.sku)
    }),


  navBadges: tenantProcedure.query(async ({ ctx }) => {
    return dashboardDa.getNavBadges(ctx.db, ctx.organizationId)
  }),
})
