import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as reportsDa from '@/lib/server/dataaccess/reports'
import * as attributionDa from '@/lib/server/dataaccess/attribution'
import { attributionCategories } from '@workspace/db/schema'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  flag: z.string().optional(),
})

export const reportsRouter = createTRPCRouter({
  sellThrough: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return reportsDa.listSellThrough(ctx.db, ctx.organizationId, input)
  }),
  stockRisk: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return reportsDa.listStockRisk(ctx.db, ctx.organizationId, input)
  }),

  attribution: tenantProcedure
    .input(
      z.object({
        shopId: z.string().optional(),
        from: z.string().min(1),
        to: z.string().min(1),
        sku: z.string().optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(200).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return attributionDa.listAttribution(ctx.db, ctx.organizationId, {
        shopId: input.shopId,
        from: parseRangeBound(input.from, false),
        to: parseRangeBound(input.to, true),
        sku: input.sku,
        page: input.page,
        pageSize: input.pageSize,
      })
    }),

  attributionDrill: tenantProcedure
    .input(
      z.object({
        sku: z.string().min(1),
        shopId: z.string().optional(),
        from: z.string().min(1),
        to: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      return attributionDa.listAttributionDrill(ctx.db, ctx.organizationId, {
        sku: input.sku,
        shopId: input.shopId,
        from: parseRangeBound(input.from, false),
        to: parseRangeBound(input.to, true),
      })
    }),

  listReasonMaps: tenantProcedure.query(async ({ ctx }) => {
    return attributionDa.listReasonMaps(ctx.db, ctx.organizationId)
  }),

  upsertReasonMap: tenantProcedure
    .input(
      z.object({
        id: z.string().optional(),
        matchType: z.enum(['reason_code', 'keyword']),
        pattern: z.string().min(1),
        category: z.enum(attributionCategories),
        notes: z.string().optional(),
        status: z.enum(['enabled', 'disabled']).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => wrap(() => attributionDa.upsertReasonMap(ctx.db, ctx.organizationId, input))),

  overrideAttribution: tenantProcedure
    .input(
      z.object({
        subjectType: z.enum(['review', 'reverse_item']),
        subjectId: z.string().min(1),
        category: z.enum(attributionCategories),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        attributionDa.overrideAttribution(ctx.db, ctx.organizationId, {
          ...input,
          overriddenBy: ctx.user?.id,
        }),
      ),
    ),
})

function parseRangeBound(value: string, endOfDay: boolean): Date {
  const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(value.trim())
  const parsed = dateOnly
    ? new Date(`${dateOnly[1]}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
    : new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '时间范围无效' })
  }
  return parsed
}

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    if (error instanceof TRPCError) throw error
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}
