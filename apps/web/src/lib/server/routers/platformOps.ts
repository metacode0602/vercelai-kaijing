import { z } from 'zod'
import {
  getCrossborderDashboardStats,
  listCrossborderPendingActions,
  listCrossborderSyncHealth,
} from '@/lib/server/dataaccess/crossborder-ops'
import { listAuthExceptions } from '@/lib/server/dataaccess/auth-exceptions'
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
      }),
    )
    .query(({ input }) => listCrossborderPendingActions(input)),
  authExceptions: protectedProcedure
    .input(
      pageInput.extend({
        q: z.string().max(120).optional(),
        platform: z.string().max(32).optional(),
      }),
    )
    .query(({ input }) => listAuthExceptions(input)),
})
