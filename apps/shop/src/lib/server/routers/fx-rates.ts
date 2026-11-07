import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as fxDa from '@/lib/server/dataaccess/fx-rates'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

const actor = (ctx: { user?: { id?: string; name?: string | null; email?: string | null } | null }) => ({
  actorUserId: ctx.user?.id,
  actorLabel: ctx.user?.name || ctx.user?.email || undefined,
})

export const fxRatesRouter = createTRPCRouter({
  list: tenantProcedure
    .input(
      z
        .object({
          page: z.number().optional(),
          pageSize: z.number().optional(),
          q: z.string().optional(),
          platform: z.string().optional(),
          includeDisabled: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => fxDa.listFxRates(ctx.db, ctx.organizationId, input ?? {})),

  get: tenantProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const row = await fxDa.getFxRate(ctx.db, ctx.organizationId, input.id)
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到汇率 ${input.id}` })
    return row
  }),

  create: tenantProcedure
    .input(
      z.object({
        platform: z.string().optional(),
        marketplaceCode: z.string().optional(),
        baseCurrency: z.string().min(1),
        quoteCurrency: z.string().min(1),
        rate: z.union([z.number(), z.string()]),
        effectiveDate: z.string().min(1),
        source: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => fxDa.createFxRate(ctx.db, ctx.organizationId, { ...input, ...actor(ctx) })),
    ),

  update: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        platform: z.string().optional(),
        marketplaceCode: z.string().optional(),
        baseCurrency: z.string().optional(),
        quoteCurrency: z.string().optional(),
        rate: z.union([z.number(), z.string()]).optional(),
        effectiveDate: z.string().optional(),
        source: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => fxDa.updateFxRate(ctx.db, ctx.organizationId, { ...input, ...actor(ctx) })),
    ),

  setActive: tenantProcedure
    .input(z.object({ id: z.string().min(1), active: z.boolean() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => fxDa.setFxRateActive(ctx.db, ctx.organizationId, { ...input, ...actor(ctx) })),
    ),

  importRows: tenantProcedure
    .input(
      z.object({
        rows: z
          .array(
            z.object({
              platform: z.string().optional(),
              marketplaceCode: z.string().optional(),
              baseCurrency: z.string().min(1),
              quoteCurrency: z.string().min(1),
              rate: z.union([z.number(), z.string()]),
              effectiveDate: z.string().min(1),
              note: z.string().optional(),
            }),
          )
          .min(1)
          .max(500),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        fxDa.importFxRateRows(ctx.db, ctx.organizationId, {
          rows: input.rows,
          ...actor(ctx),
        }),
      ),
    ),


  resolve: tenantProcedure
    .input(
      z.object({
        baseCurrency: z.string().min(1),
        quoteCurrency: z.string().min(1),
        asOf: z.string().optional(),
        platform: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const row = await fxDa.resolveFxRate(ctx.db, ctx.organizationId, input)
      if (!row) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `未找到有效汇率 ${input.baseCurrency}/${input.quoteCurrency}（asOf=${input.asOf || '今天'}）。请先在设置/汇率配置维护。`,
        })
      }
      return row
    }),

  meta: tenantProcedure.query(async () => ({
    sources: ['manual', 'import', 'api', 'platform_bill'],
    note: '汇率落库 fx_rates；列表/编辑/添加弹窗；支持 Excel 导入；软停用保留历史；不接外部实时汇率 API；不发假成功。',
    excelColumns: [
      'platform',
      'marketplaceCode',
      'baseCurrency',
      'quoteCurrency',
      'rate',
      'effectiveDate',
      'note',
    ],
  })),
})
