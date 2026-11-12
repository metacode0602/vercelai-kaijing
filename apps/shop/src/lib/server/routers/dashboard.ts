import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as dashboardDa from '@/lib/server/dataaccess/dashboard'

const filterInput = z
  .object({
    range: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(7),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    platform: z.string().optional(),
    site: z.string().optional(),
    shopId: z.string().optional(),
  })
  .optional()

export const dashboardRouter = createTRPCRouter({
  kpis: tenantProcedure.input(filterInput).query(async ({ ctx, input }) => {
    return dashboardDa.getDashboardKpis(ctx.db, ctx.organizationId, input ?? {})
  }),

  trends: tenantProcedure.input(filterInput).query(async ({ ctx, input }) => {
    return dashboardDa.getDashboardTrends(ctx.db, ctx.organizationId, input ?? {})
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

  platformMix: tenantProcedure.input(filterInput).query(async ({ ctx, input }) => {
    return dashboardDa.getDashboardPlatformMix(ctx.db, ctx.organizationId, input ?? {})
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

  filterOptions: tenantProcedure.query(async ({ ctx }) => {
    return dashboardDa.getDashboardFilterOptions(ctx.db, ctx.organizationId)
  }),

  meta: tenantProcedure.query(async ({ ctx }) => {
    return dashboardDa.getDashboardMeta(ctx.db, ctx.organizationId)
  }),
})
