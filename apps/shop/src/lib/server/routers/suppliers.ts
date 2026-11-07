import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as suppliersDa from '@/lib/server/dataaccess/suppliers'
import { UI_SUPPLIER_SKU_STATUSES, UI_SUPPLIER_STATUSES } from '@/lib/server/mappers/suppliers'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  status: z.string().optional(),
  supplierId: z.string().optional(),
  sku: z.string().optional(),
  preferredOnly: z.boolean().optional(),
  excludeDisabled: z.boolean().optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    const notFound = /不存在/.test(message)
    throw new TRPCError({ code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const suppliersRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return suppliersDa.listSuppliers(ctx.db, ctx.organizationId, input)
  }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    return suppliersDa.supplierStats(ctx.db, ctx.organizationId)
  }),

  meta: tenantProcedure.query(async ({ ctx }) => {
    const options = await suppliersDa.listSuppliersForSelect(ctx.db, ctx.organizationId)
    return {
      statuses: [...UI_SUPPLIER_STATUSES],
      skuStatuses: [...UI_SUPPLIER_SKU_STATUSES],
      suppliers: options,
    }
  }),

  get: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await suppliersDa.getSupplier(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到供应商 ${input.id}` })
      return row
    }),

  create: tenantProcedure
    .input(
      z.object({
        name: z.string().min(1),
        contact: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        settlement: z.string().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
        code: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => suppliersDa.createSupplier(ctx.db, ctx.organizationId, input)),
    ),

  update: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().optional(),
        contact: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        settlement: z.string().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => suppliersDa.updateSupplier(ctx.db, ctx.organizationId, input)),
    ),

  listSkus: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return suppliersDa.listSupplierSkus(ctx.db, ctx.organizationId, input)
  }),

  skuStats: tenantProcedure.query(async ({ ctx }) => {
    return suppliersDa.supplierSkuStats(ctx.db, ctx.organizationId)
  }),

  getSku: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await suppliersDa.getSupplierSku(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到供应商货号 ${input.id}` })
      return row
    }),

  createSku: tenantProcedure
    .input(
      z.object({
        sku: z.string().min(1),
        supplierId: z.string().optional(),
        supplierName: z.string().optional(),
        factoryCode: z.string().min(1),
        price: z.number(),
        currency: z.string().optional(),
        moq: z.number().int().optional(),
        leadDays: z.number().int().optional(),
        effective: z.string().optional(),
        preferred: z.boolean().optional(),
        status: z.string().optional(),
        remark: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => suppliersDa.createSupplierSku(ctx.db, ctx.organizationId, input)),
    ),

  updateSku: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        factoryCode: z.string().optional(),
        price: z.number().optional(),
        currency: z.string().optional(),
        moq: z.number().int().optional(),
        leadDays: z.number().int().optional(),
        effective: z.string().optional(),
        preferred: z.boolean().optional(),
        status: z.string().optional(),
        remark: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => suppliersDa.updateSupplierSku(ctx.db, ctx.organizationId, input)),
    ),

  preferredForSku: tenantProcedure
    .input(z.object({ sku: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return suppliersDa.getPreferredForSku(ctx.db, ctx.organizationId, input.sku)
    }),

  /** 逻辑删除：status → 停用，默认列表不再展示 */
  hideSku: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => suppliersDa.hideSupplierSku(ctx.db, ctx.organizationId, input.id)),
    ),

  skuPurchaseBatches: tenantProcedure
    .input(z.object({ supplierSkuId: z.string().min(1) }))
    .query(async ({ ctx, input }) =>
      wrap(() => suppliersDa.listSkuPurchaseBatches(ctx.db, ctx.organizationId, input)),
    ),

  linkPurchaseRequest: tenantProcedure
    .input(
      z.object({
        purchaseRequestId: z.string().min(1),
        supplierId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(async () => {
        await suppliersDa.linkPurchaseRequestSupplier(
          ctx.db,
          ctx.organizationId,
          input.purchaseRequestId,
          input.supplierId,
        )
        return { ok: true as const }
      }),
    ),
})
