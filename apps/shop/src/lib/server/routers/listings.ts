import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as listingsDa from '@/lib/server/dataaccess/listings'
import * as mappingsDa from '@/lib/server/dataaccess/mappings'
import { appendAuditEvent } from '@/lib/server/dataaccess/audit'
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

function audit(
  ctx: {
    db: Parameters<typeof appendAuditEvent>[0]
    organizationId: string
    user?: { id?: string; name?: string | null; email?: string | null } | null
  },
  input: {
    action: string
    entityId?: string
    detail: string
    before?: Record<string, unknown>
    after?: Record<string, unknown>
  },
) {
  return appendAuditEvent(ctx.db, ctx.organizationId, {
    actorUserId: ctx.user?.id,
    actorLabel: ctx.user?.name || ctx.user?.email || ctx.user?.id,
    action: input.action,
    entityType: 'listing',
    entityId: input.entityId,
    result: 'ok',
    detail: input.detail,
    before: input.before,
    after: input.after,
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
        categoryExternalId: z.string().optional(),
        note: z.string().optional(),
        color: z.string().optional(),
        size: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const created = await wrap(() => listingsDa.createListing(ctx.db, ctx.organizationId, input))
      await audit(ctx, {
        action: 'listing.create',
        entityId: created.id,
        detail: `创建刊登 ${created.title}（${created.sellerSku}）`,
        after: { status: created.status, shopId: created.shopId, sku: created.sku },
      })
      return created
    }),

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
        categoryExternalId: z.string().optional(),
        note: z.string().optional(),
        stockOnHand: z.number().int().optional(),
        externalItemId: z.string().optional(),
        lastError: z.string().optional(),
        coverImage: z.string().nullable().optional(),
        images: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input
      const updated = await wrap(() =>
        listingsDa.updateListing(ctx.db, ctx.organizationId, id, patch),
      )
      await audit(ctx, {
        action: 'listing.update',
        entityId: id,
        detail: `更新刊登字段：${Object.keys(patch).join(', ')}`,
        after: patch as Record<string, unknown>,
      })
      return updated
    }),

  setShelf: tenantProcedure
    .input(z.object({ id: z.string().min(1), onShelf: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const result = await wrap(() =>
        listingsDa.setListingShelfStatus(
          ctx.db,
          ctx.organizationId,
          input.id,
          input.onShelf,
          ctx.user?.id,
        ),
      )
      await audit(ctx, {
        action: input.onShelf ? 'listing.on_shelf' : 'listing.off_shelf',
        entityId: input.id,
        detail: result.task
          ? `${input.onShelf ? '上架' : '下架'}（本地 + 平台任务 ${input.onShelf ? '无' : result.task.taskNo}）`
          : `${input.onShelf ? '上架' : '下架'}（仅本地）`,
        after: { status: result.listing.status, publishState: result.listing.publishState },
      })
      return result
    }),

  /** 发布到平台：入队 listing_write 任务并触发 apps/api（create/update）。 */
  publish: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await wrap(() =>
        listingsDa.publishListing(ctx.db, ctx.organizationId, input.id, ctx.user?.id),
      )
      await audit(ctx, {
        action: 'listing.publish',
        entityId: input.id,
        detail: result.message,
        after: {
          publishState: result.listing.publishState,
          externalItemId: result.listing.externalItemId,
          taskStatus: result.task.status,
        },
      })
      return result
    }),

  /** 提交审核：草稿/失败 → 待审 + listing_submit 待审单（mode=link）。 */
  submitForReview: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await wrap(() =>
        listingsDa.submitForReview(ctx.db, ctx.organizationId, input.id, ctx.user?.id),
      )
      await audit(ctx, {
        action: 'listing.submit_for_review',
        entityId: input.id,
        detail: result.message,
        after: { status: result.listing.status, pendingId: result.pendingId },
      })
      return result
    }),

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
   * 刊登读同步（apps/api resource=listings）；
   * 平台写入走 publish / setShelf（resource=listing_write）。
   */
  requestPlatformSync: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await wrap(() =>
        listingsDa.requestPlatformSyncStub(ctx.db, ctx.organizationId, input.id),
      )
      await audit(ctx, {
        action: 'listing.sync_pull',
        entityId: input.id,
        detail: result.message,
        after: { publishState: result.listing.publishState, status: result.listing.status },
      })
      return result
    }),
})
