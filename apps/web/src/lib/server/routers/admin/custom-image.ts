import { z } from 'zod'
import { createTRPCRouter, adminProcedure } from '../trpc'
import { customImageDataAccess } from '@/lib/server/dataaccess/admin/custom-image'

export const customImageRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        tenantId: z.string().optional(),
        status: z.string().optional(),
        source: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      return customImageDataAccess.list(input)
    }),

  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return customImageDataAccess.getById(input.id)
    }),

  togglePin: adminProcedure
    .input(z.object({ id: z.string(), isPinned: z.boolean() }))
    .mutation(async ({ input }) => {
      return customImageDataAccess.togglePin(input.id, input.isPinned)
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return customImageDataAccess.delete(input.id)
    }),
})
