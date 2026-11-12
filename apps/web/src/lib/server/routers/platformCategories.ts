import { z } from 'zod'
import {
  createPlatformCategory,
  deletePlatformCategory,
  ensurePlatformCategoryDefaults,
  listPlatformCategories,
  updatePlatformCategory,
} from '@/lib/server/dataaccess/platform-categories'
import { createTRPCRouter, protectedProcedure } from './trpc'

const categoryInput = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  parentId: z.string().trim().min(1).nullable().optional(),
  sort: z.number().int().min(0).max(9999).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  note: z.string().max(500).optional(),
})

export const platformCategoriesRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        status: z.enum(['active', 'inactive']).optional(),
        q: z.string().max(120).optional(),
      }),
    )
    .query(({ input }) => listPlatformCategories(input)),

  create: protectedProcedure.input(categoryInput).mutation(({ input }) => createPlatformCategory(input)),

  update: protectedProcedure
    .input(categoryInput.extend({ id: z.string().trim().min(1) }))
    .mutation(({ input }) => updatePlatformCategory(input)),

  remove: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => deletePlatformCategory(input.id)),

  ensureDefaults: protectedProcedure.mutation(() => ensurePlatformCategoryDefaults()),
})
