import { z } from 'zod'
import { createTRPCRouter, adminProcedure } from '../trpc'
import { eq, and, desc, count, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { preloadTask } from '@workspace/db'

export const preloadTaskRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.string().optional(),
        regionId: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input }) => {
      const page = Math.max(1, input.page ?? 1)
      const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20))
      const conditions: SQL[] = []

      if (input.search) {
        conditions.push(
          sql`(${preloadTask.imageRef} ILIKE ${'%' + input.search + '%'} OR ${preloadTask.fullImageRef} ILIKE ${'%' + input.search + '%'})`,
        )
      }
      if (input.status) conditions.push(eq(preloadTask.status, input.status))
      if (input.regionId) conditions.push(eq(preloadTask.regionId, input.regionId))

      const where = conditions.length > 0 ? and(...conditions) : undefined

      const [totalRow] = await db
        .select({ total: count() })
        .from(preloadTask)
        .where(where)

      const total = Number(totalRow?.total ?? 0)
      const offset = (page - 1) * pageSize

      const rows = await db
        .select()
        .from(preloadTask)
        .where(where)
        .orderBy(desc(preloadTask.createdAt))
        .limit(pageSize)
        .offset(offset)

      return { items: rows, total, page, pageSize }
    }),

  cancel: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db
        .update(preloadTask)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(preloadTask.id, input.id),
            sql`${preloadTask.status} IN ('pending', 'downloading')`,
          ),
        )
      return { success: true }
    }),
})
