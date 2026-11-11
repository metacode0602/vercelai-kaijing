import { z } from 'zod'
import {
  getCrossborderDashboardStats,
  listCrossborderPendingActions,
  listCrossborderSyncHealth,
} from '@/lib/server/dataaccess/crossborder-ops'
import { listAuthExceptions } from '@/lib/server/dataaccess/auth-exceptions'
import {
  getAuthException,
  getPendingAction,
  listShopIntegrationLogs,
} from '@/lib/server/dataaccess/platform-details'
import { createTRPCRouter, protectedProcedure } from './trpc'

const pageInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

export const platformOpsRouter = createTRPCRouter({
  dashboardStats: protectedProcedure.query(() => getCrossborderDashboardStats()),
  syncHealth: protectedProcedure
    .input(pageInput)
    .query(({ input }) => listCrossborderSyncHealth(input)),
  pendingActions: protectedProcedure
    .input(
      pageInput.extend({
        status: z.string().max(32).optional(),
        q: z.string().max(120).optional(),
        organizationId: z.string().min(1).optional(),
        shopId: z.string().min(1).optional(),
      }),
    )
    .query(({ input }) => listCrossborderPendingActions(input)),
  authExceptions: protectedProcedure
    .input(
      pageInput.extend({
        q: z.string().max(120).optional(),
        platform: z.string().max(32).optional(),
        organizationId: z.string().min(1).optional(),
        shopId: z.string().min(1).optional(),
      }),
    )
    .query(({ input }) => listAuthExceptions(input)),
  getAuthException: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const row = await getAuthException(input.id)
      if (!row) throw new Error('授权异常不存在')
      return row
    }),
  getPendingAction: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const row = await getPendingAction(input.id)
      if (!row) throw new Error('待审动作不存在')
      return row
    }),
  listIntegrationLogs: protectedProcedure
    .input(
      z.object({
        shopId: z.string().min(1),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(({ input }) => listShopIntegrationLogs(input)),
})
