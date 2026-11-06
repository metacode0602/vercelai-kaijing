import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as productsDa from '@/lib/server/dataaccess/products'
import { UI_PRODUCT_STATUSES } from '@/lib/server/mappers/products'

const statusSchema = z.enum(UI_PRODUCT_STATUSES)

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  status: z.string().optional(),
})

const createProductInput = z.object({
  name: z.string().min(1),
  brand: z.string().min(1),
  category: z.string().min(1),
  owner: z.string().min(1),
  material: z.string().min(1),
  style: z.string().min(1),
  status: statusSchema.optional(),
  coverImage: z.string().optional(),
  images: z.array(z.string()).optional(),
})

const updateProductInput = z.object({
  spu: z.string().min(1),
  name: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  owner: z.string().min(1).optional(),
  material: z.string().min(1).optional(),
  style: z.string().min(1).optional(),
  status: statusSchema.optional(),
  coverImage: z.string().optional(),
  images: z.array(z.string()).optional(),
})

const createVariantInput = z.object({
  spu: z.string().min(1),
  color: z.string().min(1),
  size: z.string().min(1),
  pack: z.string().min(1),
  barcode: z.string().optional(),
  weight: z.number(),
  lengthMm: z.number().optional(),
  widthMm: z.number().optional(),
  heightMm: z.number().optional(),
  status: statusSchema.optional(),
  coverImage: z.string().optional(),
  images: z.array(z.string()).optional(),
})

const updateVariantInput = z.object({
  spu: z.string().min(1),
  code: z.string().min(1),
  color: z.string().min(1).optional(),
  size: z.string().min(1).optional(),
  pack: z.string().min(1).optional(),
  barcode: z.string().optional(),
  weight: z.number().optional(),
  lengthMm: z.number().optional(),
  widthMm: z.number().optional(),
  heightMm: z.number().optional(),
  status: statusSchema.optional(),
  coverImage: z.string().optional(),
  images: z.array(z.string()).optional(),
})

export const productsRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return productsDa.listProducts(ctx.db, ctx.organizationId, input)
  }),

  listCatalog: tenantProcedure
    .input(
      paginationInput.extend({
        listing: z.string().optional(),
        platform: z.string().optional(),
        shopId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return productsDa.listCatalogRows(ctx.db, ctx.organizationId, input)
    }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    return productsDa.productStats(ctx.db, ctx.organizationId)
  }),

  bySpu: tenantProcedure
    .input(z.object({ spu: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await productsDa.getProductBySpu(ctx.db, ctx.organizationId, input.spu)
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `未找到 SPU ${input.spu}` })
      }
      return row
    }),

  create: tenantProcedure.input(createProductInput).mutation(async ({ ctx, input }) => {
    return productsDa.createProduct(ctx.db, ctx.organizationId, input, ctx.user?.id)
  }),

  update: tenantProcedure.input(updateProductInput).mutation(async ({ ctx, input }) => {
    const { spu, ...patch } = input
    const row = await productsDa.updateProduct(ctx.db, ctx.organizationId, spu, patch)
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `未找到 SPU ${spu}` })
    }
    return row
  }),

  listSkus: tenantProcedure
    .input(
      paginationInput.extend({
        spu: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return productsDa.listSkus(ctx.db, ctx.organizationId, input)
    }),

  skuByCode: tenantProcedure
    .input(z.object({ code: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await productsDa.getSkuByCode(ctx.db, ctx.organizationId, input.code)
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `未找到 SKU ${input.code}` })
      }
      return row
    }),

  listSkuCodes: tenantProcedure.query(async ({ ctx }) => {
    return productsDa.listSkuCodes(ctx.db, ctx.organizationId)
  }),

  createVariant: tenantProcedure.input(createVariantInput).mutation(async ({ ctx, input }) => {
    const row = await productsDa.createVariant(ctx.db, ctx.organizationId, input)
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `未找到 SPU ${input.spu}` })
    }
    return row
  }),

  updateVariant: tenantProcedure.input(updateVariantInput).mutation(async ({ ctx, input }) => {
    const { spu, code, ...patch } = input
    const row = await productsDa.updateVariant(ctx.db, ctx.organizationId, spu, code, patch)
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `未找到 SKU ${code}` })
    }
    return row
  }),
})
