import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as categoriesDa from '@/lib/server/dataaccess/categories'
import { UI_ACTIVE_STATUSES } from '@/lib/server/mappers/ops-master'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const categoriesRouter = createTRPCRouter({
  list: tenantProcedure
    .input(z.object({ q: z.string().optional(), status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => categoriesDa.listCategories(ctx.db, ctx.organizationId, input ?? {})),
  meta: tenantProcedure.query(async () => ({
    statuses: [...UI_ACTIVE_STATUSES],
    note: '内部品类树 commerce_categories；平台类目见 platform_categories（需平台同步）',
  })),
  get: tenantProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const row = await categoriesDa.getCategory(ctx.db, ctx.organizationId, input.id)
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到品类 ${input.id}` })
    return row
  }),
  create: tenantProcedure
    .input(
      z.object({
        name: z.string().min(1),
        code: z.string().min(1),
        parentId: z.string().nullable().optional(),
        sort: z.number().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
        coverImage: z.string().optional(),
        screenshots: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => wrap(() => categoriesDa.createCategory(ctx.db, ctx.organizationId, input))),
  update: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().optional(),
        code: z.string().optional(),
        parentId: z.string().nullable().optional(),
        sort: z.number().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
        coverImage: z.string().optional(),
        screenshots: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => wrap(() => categoriesDa.updateCategory(ctx.db, ctx.organizationId, input))),
})
