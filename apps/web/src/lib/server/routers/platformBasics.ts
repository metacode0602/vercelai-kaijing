import { z } from 'zod'
import { platformBasicKinds } from '@workspace/db'
import { platformBasicCreateSchema, platformBasicUpdateSchema } from '@workspace/db/platform-basics'
import {
  createPlatformBasics,
  deletePlatformBasics,
  ensurePlatformBasicsDefaults,
  listPlatformBasics,
  updatePlatformBasics,
} from '@/lib/server/dataaccess/platform-basics'
import { createTRPCRouter, protectedProcedure } from './trpc'

/**
 * 平台基础资料目录维护（平台管理员全局维护；组织副本的 CRUD 在 apps/shop `platformBasics`）。
 * @see docs/design/haoshiyun-platform-basics-ued.md §7
 */

const listInput = z.object({
  kind: z.enum(platformBasicKinds),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  q: z.string().max(120).optional(),
})

export const platformBasicsRouter = createTRPCRouter({
  list: protectedProcedure.input(listInput).query(({ input }) => listPlatformBasics(input)),

  create: protectedProcedure.input(platformBasicCreateSchema).mutation(({ input }) =>
    createPlatformBasics(input),
  ),

  update: protectedProcedure
    .input(platformBasicUpdateSchema)
    .mutation(({ input }) => {
      const { id, ...values } = input
      return updatePlatformBasics({ id, values })
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => deletePlatformBasics(input.id)),

  /** 补齐平台初始目录：只补缺失行，不覆盖平台已维护内容。 */
  ensureDefaults: protectedProcedure.mutation(() => ensurePlatformBasicsDefaults()),
})
