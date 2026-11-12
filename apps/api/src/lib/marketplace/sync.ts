import { createHash } from "node:crypto"
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm"
import {
  consoleNotifications,
  fulfillmentBatchPackages,
  fulfillmentBatches,
  integrationLogs,
  integrationStates,
  listings,
  orderLines,
  orders,
  orderStatusEvents,
  organization,
  productReviewMedia,
  productReviews,
  shipments,
  shops,
  trackingEvents,
  type ShipmentStatus,
} from "@workspace/db"
import type {
  DomainBatchShipInput,
  DomainBatchShipPackage,
  DomainOrder,
  DomainOrderTrace,
  DomainReview,
  DomainTracePackage,
} from "@workspace/marketplace"
import { shipBatchViaConnector } from "@workspace/marketplace"
import { db } from "../db"
import { createShopConnector } from "./connector"
import { isLazopPlatform, isOrderListingSyncPlatform } from "./app-env"
import {
  maybeAutoReleaseCancelledOrder,
  maybeAutoReserveSyncedOrder,
} from "./reserve"
import { syncListingsForShop } from "./sync-listings"
import { syncSettlementsForShop } from "./sync-settlements"
import {
  markSyncTaskFinished,
  markSyncTaskRunning,
} from "./sync-tasks"

export type MarketplaceSyncResource =
  | "orders"
  | "logistics"
  | "reviews"
  | "listings"
  | "settlements"
  | "ship_batch"
  | "listing_write"
  | "inventory_price_write"
  | "all"

export interface MarketplaceSyncOptions {
  resource: MarketplaceSyncResource
  now?: Date
  /** Limit to one shop (console / internal trigger). */
  shopId?: string
  organizationId?: string
  /** When set, update sync_tasks / sync_job_runs with real run status. */
  syncTaskId?: string
  requestId?: string
  /** Required when resource === "ship_batch". */
  batchId?: string
}

export interface MarketplaceSyncError {
  shopId: string
  resource: MarketplaceSyncResource
  message: string
}

export interface MarketplaceSyncResult {
  shops: number
  orders: number
  shipments: number
  reviews: number
  listings: number
  settlements: number
  settlementLines: number
  reserved: number
  errors: MarketplaceSyncError[]
}

export interface MarketplaceSyncShop {
  id: string
  organizationId: string
  platform: string
  name: string
  region: string | null
  currency: string
  /** shops.meta — TikTok shopCipher lives here when present. */
  meta?: Record<string, unknown> | null
}

function shopCipherFromMeta(
  meta: Record<string, unknown> | null | undefined
): string | null {
  if (!meta) return null
  const cipher = meta.shopCipher ?? meta.shop_cipher
  return typeof cipher === "string" && cipher.trim() ? cipher.trim() : null
}

async function connectorForShop(shop: MarketplaceSyncShop) {
  return createShopConnector({
    id: shop.id,
    organizationId: shop.organizationId,
    platform: shop.platform,
    region: shop.region,
    shopCipher: shopCipherFromMeta(shop.meta),
  })
}

const ORDER_SYNC_PAGE_SIZE = 100
const REVIEW_PAGE_SIZE = 50
const DAY_MS = 24 * 60 * 60 * 1000

function envInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function platformTime(value: unknown): Date | null {
  if (value == null || value === "") return null
  const numeric = typeof value === "number" ? value : Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    const ms = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return asDate(String(value))
}

function rawStatus(
  raw: Record<string, unknown> | undefined
): string | undefined {
  if (!raw) return undefined
  const statuses = raw.statuses
  if (Array.isArray(statuses) && statuses.length > 0) return String(statuses[0])
  const status = raw.status
  return status == null ? undefined : String(status)
}

function rawUpdatedAt(raw: Record<string, unknown> | undefined): Date | null {
  if (!raw) return null
  return platformTime(raw.updated_at ?? raw.update_time ?? raw.gmt_modified)
}

function stableReviewId(input: {
  itemId: string
  reviewAt: string | null | undefined
  content: string | undefined
  buyer: string | undefined
}): string {
  const digest = createHash("sha256")
    .update(
      [
        input.itemId,
        input.reviewAt ?? "",
        input.content ?? "",
        input.buyer ?? "",
      ].join(":")
    )
    .digest("hex")
    .slice(0, 32)
  return `hash:${digest}`
}

function mapShipmentStatus(pkg: DomainTracePackage): ShipmentStatus {
  const latest = pkg.events.at(-1)
  const text =
    `${latest?.statusCode ?? ""} ${latest?.title ?? ""}`.toLowerCase()
  if (!text.trim()) return "pending"
  if (text.includes("cancel")) return "cancelled"
  if (text.includes("return") || text.includes("refund")) return "returned"
  if (text.includes("fail") || text.includes("exception")) return "failed"
  if (text.includes("deliver") || text.includes("signed")) return "delivered"
  if (text.includes("rts") || text.includes("ready")) return "ready_to_ship"
  if (
    text.includes("transit") ||
    text.includes("pickup") ||
    text.includes("out_for_delivery") ||
    text.includes("delivery")
  ) {
    return "in_transit"
  }
  if (text.includes("ship") || text.includes("dispatch")) return "shipped"
  return "pending"
}

function shipmentDates(pkg: DomainTracePackage) {
  let rtsAt: Date | null = null
  let shippedAt: Date | null = null
  let deliveredAt: Date | null = null
  for (const event of pkg.events) {
    const at = asDate(event.eventTime)
    if (!at) continue
    const text =
      `${event.statusCode} ${event.title ?? ""} ${event.description ?? ""}`.toLowerCase()
    if (!rtsAt && (text.includes("rts") || text.includes("ready_to_ship")))
      rtsAt = at
    if (
      !shippedAt &&
      (text.includes("ship") ||
        text.includes("transit") ||
        text.includes("pickup"))
    ) {
      shippedAt = at
    }
    if (!deliveredAt && (text.includes("deliver") || text.includes("signed"))) {
      deliveredAt = at
    }
  }
  return { rtsAt, shippedAt, deliveredAt }
}

async function loadShops(filter?: {
  shopId?: string
  organizationId?: string
}): Promise<MarketplaceSyncShop[]> {
  const conditions = [
    inArray(shops.platform, ["daraz", "lazada", "tiktok_shop"]),
    inArray(shops.status, ["active", "error"]),
    isNull(shops.deletedAt),
    eq(organization.entryApproved, true),
    sql`coalesce((${shops.meta} ->> 'syncPaused')::boolean, false) = false`,
    sql`coalesce(${integrationStates.health}, '') <> 'paused'`,
  ]
  if (filter?.shopId) conditions.push(eq(shops.id, filter.shopId))
  if (filter?.organizationId)
    conditions.push(eq(shops.organizationId, filter.organizationId))
  return db
    .select({
      id: shops.id,
      organizationId: shops.organizationId,
      platform: shops.platform,
      name: shops.name,
      region: shops.region,
      currency: shops.currency,
      meta: shops.meta,
    })
    .from(shops)
    .innerJoin(organization, eq(organization.id, shops.organizationId))
    .leftJoin(integrationStates, eq(integrationStates.shopId, shops.id))
    .where(and(...conditions))
}

async function loadState(shopId: string) {
  const [state] = await db
    .select()
    .from(integrationStates)
    .where(eq(integrationStates.shopId, shopId))
    .limit(1)
  return state ?? null
}

async function logIntegration(input: {
  shopId: string
  action: string
  status: "success" | "error"
  message: string
  payloadSummary?: Record<string, unknown>
}) {
  await db.insert(integrationLogs).values({
    shopId: input.shopId,
    direction: "in",
    action: input.action,
    status: input.status,
    message: input.message,
    payloadSummary: input.payloadSummary
      ? JSON.stringify(input.payloadSummary).slice(0, 2000)
      : null,
  })
}

async function markAuthFailure(
  shop: MarketplaceSyncShop,
  message: string
): Promise<void> {
  if (!/(token|401|403|unauthor|invalid_grant|expired)/i.test(message)) return
  await db
    .update(shops)
    .set({
      status: "error",
      meta: {
        ...(shop.meta && typeof shop.meta === "object" ? shop.meta : {}),
        lastError: message.slice(0, 500),
      },
      updatedAt: new Date(),
    })
    .where(eq(shops.id, shop.id))

  const [existing] = await db
    .select({ id: consoleNotifications.id })
    .from(consoleNotifications)
    .where(
      and(
        eq(consoleNotifications.organizationId, shop.organizationId),
        eq(consoleNotifications.sourceType, "shop_auth"),
        eq(consoleNotifications.sourceId, shop.id),
        isNull(consoleNotifications.readAt)
      )
    )
    .limit(1)
  if (existing) return

  await db.insert(consoleNotifications).values({
    organizationId: shop.organizationId,
    category: "system",
    title: `店铺 ${shop.name} 授权失效`,
    summary: "平台令牌刷新或调用失败，请前往店铺连接重新授权。",
    body: message.slice(0, 1000),
    href: `/settings/shops/${shop.id}`,
    sourceType: "shop_auth",
    sourceId: shop.id,
  })
}

function checkpointForResource(
  resource: MarketplaceSyncResource,
  now: Date
): Record<string, Date> | null {
  switch (resource) {
    case "orders":
      return { lastOrdersSyncAt: now }
    case "logistics":
      return { lastLogisticsSyncAt: now }
    case "reviews":
      return { lastReviewsSyncAt: now }
    case "listings":
      return { lastListingsSyncAt: now, lastProductsSyncAt: now }
    case "settlements":
      return { lastSettlementsSyncAt: now }
    case "ship_batch":
      // ship_batch 是写操作，不推进读同步 checkpoint
      return null
    case "listing_write":
      // 刊登写入不推进读同步 checkpoint
      return null
    case "inventory_price_write":
      // 库存推送 / 改价回写不推进读同步 checkpoint
      return null
    case "all":
      // "all" is orchestrated per-resource; never write a blended checkpoint here.
      return null
    default: {
      const _exhaustive: never = resource
      void _exhaustive
      return null
    }
  }
}

async function markState(input: {
  shopId: string
  resource: MarketplaceSyncResource
  now: Date
  failure?: string
}) {
  // Failures update health/error only — never advance per-resource checkpoints.
  const checkpoint = input.failure
    ? {}
    : (checkpointForResource(input.resource, input.now) ?? {})

  if (!input.failure && Object.keys(checkpoint).length === 0) {
    // Unknown / blended resource: refuse to invent a timestamp.
    await db
      .insert(integrationStates)
      .values({
        shopId: input.shopId,
        health: "success",
        lastError: null,
      })
      .onConflictDoUpdate({
        target: integrationStates.shopId,
        set: { health: "success", lastError: null },
      })
    return
  }

  await db
    .insert(integrationStates)
    .values({
      shopId: input.shopId,
      health: input.failure ? "error" : "success",
      lastError: input.failure ?? null,
      ...checkpoint,
    })
    .onConflictDoUpdate({
      target: integrationStates.shopId,
      set: {
        health: input.failure ? "error" : "success",
        lastError: input.failure ?? null,
        ...checkpoint,
      },
    })

  if (!input.failure) {
    await db
      .update(shops)
      .set({ lastSyncAt: input.now, updatedAt: input.now })
      .where(eq(shops.id, input.shopId))
  }
}

async function upsertOrder(
  shop: MarketplaceSyncShop,
  order: DomainOrder,
  now: Date
): Promise<{
  created: boolean
  changed: boolean
  orderId: string
  status: string
}> {
  const [existing] = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(
      and(
        eq(orders.shopId, shop.id),
        eq(orders.externalOrderId, order.externalOrderId)
      )
    )
    .limit(1)

  const placedAt = asDate(order.placedAt)
  const paidAt = asDate(order.paidAt)
  const platformUpdatedAt = rawUpdatedAt(order.raw) ?? now
  const values = {
    organizationId: shop.organizationId,
    shopId: shop.id,
    externalOrderId: order.externalOrderId,
    orderNumber: order.externalOrderId,
    status: order.status,
    platformStatus: rawStatus(order.raw) ?? order.status,
    placedAt,
    paidAt,
    platformUpdatedAt,
    currency: order.currency ?? shop.currency,
    totalAmount: order.totalAmount,
    raw: order.raw ?? {},
    updatedAt: now,
  }

  const [row] = await db
    .insert(orders)
    .values(values)
    .onConflictDoUpdate({
      target: [orders.shopId, orders.externalOrderId],
      set: {
        status: values.status,
        platformStatus: values.platformStatus,
        placedAt: values.placedAt,
        paidAt: values.paidAt,
        platformUpdatedAt: values.platformUpdatedAt,
        currency: values.currency,
        totalAmount: values.totalAmount,
        raw: values.raw,
        updatedAt: values.updatedAt,
      },
    })
    .returning({ id: orders.id })

  if (!row)
    return { created: false, changed: false, orderId: "", status: order.status }

  const lines = order.lines ?? []
  for (const [index, line] of lines.entries()) {
    const externalLineId =
      line.externalLineId || `${order.externalOrderId}:${index + 1}`
    const sellerSku = line.sku || undefined
    await db
      .insert(orderLines)
      .values({
        orderId: row.id,
        organizationId: shop.organizationId,
        externalLineId,
        shopSku: sellerSku,
        sku: sellerSku,
        sellerSku,
        title: line.title,
        qty: line.qty ?? 1,
        unitPrice: line.unitPrice,
        paidPrice: line.unitPrice,
        paymentTime: paidAt,
        platformStatus:
          line.raw && typeof line.raw.status === "string"
            ? line.raw.status
            : undefined,
      })
      .onConflictDoUpdate({
        target: [orderLines.orderId, orderLines.externalLineId],
        set: {
          shopSku: sellerSku,
          sku: sellerSku,
          sellerSku,
          title: line.title,
          qty: line.qty ?? 1,
          unitPrice: line.unitPrice,
          paidPrice: line.unitPrice,
          paymentTime: paidAt,
          platformStatus:
            line.raw && typeof line.raw.status === "string"
              ? line.raw.status
              : undefined,
        },
      })
  }

  const changed = !existing || existing.status !== order.status
  if (changed) {
    await db.insert(orderStatusEvents).values({
      organizationId: shop.organizationId,
      shopId: shop.id,
      orderId: row.id,
      fromStatus: existing?.status ?? null,
      toStatus: order.status,
      source: "sync",
      eventTime: placedAt ?? now,
      raw: order.raw ?? {},
    })
  }

  return { created: !existing, changed, orderId: row.id, status: order.status }
}

async function syncOrdersForShop(
  shop: MarketplaceSyncShop,
  now: Date
): Promise<{
  orders: number
  reserved: number
  itemErrors: Array<{ externalOrderId: string; message: string }>
}> {
  if (!isOrderListingSyncPlatform(shop.platform)) {
    return { orders: 0, reserved: 0, itemErrors: [] }
  }
  const connector = await connectorForShop(shop)
  if (!connector.listOrders) {
    return { orders: 0, reserved: 0, itemErrors: [] }
  }

  const state = await loadState(shop.id)
  const overlapMs =
    envInt("MARKETPLACE_SYNC_ORDERS_OVERLAP_MINUTES", 60) * 60 * 1000
  const backfillDays = envInt("MARKETPLACE_SYNC_ORDERS_BACKFILL_DAYS", 7)
  const updatedAfter = state?.lastOrdersSyncAt
    ? new Date(state.lastOrdersSyncAt.getTime() - overlapMs)
    : new Date(now.getTime() - backfillDays * DAY_MS)
  const maxPages = envInt("MARKETPLACE_SYNC_ORDERS_MAX_PAGES", 5)

  let cursor: string | null | undefined
  let count = 0
  let reservedCount = 0
  const itemErrors: Array<{ externalOrderId: string; message: string }> = []
  for (let page = 0; page < maxPages; page += 1) {
    const result = await connector.listOrders({
      cursor: cursor ?? null,
      pageSize: ORDER_SYNC_PAGE_SIZE,
      updatedAfter: updatedAfter.toISOString(),
      updatedBefore: now.toISOString(),
      sortBy: "updated_at",
      sortDirection: "DESC",
    })
    for (const order of result.items) {
      if (!order.externalOrderId) continue
      const saved = await upsertOrder(shop, order, now)
      if (saved.created || saved.changed) count += 1

      if (order.itemsFetchError) {
        itemErrors.push({
          externalOrderId: order.externalOrderId,
          message: order.itemsFetchError,
        })
        await logIntegration({
          shopId: shop.id,
          action: "orders.items",
          status: "error",
          message: `order items fetch failed for ${order.externalOrderId}`,
          payloadSummary: {
            orderId: order.externalOrderId,
            error: order.itemsFetchError,
            headerUpserted: Boolean(saved.orderId),
          },
        })
        // Header may be saved; do not auto-reserve incomplete lines as success path.
        continue
      }

      if (saved.orderId) {
        if (saved.status === "cancelled") {
          await maybeAutoReleaseCancelledOrder({
            organizationId: shop.organizationId,
            shopId: shop.id,
            orderId: saved.orderId,
            externalOrderId: order.externalOrderId,
            status: saved.status,
          })
        } else {
          const reserved = await maybeAutoReserveSyncedOrder({
            organizationId: shop.organizationId,
            shopId: shop.id,
            orderId: saved.orderId,
            externalOrderId: order.externalOrderId,
            status: saved.status,
          })
          if (reserved.reserved) reservedCount += 1
        }
      }
    }
    if (!result.nextCursor) break
    cursor = result.nextCursor
  }

  return { orders: count, reserved: reservedCount, itemErrors }
}

async function syncLogisticsForShop(
  shop: MarketplaceSyncShop,
  now: Date
): Promise<{ shipments: number }> {
  if (!isLazopPlatform(shop.platform)) return { shipments: 0 }
  const connector = await connectorForShop(shop)
  if (!connector.getOrderTrace) return { shipments: 0 }

  const limit = envInt("MARKETPLACE_SYNC_LOGISTICS_LIMIT", 50)
  const lookbackDays = envInt("MARKETPLACE_SYNC_LOGISTICS_LOOKBACK_DAYS", 30)
  const rows = await db
    .select({
      id: orders.id,
      externalOrderId: orders.externalOrderId,
      status: orders.status,
      updatedAt: orders.platformUpdatedAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.shopId, shop.id),
        inArray(orders.status, ["ready_to_ship", "shipped"]),
        gte(
          orders.platformUpdatedAt,
          new Date(now.getTime() - lookbackDays * DAY_MS)
        )
      )
    )
    .orderBy(desc(orders.platformUpdatedAt))
    .limit(limit)

  let count = 0
  for (const order of rows) {
    let trace: DomainOrderTrace
    try {
      trace = await connector.getOrderTrace(order.externalOrderId)
    } catch (error) {
      await logIntegration({
        shopId: shop.id,
        action: "logistics.trace",
        status: "error",
        message: `trace failed for ${order.externalOrderId}`,
        payloadSummary: {
          orderId: order.externalOrderId,
          error: error instanceof Error ? error.message : String(error),
        },
      })
      continue
    }

    for (const pkg of trace.packages) {
      const [existing] = await db
        .select({
          id: shipments.id,
          rtsAt: shipments.rtsAt,
          shippedAt: shipments.shippedAt,
          deliveredAt: shipments.deliveredAt,
        })
        .from(shipments)
        .where(
          and(
            eq(shipments.shopId, shop.id),
            eq(shipments.externalPackageId, pkg.externalPackageId)
          )
        )
        .limit(1)

      const latest = pkg.events.at(-1)
      const dates = shipmentDates(pkg)
      const [shipment] = await db
        .insert(shipments)
        .values({
          organizationId: shop.organizationId,
          shopId: shop.id,
          orderId: order.id,
          externalPackageId: pkg.externalPackageId,
          trackingNumber: pkg.trackingNumber,
          providerName: pkg.providerName,
          status: mapShipmentStatus(pkg),
          platformStatus: latest?.statusCode,
          rtsAt: dates.rtsAt,
          shippedAt: dates.shippedAt,
          deliveredAt: dates.deliveredAt,
          raw: pkg.raw ?? {},
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [shipments.shopId, shipments.externalPackageId],
          set: {
            trackingNumber: pkg.trackingNumber,
            providerName: pkg.providerName,
            status: mapShipmentStatus(pkg),
            platformStatus: latest?.statusCode,
            rtsAt: dates.rtsAt ?? existing?.rtsAt ?? null,
            shippedAt: dates.shippedAt ?? existing?.shippedAt ?? null,
            deliveredAt: dates.deliveredAt ?? existing?.deliveredAt ?? null,
            raw: pkg.raw ?? {},
            updatedAt: now,
          },
        })
        .returning({ id: shipments.id })
      if (!shipment) continue

      for (const event of pkg.events) {
        const eventTime = asDate(event.eventTime)
        if (!eventTime) continue
        await db
          .insert(trackingEvents)
          .values({
            organizationId: shop.organizationId,
            shipmentId: shipment.id,
            statusCode: event.statusCode,
            title: event.title,
            description: event.description,
            location: event.location,
            eventTime,
            source: "api",
            raw: event.raw ?? {},
          })
          .onConflictDoUpdate({
            target: [
              trackingEvents.shipmentId,
              trackingEvents.eventTime,
              trackingEvents.statusCode,
            ],
            set: {
              title: event.title,
              description: event.description,
              location: event.location,
              raw: event.raw ?? {},
            },
          })
      }
      count += 1
    }

    const latestPackage = trace.packages.at(-1)
    if (latestPackage) {
      await db
        .update(orders)
        .set({
          fulfillmentStatus: mapShipmentStatus(latestPackage),
          updatedAt: now,
        })
        .where(eq(orders.id, order.id))
    }
  }

  return { shipments: count }
}

async function upsertReview(
  shop: MarketplaceSyncShop,
  listing: { id: string; externalItemId: string },
  review: DomainReview,
  now: Date
): Promise<{ inserted: boolean }> {
  const reviewAt = asDate(review.reviewAt)
  const externalReviewId =
    review.externalReviewId ||
    stableReviewId({
      itemId: listing.externalItemId,
      reviewAt: review.reviewAt,
      content: review.content,
      buyer: review.buyerDisplayName,
    })
  const fetchedAt = now
  const rating = Math.max(0, Math.min(5, Math.round(review.rating ?? 0)))

  const [row] = await db
    .insert(productReviews)
    .values({
      organizationId: shop.organizationId,
      shopId: shop.id,
      listingId: listing.id,
      externalItemId: review.externalItemId || listing.externalItemId,
      sellerSku: review.sellerSku,
      skuAttrs: review.skuAttrs ?? {},
      externalReviewId,
      rating,
      title: review.title,
      content: review.content,
      reviewAt,
      purchasedAt: asDate(review.purchasedAt),
      buyerDisplayName: review.buyerDisplayName,
      buyerExternalId: review.buyerExternalId,
      externalOrderId: review.externalOrderId,
      usefulCount: review.helpfulCount ?? 0,
      source: "api",
      status: "active",
      raw: review.raw ?? {},
      fetchedAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [productReviews.shopId, productReviews.externalReviewId],
      set: {
        listingId: listing.id,
        externalItemId: review.externalItemId || listing.externalItemId,
        sellerSku: review.sellerSku,
        skuAttrs: review.skuAttrs ?? {},
        rating,
        title: review.title,
        content: review.content,
        reviewAt,
        purchasedAt: asDate(review.purchasedAt),
        buyerDisplayName: review.buyerDisplayName,
        buyerExternalId: review.buyerExternalId,
        externalOrderId: review.externalOrderId,
        usefulCount: review.helpfulCount ?? 0,
        raw: review.raw ?? {},
        fetchedAt,
        updatedAt: now,
      },
    })
    .returning({ id: productReviews.id })

  if (!row) return { inserted: false }

  for (const [index, url] of (review.images ?? []).entries()) {
    if (!url) continue
    await db
      .insert(productReviewMedia)
      .values({
        organizationId: shop.organizationId,
        reviewId: row.id,
        mediaType: "image",
        url,
        sortOrder: index,
      })
      .onConflictDoNothing({
        target: [productReviewMedia.reviewId, productReviewMedia.url],
      })
  }

  return { inserted: true }
}

async function syncReviewsForShop(
  shop: MarketplaceSyncShop,
  now: Date
): Promise<{ reviews: number }> {
  if (!isLazopPlatform(shop.platform)) return { reviews: 0 }
  const connector = await connectorForShop(shop)
  if (!connector.listReviews) return { reviews: 0 }

  const state = await loadState(shop.id)
  const itemsLimit = envInt("MARKETPLACE_SYNC_REVIEWS_ITEMS_LIMIT", 20)
  const maxPages = envInt("MARKETPLACE_SYNC_REVIEWS_MAX_PAGES", 5)
  const lookbackDays = Math.min(
    envInt("MARKETPLACE_SYNC_REVIEWS_LOOKBACK_DAYS", 7),
    7
  )
  const end = now
  const earliest = new Date(end.getTime() - lookbackDays * DAY_MS)
  const resumed = state?.lastReviewsSyncAt
    ? new Date(state.lastReviewsSyncAt.getTime() - DAY_MS)
    : earliest
  const start = resumed > earliest ? resumed : earliest

  const rows = await db
    .select({ id: listings.id, externalItemId: listings.externalItemId })
    .from(listings)
    .where(
      and(
        eq(listings.shopId, shop.id),
        isNotNull(listings.externalItemId),
        inArray(listings.status, ["live", "submitted"])
      )
    )
    .limit(itemsLimit)

  let count = 0
  for (const row of rows) {
    if (!row.externalItemId) continue
    let cursor: string | null | undefined
    for (let page = 0; page < maxPages; page += 1) {
      const result = await connector.listReviews({
        itemId: row.externalItemId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        cursor: cursor ?? null,
        pageSize: REVIEW_PAGE_SIZE,
      })
      for (const review of result.items) {
        const saved = await upsertReview(
          shop,
          { id: row.id, externalItemId: row.externalItemId },
          review,
          now
        )
        if (saved.inserted) count += 1
      }
      if (!result.nextCursor) break
      cursor = result.nextCursor
    }
  }

  return { reviews: count }
}

export async function runMarketplaceSync(
  options: MarketplaceSyncOptions
): Promise<MarketplaceSyncResult> {
  const now = options.now ?? new Date()

  // ship_batch 是写操作，不走 shop 轮询；单独处理。
  if (options.resource === "ship_batch") {
    return runShipBatch(options, now)
  }

  const resources: MarketplaceSyncResource[] =
    options.resource === "all"
      ? ["orders", "listings", "logistics", "reviews", "settlements"]
      : [options.resource]
  const shopRows = await loadShops({
    shopId: options.shopId,
    organizationId: options.organizationId,
  })
  const result: MarketplaceSyncResult = {
    shops: shopRows.length,
    orders: 0,
    shipments: 0,
    reviews: 0,
    listings: 0,
    settlements: 0,
    settlementLines: 0,
    reserved: 0,
    errors: [],
  }

  if (options.syncTaskId) {
    await markSyncTaskRunning({
      syncTaskId: options.syncTaskId,
      organizationId: options.organizationId,
      requestId: options.requestId,
      message: `开始同步 ${options.resource}`,
    }).catch(() => undefined)
  }

  if (shopRows.length === 0) {
    const message = options.shopId
      ? `店铺不存在或未激活：${options.shopId}`
      : "没有可同步的 Daraz/Lazada 店铺"
    result.errors.push({
      shopId: options.shopId ?? "",
      resource: options.resource,
      message,
    })
    if (options.syncTaskId) {
      await markSyncTaskFinished({
        syncTaskId: options.syncTaskId,
        organizationId: options.organizationId,
        ok: false,
        error: message,
        message,
        requestId: options.requestId,
        httpStatus: 404,
      }).catch(() => undefined)
    }
    return result
  }

  for (const shop of shopRows) {
    for (const resource of resources) {
      try {
        if (resource === "orders") {
          const synced = await syncOrdersForShop(shop, now)
          result.orders += synced.orders
          result.reserved += synced.reserved
          if (synced.itemErrors.length) {
            for (const err of synced.itemErrors) {
              result.errors.push({
                shopId: shop.id,
                resource,
                message: `order ${err.externalOrderId} items: ${err.message}`,
              })
            }
            await markState({
              shopId: shop.id,
              resource,
              now,
              failure: `order items failed for ${synced.itemErrors.length} order(s)`,
            })
            await logIntegration({
              shopId: shop.id,
              action: "orders.sync",
              status: "error",
              message: `${shop.platform} orders partial: items fetch failures`,
              payloadSummary: {
                orders: synced.orders,
                reserved: synced.reserved,
                itemErrorCount: synced.itemErrors.length,
              },
            })
          } else {
            await markState({ shopId: shop.id, resource, now })
            await logIntegration({
              shopId: shop.id,
              action: "orders.sync",
              status: "success",
              message: `${shop.platform} orders synced`,
              payloadSummary: {
                orders: synced.orders,
                reserved: synced.reserved,
              },
            })
          }
        } else if (resource === "logistics") {
          const synced = await syncLogisticsForShop(shop, now)
          result.shipments += synced.shipments
          await markState({ shopId: shop.id, resource, now })
          await logIntegration({
            shopId: shop.id,
            action: "logistics.sync",
            status: "success",
            message: `${shop.platform} logistics synced`,
            payloadSummary: synced,
          })
        } else if (resource === "reviews") {
          const synced = await syncReviewsForShop(shop, now)
          result.reviews += synced.reviews
          await markState({ shopId: shop.id, resource, now })
          await logIntegration({
            shopId: shop.id,
            action: "reviews.sync",
            status: "success",
            message: `${shop.platform} reviews synced`,
            payloadSummary: synced,
          })
        } else if (resource === "listings") {
          const synced = await syncListingsForShop(shop, now)
          result.listings += synced.listings
          await markState({ shopId: shop.id, resource, now })
          await logIntegration({
            shopId: shop.id,
            action: "listings.sync",
            status: "success",
            message: `${shop.platform} listings synced`,
            payloadSummary: synced,
          })
        } else if (resource === "settlements") {
          const synced = await syncSettlementsForShop(shop, now)
          result.settlements += synced.settlements
          result.settlementLines += synced.lines
          await markState({ shopId: shop.id, resource, now })
          await logIntegration({
            shopId: shop.id,
            action: "settlements.sync",
            status: "success",
            message: `${shop.platform} settlements synced`,
            payloadSummary: {
              settlements: synced.settlements,
              lines: synced.lines,
              unassignedLines: synced.unassignedLines,
            },
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        result.errors.push({ shopId: shop.id, resource, message })
        await markState({
          shopId: shop.id,
          resource,
          now,
          failure: message.slice(0, 1000),
        }).catch(() => undefined)
        await markAuthFailure(shop, message).catch(() => undefined)
        await logIntegration({
          shopId: shop.id,
          action: `${resource}.sync`,
          status: "error",
          message: message.slice(0, 1000),
        }).catch(() => undefined)
      }
    }
  }

  if (options.syncTaskId) {
    const ok = result.errors.length === 0
    await markSyncTaskFinished({
      syncTaskId: options.syncTaskId,
      organizationId: options.organizationId,
      ok,
      progressDone: ok
        ? result.orders +
          result.shipments +
          result.reviews +
          result.listings +
          result.settlements
        : 0,
      progressTotal: Math.max(1, shopRows.length * resources.length),
      error: ok
        ? null
        : result.errors.map((e) => `${e.shopId}:${e.message}`).join("; "),
      message: ok ? "平台同步完成" : "平台同步失败（见 detail / integration_logs）",
      detail: JSON.stringify(result).slice(0, 4000),
      requestId: options.requestId,
      httpStatus: ok ? 200 : 502,
    }).catch(() => undefined)
  }

  return result
}

export async function syncMarketplaceOrder(input: {
  shop: MarketplaceSyncShop
  externalOrderId: string
  includeTrace?: boolean
  now?: Date
}): Promise<void> {
  const now = input.now ?? new Date()
  const connector = await connectorForShop(input.shop)
  const order = await connector.getOrder(input.externalOrderId)
  const saved = await upsertOrder(input.shop, order, now)
  if (order.itemsFetchError) {
    await logIntegration({
      shopId: input.shop.id,
      action: "orders.items",
      status: "error",
      message: `order items fetch failed for ${input.externalOrderId}`,
      payloadSummary: {
        orderId: input.externalOrderId,
        error: order.itemsFetchError,
        headerUpserted: Boolean(saved.orderId),
      },
    })
  } else if (saved.orderId) {
    if (saved.status === "cancelled") {
      await maybeAutoReleaseCancelledOrder({
        organizationId: input.shop.organizationId,
        shopId: input.shop.id,
        orderId: saved.orderId,
        externalOrderId: input.externalOrderId,
        status: saved.status,
      })
    } else {
      await maybeAutoReserveSyncedOrder({
        organizationId: input.shop.organizationId,
        shopId: input.shop.id,
        orderId: saved.orderId,
        externalOrderId: input.externalOrderId,
        status: saved.status,
      })
    }
  }

  if (input.includeTrace && connector.getOrderTrace) {
    const [orderRow] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.shopId, input.shop.id),
          eq(orders.externalOrderId, input.externalOrderId)
        )
      )
      .limit(1)
    if (!orderRow) return

    const trace = await connector.getOrderTrace(input.externalOrderId)
    for (const pkg of trace.packages) {
      const [shipment] = await db
        .insert(shipments)
        .values({
          organizationId: input.shop.organizationId,
          shopId: input.shop.id,
          orderId: orderRow.id,
          externalPackageId: pkg.externalPackageId,
          trackingNumber: pkg.trackingNumber,
          providerName: pkg.providerName,
          status: mapShipmentStatus(pkg),
          platformStatus: pkg.events.at(-1)?.statusCode,
          ...shipmentDates(pkg),
          raw: pkg.raw ?? {},
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [shipments.shopId, shipments.externalPackageId],
          set: {
            trackingNumber: pkg.trackingNumber,
            providerName: pkg.providerName,
            status: mapShipmentStatus(pkg),
            platformStatus: pkg.events.at(-1)?.statusCode,
            ...shipmentDates(pkg),
            raw: pkg.raw ?? {},
            updatedAt: now,
          },
        })
        .returning({ id: shipments.id })
      if (!shipment) continue
      for (const event of pkg.events) {
        const eventTime = asDate(event.eventTime)
        if (!eventTime) continue
        await db
          .insert(trackingEvents)
          .values({
            organizationId: input.shop.organizationId,
            shipmentId: shipment.id,
            statusCode: event.statusCode,
            title: event.title,
            description: event.description,
            location: event.location,
            eventTime,
            source: "api",
            raw: event.raw ?? {},
          })
          .onConflictDoUpdate({
            target: [
              trackingEvents.shipmentId,
              trackingEvents.eventTime,
              trackingEvents.statusCode,
            ],
            set: {
              title: event.title,
              description: event.description,
              location: event.location,
              raw: event.raw ?? {},
            },
          })
      }
    }
  }

  if (order.itemsFetchError) {
    await markState({
      shopId: input.shop.id,
      resource: "orders",
      now,
      failure: `order items fetch failed for ${input.externalOrderId}: ${order.itemsFetchError}`.slice(
        0,
        1000
      ),
    })
  } else {
    await markState({ shopId: input.shop.id, resource: "orders", now })
  }
}

// ---------------------------------------------------------------------------
// ship_batch — LGS / JSB 交接批次提交交运（写操作）
// ---------------------------------------------------------------------------

async function runShipBatch(
  options: MarketplaceSyncOptions,
  now: Date
): Promise<MarketplaceSyncResult> {
  const result: MarketplaceSyncResult = {
    shops: 0,
    orders: 0,
    shipments: 0,
    reviews: 0,
    listings: 0,
    settlements: 0,
    settlementLines: 0,
    reserved: 0,
    errors: [],
  }

  if (!options.batchId) {
    result.errors.push({
      shopId: "",
      resource: "ship_batch",
      message: "batchId is required for ship_batch",
    })
    if (options.syncTaskId) {
      await markSyncTaskFinished({
        syncTaskId: options.syncTaskId,
        organizationId: options.organizationId,
        ok: false,
        error: "batchId is required for ship_batch",
        message: "缺少 batchId",
        requestId: options.requestId,
        httpStatus: 400,
      }).catch(() => undefined)
    }
    return result
  }

  if (options.syncTaskId) {
    await markSyncTaskRunning({
      syncTaskId: options.syncTaskId,
      organizationId: options.organizationId,
      requestId: options.requestId,
      message: `开始提交交运批次 ${options.batchId}`,
    }).catch(() => undefined)
  }

  // 1) 加载批次 + 校验组织
  const [batch] = await db
    .select()
    .from(fulfillmentBatches)
    .where(
      and(
        eq(fulfillmentBatches.id, options.batchId),
        options.organizationId
          ? eq(fulfillmentBatches.organizationId, options.organizationId)
          : sql`true`
      )
    )
    .limit(1)
  if (!batch) {
    const message = `批次不存在：${options.batchId}`
    result.errors.push({ shopId: "", resource: "ship_batch", message })
    if (options.syncTaskId) {
      await markSyncTaskFinished({
        syncTaskId: options.syncTaskId,
        organizationId: options.organizationId,
        ok: false,
        error: message,
        message,
        requestId: options.requestId,
        httpStatus: 404,
      }).catch(() => undefined)
    }
    return result
  }

  // 2) 加载批次包裹 + 关联 shipment / order / order_lines
  const links = await db
    .select()
    .from(fulfillmentBatchPackages)
    .where(eq(fulfillmentBatchPackages.batchId, batch.id))
  if (links.length === 0) {
    const message = `批次 ${batch.batchNo} 内没有包裹，不能提交交运`
    result.errors.push({ shopId: "", resource: "ship_batch", message })
    if (options.syncTaskId) {
      await markSyncTaskFinished({
        syncTaskId: options.syncTaskId,
        organizationId: options.organizationId,
        ok: false,
        error: message,
        message,
        requestId: options.requestId,
        httpStatus: 400,
      }).catch(() => undefined)
    }
    return result
  }

  const shipmentIds = links.map((l) => l.shipmentId)
  const shipRows = await db
    .select()
    .from(shipments)
    .where(inArray(shipments.id, shipmentIds))
  // 按 shop 分组
  const byShop = new Map<string, typeof shipRows>()
  for (const s of shipRows) {
    const list = byShop.get(s.shopId) ?? []
    list.push(s)
    byShop.set(s.shopId, list)
  }

  result.shops = byShop.size
  let totalShipped = 0
  const allFailures: { shopId: string; message: string }[] = []

  for (const [shopId, ships] of byShop) {
    const shop = await loadOneShop(shopId)
    if (!shop) {
      allFailures.push({ shopId, message: "店铺不存在或未激活" })
      continue
    }
    // 加载该 shop 下所有 order_lines 用于补 orderItemIds
    const orderIds = [...new Set(ships.map((s) => s.orderId))]
    const lines = await db
      .select()
      .from(orderLines)
      .where(inArray(orderLines.orderId, orderIds))
    const linesByOrder = new Map<string, typeof lines>()
    for (const l of lines) {
      const list = linesByOrder.get(l.orderId) ?? []
      list.push(l)
      linesByOrder.set(l.orderId, list)
    }

    const packages: DomainBatchShipPackage[] = ships.map((s) => {
      const orderLinesForShip = linesByOrder.get(s.orderId) ?? []
      return {
        externalOrderId: s.externalPackageId, // 占位；下面用 order.externalOrderId 替换
        externalPackageId: s.externalPackageId,
        platformPackageId: undefined,
        orderItemIds: orderLinesForShip
          .map((l) => l.externalLineId)
          .filter((v): v is string => Boolean(v)),
        trackingNumber: s.trackingNumber ?? undefined,
        shipmentProviderCode: s.providerCode ?? undefined,
      }
    })
    // 用 order.externalOrderId 替换 externalOrderId（shipment 不直接存 externalOrderId）
    const orderMap = await loadOrderMap(shopId, orderIds)
    for (const pkg of packages) {
      const ship = ships.find((s) => s.externalPackageId === pkg.externalPackageId)
      if (ship) {
        pkg.externalOrderId = orderMap.get(ship.orderId)?.externalOrderId ?? ""
        pkg.orderItemIds = (linesByOrder.get(ship.orderId) ?? [])
          .map((l) => l.externalLineId)
          .filter((v): v is string => Boolean(v))
      }
    }

    let connector
    try {
      connector = await connectorForShop(shop)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      allFailures.push({ shopId, message })
      await logIntegration({
        shopId,
        action: "ship_batch.connector",
        status: "error",
        message,
        payloadSummary: { batchId: batch.id, batchNo: batch.batchNo },
      })
      continue
    }

    const input: DomainBatchShipInput = { batchId: batch.id, packages }
    let shipResult
    try {
      shipResult = await shipBatchViaConnector(connector, input)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      allFailures.push({ shopId, message })
      await logIntegration({
        shopId,
        action: "ship_batch",
        status: "error",
        message,
        payloadSummary: { batchId: batch.id, batchNo: batch.batchNo },
      })
      continue
    }

    totalShipped += shipResult.shippedCount
    // 推进成功包裹的 shipment 状态
    const succeededIds = ships
      .filter((s) =>
        shipResult!.failures.every((f) => f.externalPackageId !== s.externalPackageId)
      )
      .map((s) => s.id)
    if (succeededIds.length > 0) {
      await db
        .update(shipments)
        .set({ status: "shipped", shippedAt: now, updatedAt: now })
        .where(inArray(shipments.id, succeededIds))
    }
    for (const failure of shipResult.failures) {
      allFailures.push({ shopId, message: `${failure.externalPackageId}: ${failure.message}` })
    }
    await logIntegration({
      shopId,
      action: "ship_batch",
      status: shipResult.ok ? "success" : "error",
      message: `${shop.platform} batch ${batch.batchNo} shipped ${shipResult.shippedCount}/${packages.length}`,
      payloadSummary: {
        batchId: batch.id,
        batchNo: batch.batchNo,
        shipped: shipResult.shippedCount,
        failures: shipResult.failures,
      },
    })
    await markState({ shopId, resource: "logistics", now })
  }

  result.shipments = totalShipped
  for (const f of allFailures) {
    result.errors.push({ shopId: f.shopId, resource: "ship_batch", message: f.message })
  }

  // 推进批次状态：全部成功 → accepted；部分失败 → rejected（保留 submitted 标记）
  if (options.organizationId || batch.organizationId) {
    const ok = result.errors.length === 0
    await db
      .update(fulfillmentBatches)
      .set({
        status: ok ? "accepted" : "rejected",
        handedOverAt: ok ? batch.handedOverAt ?? now : batch.handedOverAt,
        updatedAt: now,
      })
      .where(eq(fulfillmentBatches.id, batch.id))
  }

  if (options.syncTaskId) {
    const ok = result.errors.length === 0
    await markSyncTaskFinished({
      syncTaskId: options.syncTaskId,
      organizationId: options.organizationId,
      ok,
      progressDone: totalShipped,
      progressTotal: shipRows.length,
      error: ok
        ? null
        : result.errors.map((e) => `${e.shopId}:${e.message}`).join("; "),
      message: ok
        ? `批次 ${batch.batchNo} 交运完成（${totalShipped}/${shipRows.length}）`
        : `批次 ${batch.batchNo} 交运部分失败（${totalShipped}/${shipRows.length}）`,
      detail: JSON.stringify(result).slice(0, 4000),
      requestId: options.requestId,
      httpStatus: ok ? 200 : 502,
    }).catch(() => undefined)
  }

  return result
}

async function loadOneShop(shopId: string): Promise<MarketplaceSyncShop | null> {
  const [row] = await db
    .select({
      id: shops.id,
      organizationId: shops.organizationId,
      platform: shops.platform,
      name: shops.name,
      region: shops.region,
      currency: shops.currency,
      meta: shops.meta,
    })
    .from(shops)
    .where(eq(shops.id, shopId))
    .limit(1)
  return row ?? null
}

async function loadOrderMap(shopId: string, orderIds: string[]) {
  if (orderIds.length === 0) return new Map<string, { externalOrderId: string }>()
  const rows = await db
    .select({ id: orders.id, externalOrderId: orders.externalOrderId })
    .from(orders)
    .where(and(eq(orders.shopId, shopId), inArray(orders.id, orderIds)))
  return new Map(rows.map((r) => [r.id, { externalOrderId: r.externalOrderId }]))
}
