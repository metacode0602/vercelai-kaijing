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
  brandId: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  category: z.string().min(1),
  owner: z.string().min(1),
  material: z.string().min(1),
  style: z.string().min(1),
  status: statusSchema.optional(),
  coverImage: z.string().optional(),
  images: z.array(z.string()).optional(),
  hsCode: z.string().optional(),
  categoryId: z.string().min(1).nullable().optional(),
}).refine((v) => Boolean(v.brandId || v.brand), { message: '请选择品牌', path: ['brandId'] })

const updateProductInput = z.object({
  spu: z.string().min(1),
  name: z.string().min(1).optional(),
  brandId: z.string().min(1).nullable().optional(),
  brand: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  categoryId: z.string().min(1).nullable().optional(),
  owner: z.string().min(1).optional(),
  material: z.string().min(1).optional(),
  style: z.string().min(1).optional(),
  status: statusSchema.optional(),
  coverImage: z.string().optional(),
  images: z.array(z.string()).optional(),
  hsCode: z.string().optional(),
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
  remark: z.string().optional(),
  coverImage: z.string().optional(),
  images: z.array(z.string()).optional(),
  hsCode: z.string().optional(),
  cartonSpecId: z.string().min(1).nullable().optional(),
})

const batchCreateVariantsInput = z.object({
  spu: z.string().min(1),
  colors: z.array(z.string().min(1)).min(1),
  sizes: z.array(z.string().min(1)).min(1),
  packs: z.array(z.string().min(1)).min(1),
  barcode: z.string().optional(),
  weight: z.number().optional(),
  lengthMm: z.number().optional(),
  widthMm: z.number().optional(),
  heightMm: z.number().optional(),
  status: statusSchema.optional(),
  hsCode: z.string().optional(),
  cartonSpecId: z.string().min(1).nullable().optional(),
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
  remark: z.string().optional(),
  coverImage: z.string().optional(),
  images: z.array(z.string()).optional(),
  hsCode: z.string().optional(),
  cartonSpecId: z.string().min(1).nullable().optional(),
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
    try {
      return await productsDa.createProduct(ctx.db, ctx.organizationId, input, ctx.user?.id)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '创建失败'
      throw new TRPCError({ code: /不存在|停用|请选择/.test(message) ? 'BAD_REQUEST' : 'BAD_REQUEST', message })
    }
  }),

  update: tenantProcedure.input(updateProductInput).mutation(async ({ ctx, input }) => {
    try {
      const { spu, ...patch } = input
      const row = await productsDa.updateProduct(ctx.db, ctx.organizationId, spu, patch)
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `未找到 SPU ${spu}` })
      }
      return row
    } catch (error: unknown) {
      if (error instanceof TRPCError) throw error
      const message = error instanceof Error ? error.message : '更新失败'
      throw new TRPCError({ code: 'BAD_REQUEST', message })
    }
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
    try {
      const row = await productsDa.createVariant(ctx.db, ctx.organizationId, input)
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `未找到 SPU ${input.spu}` })
      }
      return row
    } catch (error: unknown) {
      if (error instanceof TRPCError) throw error
      const message = error instanceof Error ? error.message : '创建 SKU 失败'
      throw new TRPCError({
        code: /已存在|请至少/.test(message) ? 'CONFLICT' : 'BAD_REQUEST',
        message,
      })
    }
  }),

  batchCreateVariants: tenantProcedure.input(batchCreateVariantsInput).mutation(async ({ ctx, input }) => {
    try {
      const result = await productsDa.batchCreateVariants(ctx.db, ctx.organizationId, input)
      if (!result) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `未找到 SPU ${input.spu}` })
      }
      return result
    } catch (error: unknown) {
      if (error instanceof TRPCError) throw error
      const message = error instanceof Error ? error.message : '批量生成 SKU 失败'
      throw new TRPCError({
        code: /请至少/.test(message) ? 'BAD_REQUEST' : 'BAD_REQUEST',
        message,
      })
    }
  }),

  updateVariant: tenantProcedure.input(updateVariantInput).mutation(async ({ ctx, input }) => {
    try {
      const { spu, code, ...patch } = input
      const row = await productsDa.updateVariant(ctx.db, ctx.organizationId, spu, code, patch)
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `未找到 SKU ${code}` })
      }
      return row
    } catch (error: unknown) {
      if (error instanceof TRPCError) throw error
      const message = error instanceof Error ? error.message : '更新 SKU 失败'
      throw new TRPCError({
        code: /已存在/.test(message) ? 'CONFLICT' : 'BAD_REQUEST',
        message,
      })
    }
  }),
})
