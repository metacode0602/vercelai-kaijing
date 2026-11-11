import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as pricingDa from '@/lib/server/dataaccess/pricing'
import * as productsDa from '@/lib/server/dataaccess/products'
import { FORMULA_LK_CASCADE_V1, FORMULA_LK_UPLIFT_V1 } from '@workspace/freight'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在|未找到/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

const temporaryFees = z
  .object({
    commissionPct: z.number().optional(),
    payoutPct: z.number().optional(),
    warehousePct: z.number().optional(),
    freeShippingPct: z.number().optional(),
    freeShippingCap: z.number().optional(),
    capCurrency: z.string().optional(),
    targetMarginPct: z.number().optional(),
  })
  .optional()

export const pricingRouter = createTRPCRouter({
  searchSkus: tenantProcedure
    .input(
      z.object({
        q: z.string().optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(async ({ ctx, input }) => productsDa.listSkus(ctx.db, ctx.organizationId, input)),

  suggest: tenantProcedure
    .input(
      z.object({
        sku: z.string().min(1),
        platform: z.string().min(1),
        country: z.string().min(1),
        shopId: z.string().optional(),
        targetMarginPct: z.number().optional(),
        formulaVersion: z.enum([FORMULA_LK_CASCADE_V1, FORMULA_LK_UPLIFT_V1]).optional(),
        useFreightRateCardEstimate: z.boolean().optional(),
        temporaryFees,
        asOf: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => wrap(() => pricingDa.suggestPricing(ctx.db, ctx.organizationId, input))),

  patchSkuMaster: tenantProcedure
    .input(
      z.object({
        sku: z.string().min(1),
        hsCode: z.string().optional(),
        weightGrams: z.number().int().nonnegative().nullable().optional(),
        cartonSpecId: z.string().min(1).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(async () => {
        const sku = await productsDa.getSkuByCode(ctx.db, ctx.organizationId, input.sku)
        if (!sku) throw new Error(`未找到 SKU ${input.sku}`)
        if (!sku.spu) throw new Error('SKU 缺少所属 SPU，无法写回主档')
        return productsDa.updateVariant(ctx.db, ctx.organizationId, sku.spu, sku.sku, {
          hsCode: input.hsCode,
          weight: input.weightGrams ?? undefined,
          cartonSpecId: input.cartonSpecId,
        })
      }),
    ),
})
