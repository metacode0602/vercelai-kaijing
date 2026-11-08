import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as carriersDa from '@/lib/server/dataaccess/carriers'
import { UI_ACTIVE_STATUSES, UI_CARRIER_TYPES } from '@/lib/server/mappers/ops-master'

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

export const carriersRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return carriersDa.listCarriers(ctx.db, ctx.organizationId, input)
  }),
  meta: tenantProcedure.query(async () => ({
    types: [...UI_CARRIER_TYPES],
    statuses: [...UI_ACTIVE_STATUSES],
    note: '承运商主档；运价卡可关联承运商；不提供假实时报价 API',
  })),
  get: tenantProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const row = await carriersDa.getCarrier(ctx.db, ctx.organizationId, input.id)
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到承运商 ${input.id}` })
    return row
  }),
  create: tenantProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: z.string().optional(),
        coverage: z.string().optional(),
        contact: z.string().optional(),
        phone: z.string().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
        code: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => wrap(() => carriersDa.createCarrier(ctx.db, ctx.organizationId, input))),
  update: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().optional(),
        type: z.string().optional(),
        coverage: z.string().optional(),
        contact: z.string().optional(),
        phone: z.string().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => wrap(() => carriersDa.updateCarrier(ctx.db, ctx.organizationId, input))),
  remove: tenantProcedure.input(z.object({ id: z.string().min(1) })).mutation(async ({ ctx, input }) =>
    wrap(() => carriersDa.removeCarrier(ctx.db, ctx.organizationId, input.id)),
  ),
})
