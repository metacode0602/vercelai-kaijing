import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as brandsDa from '@/lib/server/dataaccess/brands'
import { UI_ACTIVE_STATUSES } from '@/lib/server/mappers/ops-master'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  status: z.string().optional(),
  activeOnly: z.boolean().optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const brandsRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return brandsDa.listBrands(ctx.db, ctx.organizationId, input)
  }),

  stats: tenantProcedure.query(async ({ ctx }) => brandsDa.brandStats(ctx.db, ctx.organizationId)),

  meta: tenantProcedure.query(async ({ ctx }) => {
    const options = await brandsDa.listBrandsForSelect(ctx.db, ctx.organizationId)
    return { statuses: [...UI_ACTIVE_STATUSES], brands: options }
  }),

  get: tenantProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const row = await brandsDa.getBrand(ctx.db, ctx.organizationId, input.id)
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到品牌 ${input.id}` })
    return row
  }),

  create: tenantProcedure
    .input(
      z.object({
        name: z.string().min(1),
        code: z.string().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => brandsDa.createBrand(ctx.db, ctx.organizationId, input)),
    ),

  update: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => brandsDa.updateBrand(ctx.db, ctx.organizationId, input)),
    ),
})
