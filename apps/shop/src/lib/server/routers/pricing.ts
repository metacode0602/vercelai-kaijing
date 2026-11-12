import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as pricingDa from '@/lib/server/dataaccess/pricing'
import * as pricingDraftsDa from '@/lib/server/dataaccess/pricing-drafts'
import * as productsDa from '@/lib/server/dataaccess/products'
import { FORMULA_IDS } from '@workspace/freight'

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
        formulaVersion: z.enum(FORMULA_IDS).optional(),
        useFreightRateCardEstimate: z.boolean().optional(),
        temporaryFees,
        asOf: z.string().optional(),
        currentSellPrice: z.number().optional(),
        currentSellCurrency: z.string().optional(),
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

  listByShipment: tenantProcedure
    .input(
      z.object({
        shipmentId: z.string().min(1),
        platform: z.string().optional(),
        country: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) =>
      wrap(() => pricingDa.listShipmentPricingSuggestions(ctx.db, ctx.organizationId, input)),
    ),

  saveDraft: tenantProcedure
    .input(
      z.object({
        sku: z.string().min(1),
        platform: z.string().min(1),
        site: z.string().min(1),
        suggestedRetail: z.number(),
        suggestedFreeShipping: z.number().nullable().optional(),
        currency: z.string().min(1),
        isEstimate: z.boolean().optional(),
        snapshot: z.record(z.string(), z.unknown()).optional(),
        source: z.enum(['calculator', 'listing_fill', 'batch']),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        pricingDraftsDa.savePricingSuggestionDraft(ctx.db, ctx.organizationId, input, ctx.user?.id),
      ),
    ),

  listDrafts: tenantProcedure
    .input(
      z.object({
        sku: z.string().optional(),
        platform: z.string().optional(),
        site: z.string().optional(),
        includeArchived: z.boolean().optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      }),
    )
    .query(async ({ ctx, input }) =>
      pricingDraftsDa.listPricingSuggestionDrafts(ctx.db, ctx.organizationId, input),
    ),

  listDraftHistory: tenantProcedure
    .input(
      z.object({
        sku: z.string().min(1),
        platform: z.string().min(1),
        site: z.string().min(1),
        includeArchived: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) =>
      pricingDraftsDa.listPricingSuggestionHistory(ctx.db, ctx.organizationId, input),
    ),

  archiveDrafts: tenantProcedure
    .input(
      z.object({
        sku: z.string().min(1),
        platform: z.string().min(1),
        site: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        pricingDraftsDa.archivePricingSuggestionDrafts(ctx.db, ctx.organizationId, input, ctx.user?.id),
      ),
    ),
})
