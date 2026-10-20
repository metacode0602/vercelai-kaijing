import { z } from 'zod'
import { createTRPCRouter, adminProcedure } from '../trpc'
import { baseImageDataAccess } from '@/lib/server/dataaccess/admin/base-image'

export const baseImageRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        category: z.string().optional(),
        status: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      return baseImageDataAccess.list(input)
    }),

  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return baseImageDataAccess.getById(input.id)
    }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        displayName: z.string().min(1).max(255),
        description: z.string().max(1000).optional(),
        category: z.string().min(1).max(64),
        tags: z.array(z.string()).optional(),
        iconUrl: z.string().optional(),
        sortOrder: z.number().int().optional(),
        recommendedConfig: z.record(z.string(), z.unknown()).optional(),
        status: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return baseImageDataAccess.create(input)
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(255).optional(),
        displayName: z.string().min(1).max(255).optional(),
        description: z.string().max(1000).optional(),
        category: z.string().max(64).optional(),
        tags: z.array(z.string()).optional(),
        iconUrl: z.string().optional(),
        sortOrder: z.number().int().optional(),
        recommendedConfig: z.record(z.string(), z.unknown()).optional(),
        status: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input
      return baseImageDataAccess.update(id, data)
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return baseImageDataAccess.delete(input.id)
    }),

  listCategories: adminProcedure.query(async () => {
    return baseImageDataAccess.listCategories()
  }),
})
