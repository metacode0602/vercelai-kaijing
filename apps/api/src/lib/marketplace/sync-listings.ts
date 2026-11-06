import { nanoid } from "nanoid"
import { and, eq } from "drizzle-orm"
import {
  listings,
  products,
  sellerSkuMappings,
  type Listing,
} from "@workspace/db"
import type { DomainProduct } from "@workspace/marketplace"
import { db } from "../db"
import { createShopConnector } from "./connector"
import { isLazopPlatform } from "./app-env"
import type { MarketplaceSyncShop } from "./sync"

function envInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

async function ensurePlatformProduct(input: {
  organizationId: string
  externalId: string
  title: string
  now: Date
}): Promise<string> {
  const spuCode = `PLT-${input.externalId}`.slice(0, 32)
  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.organizationId, input.organizationId),
        eq(products.spuCode, spuCode)
      )
    )
    .limit(1)
  if (existing) {
    await db
      .update(products)
      .set({
        title: input.title || existing.id,
        status: "active",
        source: "platform_sync",
        updatedAt: input.now,
      })
      .where(eq(products.id, existing.id))
    return existing.id
  }
  const id = nanoid()
  await db.insert(products).values({
    id,
    organizationId: input.organizationId,
    spuCode,
    title: input.title || spuCode,
    status: "active",
    source: "platform_sync",
    payload: { externalItemId: input.externalId },
    createdAt: input.now,
    updatedAt: input.now,
  })
  return id
}

async function upsertListingFromProduct(
  shop: MarketplaceSyncShop,
  product: DomainProduct,
  now: Date
): Promise<{ listingId: string; created: boolean }> {
  if (!product.externalId) throw new Error("product.externalId required")
  const productId = await ensurePlatformProduct({
    organizationId: shop.organizationId,
    externalId: product.externalId,
    title: product.title,
    now,
  })

  const [existing] = await db
    .select({ id: listings.id })
    .from(listings)
    .where(
      and(
        eq(listings.shopId, shop.id),
        eq(listings.externalItemId, product.externalId)
      )
    )
    .limit(1)

  const primarySku = product.skus?.[0]
  const values = {
    organizationId: shop.organizationId,
    shopId: shop.id,
    productId,
    marketplaceId: shop.platform,
    status: product.status || "live",
    title: product.title,
    listingTitle: product.title,
    externalItemId: product.externalId,
    priceAmount: primarySku?.priceAmount,
    priceCurrency: primarySku?.priceCurrency ?? shop.currency,
    stockOnHand: primarySku?.quantity ?? null,
    publishState: "synced",
    payload: product.raw ?? {},
    liveAt: product.status === "live" ? now : null,
    updatedAt: now,
  }

  let listingId = existing?.id
  if (!listingId) {
    listingId = nanoid()
    await db.insert(listings).values({
      id: listingId,
      ...values,
      createdAt: now,
    })
  } else {
    await db
      .update(listings)
      .set(values)
      .where(eq(listings.id, listingId))
  }

  for (const sku of product.skus ?? []) {
    const sellerSku = (sku.sellerSku || "").trim()
    if (!sellerSku) continue
    const [map] = await db
      .select({
        id: sellerSkuMappings.id,
        status: sellerSkuMappings.status,
        variantId: sellerSkuMappings.variantId,
      })
      .from(sellerSkuMappings)
      .where(
        and(
          eq(sellerSkuMappings.organizationId, shop.organizationId),
          eq(sellerSkuMappings.shopId, shop.id),
          eq(sellerSkuMappings.sellerSku, sellerSku)
        )
      )
      .limit(1)
    if (!map) {
      await db.insert(sellerSkuMappings).values({
        id: nanoid(),
        organizationId: shop.organizationId,
        shopId: shop.id,
        listingId,
        itemId: product.externalId,
        platformSkuId: sku.externalSkuId,
        sellerSku,
        status: "pending",
        source: "platform_sync",
        syncedAt: now,
        meta: { externalSkuId: sku.externalSkuId },
      })
    } else {
      await db
        .update(sellerSkuMappings)
        .set({
          listingId,
          itemId: product.externalId,
          platformSkuId: sku.externalSkuId ?? undefined,
          syncedAt: now,
          // keep existing status/variant — never auto-confirm
          updatedAt: now,
        })
        .where(eq(sellerSkuMappings.id, map.id))
    }
  }

  return { listingId, created: !existing }
}

export async function syncListingsForShop(
  shop: MarketplaceSyncShop,
  now: Date
): Promise<{ listings: number }> {
  if (!isLazopPlatform(shop.platform)) return { listings: 0 }
  const connector = createShopConnector(shop)
  if (!connector.listProducts) return { listings: 0 }

  const maxPages = envInt("MARKETPLACE_SYNC_LISTINGS_MAX_PAGES", 5)
  let cursor: string | null | undefined
  let count = 0
  for (let page = 0; page < maxPages; page += 1) {
    const result = await connector.listProducts({
      cursor: cursor ?? null,
      pageSize: 50,
    })
    for (const product of result.items) {
      if (!product.externalId) continue
      await upsertListingFromProduct(shop, product, now)
      count += 1
    }
    if (!result.nextCursor) break
    cursor = result.nextCursor
  }
  return { listings: count }
}

export type { Listing }
