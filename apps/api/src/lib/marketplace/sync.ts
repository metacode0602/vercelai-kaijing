import { createHash } from "node:crypto"
import { and, desc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm"
import {
  integrationLogs,
  integrationStates,
  listings,
  orderLines,
  orders,
  orderStatusEvents,
  productReviewMedia,
  productReviews,
  shipments,
  shops,
  trackingEvents,
  type ShipmentStatus,
} from "@workspace/db"
import type {
  DomainOrder,
  DomainOrderTrace,
  DomainReview,
  DomainTracePackage,
} from "@workspace/marketplace"
import { db } from "../db"
import { createShopConnector } from "./connector"
import { isLazopPlatform } from "./app-env"
import { maybeAutoReserveSyncedOrder } from "./reserve"
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
    inArray(shops.platform, ["daraz", "lazada"]),
    inArray(shops.status, ["active", "error"]),
    isNull(shops.deletedAt),
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
    })
    .from(shops)
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
  if (!isLazopPlatform(shop.platform)) {
    return { orders: 0, reserved: 0, itemErrors: [] }
  }
  const connector = createShopConnector(shop)
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
  const connector = createShopConnector(shop)
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
  const connector = createShopConnector(shop)
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
  const connector = createShopConnector(input.shop)
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
    await maybeAutoReserveSyncedOrder({
      organizationId: input.shop.organizationId,
      shopId: input.shop.id,
      orderId: saved.orderId,
      externalOrderId: input.externalOrderId,
      status: saved.status,
    })
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
