import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as cartonDa from '@/lib/server/dataaccess/carton-specs'
import { UI_ACTIVE_STATUSES } from '@/lib/server/mappers/ops-master'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  status: z.string().optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const cartonSpecsRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return cartonDa.listCartonSpecs(ctx.db, ctx.organizationId, input)
  }),
  meta: tenantProcedure.query(async () => ({
    statuses: [...UI_ACTIVE_STATUSES],
    note: '箱规主数据；独立于 ocean_shipment_boxes。海运/运费可按 code 引用。',
  })),
  get: tenantProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const row = await cartonDa.getCartonSpec(ctx.db, ctx.organizationId, input.id)
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到箱规 ${input.id}` })
    return row
  }),
  create: tenantProcedure
    .input(
      z.object({
        name: z.string().min(1),
        applicablePack: z.string().optional(),
        lengthCm: z.number().optional(),
        widthCm: z.number().optional(),
        heightCm: z.number().optional(),
        grossWeightKg: z.number().optional(),
        unitsPerCarton: z.number().int().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
        code: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => wrap(() => cartonDa.createCartonSpec(ctx.db, ctx.organizationId, input))),
  update: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().optional(),
        applicablePack: z.string().optional(),
        lengthCm: z.number().optional(),
        widthCm: z.number().optional(),
        heightCm: z.number().optional(),
        grossWeightKg: z.number().optional(),
        unitsPerCarton: z.number().int().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => wrap(() => cartonDa.updateCartonSpec(ctx.db, ctx.organizationId, input))),
  remove: tenantProcedure.input(z.object({ id: z.string().min(1) })).mutation(async ({ ctx, input }) =>
    wrap(() => cartonDa.removeCartonSpec(ctx.db, ctx.organizationId, input.id)),
  ),
})
