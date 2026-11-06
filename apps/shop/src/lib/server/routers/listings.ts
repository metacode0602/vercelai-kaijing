import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as listingsDa from '@/lib/server/dataaccess/listings'
import * as mappingsDa from '@/lib/server/dataaccess/mappings'
import {
  UI_LISTING_PUBLISH_STATES,
  UI_LISTING_STATUSES,
} from '@/lib/server/mappers/listings'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  status: z.string().optional(),
  publishState: z.string().optional(),
  shopId: z.string().optional(),
  platform: z.string().optional(),
  sku: z.string().optional(),
  spu: z.string().optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    const notFound = /不存在/.test(message)
    throw new TRPCError({ code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const listingsRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return listingsDa.listListings(ctx.db, ctx.organizationId, input)
  }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    return listingsDa.listingStats(ctx.db, ctx.organizationId)
  }),

  meta: tenantProcedure.query(async ({ ctx }) => {
    const shops = await mappingsDa.listShopsForSelect(ctx.db, ctx.organizationId)
    return {
      statuses: [...UI_LISTING_STATUSES],
      publishStates: [...UI_LISTING_PUBLISH_STATES],
      shops,
    }
  }),

  get: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await listingsDa.getListing(ctx.db, ctx.organizationId, input.id)
      if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `未找到刊登 ${input.id}` })
      }
      return row
    }),

  create: tenantProcedure
    .input(
      z.object({
        shopId: z.string().optional(),
        shopName: z.string().optional(),
        sku: z.string().min(1),
        sellerSku: z.string().min(1),
        title: z.string().min(1),
        sellPrice: z.number(),
        currency: z.string().optional(),
        status: z.string().optional(),
        warehouseCode: z.string().optional(),
        logisticsChannel: z.string().optional(),
        brandName: z.string().optional(),
        categoryPath: z.string().optional(),
        note: z.string().optional(),
        color: z.string().optional(),
        size: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => listingsDa.createListing(ctx.db, ctx.organizationId, input)),
    ),

  update: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        title: z.string().optional(),
        sellPrice: z.number().optional(),
        currency: z.string().optional(),
        status: z.string().optional(),
        publishState: z.string().optional(),
        warehouseCode: z.string().optional(),
        logisticsChannel: z.string().optional(),
        brandName: z.string().optional(),
        categoryPath: z.string().optional(),
        note: z.string().optional(),
        stockOnHand: z.number().int().optional(),
        externalItemId: z.string().optional(),
        lastError: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => {
        const { id, ...patch } = input
        return listingsDa.updateListing(ctx.db, ctx.organizationId, id, patch)
      }),
    ),

  setShelf: tenantProcedure
    .input(z.object({ id: z.string().min(1), onShelf: z.boolean() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        listingsDa.setListingShelfStatus(
          ctx.db,
          ctx.organizationId,
          input.id,
          input.onShelf,
        ),
      ),
    ),

  addMappingLine: tenantProcedure
    .input(
      z.object({
        listingId: z.string().min(1),
        sellerSku: z.string().min(1),
        internalSku: z.string().min(1),
        color: z.string().optional(),
        size: z.string().optional(),
        itemId: z.string().optional(),
        platformSkuId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => {
        const { listingId, ...rest } = input
        return listingsDa.addListingMappingLine(ctx.db, ctx.organizationId, listingId, rest)
      }),
    ),

  /**
   * 刊登拉取同步（读）；平台新建/上下架写入本轮不做。
   */
  requestPlatformSync: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => listingsDa.requestPlatformSyncStub(ctx.db, ctx.organizationId, input.id)),
    ),
})
