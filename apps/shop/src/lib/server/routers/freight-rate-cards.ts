import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as frcDa from '@/lib/server/dataaccess/freight-rate-cards'
import { UI_ACTIVE_STATUSES } from '@/lib/server/mappers/ops-master'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  status: z.string().optional(),
  freightMode: z.string().optional(),
})

export const freightRateCardsRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return frcDa.listFreightRateCards(ctx.db, ctx.organizationId, input)
  }),
  resolveBundle: tenantProcedure
    .input(z.object({ asOf: z.string().optional(), freightMode: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => frcDa.resolveFreightRateBundle(ctx.db, ctx.organizationId, input ?? {})),
  meta: tenantProcedure.query(async () => ({
    statuses: [...UI_ACTIVE_STATUSES],
    freightModes: ['AIR_DDP', 'LCL', 'FCL20', 'FCL40'],
    note: '运价卡为正式运费主数据；成本测算与运费页读取本表，不再使用硬编码运价。',
  })),
  get: tenantProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const row = await frcDa.getFreightRateCard(ctx.db, ctx.organizationId, input.id)
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到运价卡 ${input.id}` })
    return row
  }),
  create: tenantProcedure
    .input(
      z.object({
        name: z.string().min(1),
        freightMode: z.string().min(1),
        carrierId: z.string().optional(),
        currency: z.string().optional(),
        unitRate: z.number().optional(),
        minCharge: z.number().optional(),
        surcharge: z.number().optional(),
        thc: z.number().optional(),
        volumetricDivisor: z.number().optional(),
        usableCbm: z.number().optional(),
        unitRatePerTon: z.number().optional(),
        originPort: z.string().optional(),
        destPort: z.string().optional(),
        effectiveFrom: z.string().min(1),
        effectiveTo: z.string().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
        code: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => wrap(() => frcDa.createFreightRateCard(ctx.db, ctx.organizationId, input))),
  update: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().optional(),
        freightMode: z.string().optional(),
        carrierId: z.string().nullable().optional(),
        currency: z.string().optional(),
        unitRate: z.number().optional(),
        minCharge: z.number().optional(),
        surcharge: z.number().optional(),
        thc: z.number().optional(),
        volumetricDivisor: z.number().nullable().optional(),
        usableCbm: z.number().nullable().optional(),
        unitRatePerTon: z.number().nullable().optional(),
        originPort: z.string().optional(),
        destPort: z.string().optional(),
        effectiveFrom: z.string().optional(),
        effectiveTo: z.string().nullable().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => wrap(() => frcDa.updateFreightRateCard(ctx.db, ctx.organizationId, input))),
})
