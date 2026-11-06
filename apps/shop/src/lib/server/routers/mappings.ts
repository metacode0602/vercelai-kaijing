import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as mappingsDa from '@/lib/server/dataaccess/mappings'
import {
  UI_MAPPING_EXCEPTION_KINDS,
  UI_MAPPING_EXCEPTION_STATUSES,
  UI_MAPPING_STATUSES,
} from '@/lib/server/mappers/listings'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  status: z.string().optional(),
  shopId: z.string().optional(),
  listingId: z.string().optional(),
  internalSku: z.string().optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    const notFound = /不存在/.test(message)
    throw new TRPCError({ code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const mappingsRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return mappingsDa.listMappings(ctx.db, ctx.organizationId, input)
  }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    return mappingsDa.mappingStats(ctx.db, ctx.organizationId)
  }),

  meta: tenantProcedure.query(async () => ({
    statuses: [...UI_MAPPING_STATUSES],
    exceptionStatuses: [...UI_MAPPING_EXCEPTION_STATUSES],
    exceptionKinds: [...UI_MAPPING_EXCEPTION_KINDS],
  })),

  listShops: tenantProcedure.query(async ({ ctx }) => {
    return mappingsDa.listShopsForSelect(ctx.db, ctx.organizationId)
  }),

  get: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      let row = await mappingsDa.getMapping(ctx.db, ctx.organizationId, input.id)
      if (!row && input.id.includes('::')) {
        const [shop, sellerSku] = input.id.split('::')
        if (shop && sellerSku) {
          row = await mappingsDa.getMappingByShopSellerSku(
            ctx.db,
            ctx.organizationId,
            decodeURIComponent(shop),
            decodeURIComponent(sellerSku),
          )
        }
      }
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `未找到映射 ${input.id}` })
      }
      return row
    }),

  create: tenantProcedure
    .input(
      z.object({
        shopId: z.string().optional(),
        shop: z.string().optional(),
        itemId: z.string().optional(),
        platformSkuId: z.string().optional(),
        sellerSku: z.string().min(1),
        internalSku: z.string().min(1),
        color: z.string().optional(),
        size: z.string().optional(),
        listingId: z.string().optional(),
        listingStatus: z.string().optional(),
        mappingStatus: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => mappingsDa.createMapping(ctx.db, ctx.organizationId, input)),
    ),

  update: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        itemId: z.string().optional(),
        platformSkuId: z.string().optional(),
        internalSku: z.string().optional(),
        color: z.string().optional(),
        size: z.string().optional(),
        listingStatus: z.string().optional(),
        mappingStatus: z.string().optional(),
        listingId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => {
        const { id, ...patch } = input
        return mappingsDa.updateMapping(ctx.db, ctx.organizationId, id, patch)
      }),
    ),

  confirm: tenantProcedure
    .input(z.object({ id: z.string().min(1), internalSku: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        mappingsDa.confirmMapping(ctx.db, ctx.organizationId, input.id, input.internalSku),
      ),
    ),

  unbind: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => mappingsDa.unbindMapping(ctx.db, ctx.organizationId, input.id)),
    ),

  listExceptions: tenantProcedure
    .input(
      paginationInput.extend({
        kind: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return mappingsDa.listExceptions(ctx.db, ctx.organizationId, input)
    }),

  exceptionStats: tenantProcedure.query(async ({ ctx }) => {
    return mappingsDa.exceptionStats(ctx.db, ctx.organizationId)
  }),

  getException: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await mappingsDa.getException(ctx.db, ctx.organizationId, input.id)
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `未找到映射异常 ${input.id}` })
      }
      return row
    }),

  resolveException: tenantProcedure
    .input(z.object({ id: z.string().min(1), resolution: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        mappingsDa.resolveException(
          ctx.db,
          ctx.organizationId,
          input.id,
          input.resolution,
          ctx.user?.id,
        ),
      ),
    ),

  ignoreException: tenantProcedure
    .input(z.object({ id: z.string().min(1), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        mappingsDa.ignoreException(
          ctx.db,
          ctx.organizationId,
          input.id,
          input.note ?? '',
          ctx.user?.id,
        ),
      ),
    ),
})
