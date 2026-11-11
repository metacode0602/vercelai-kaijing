import { nanoid } from "nanoid"
import { and, eq, inArray } from "drizzle-orm"
import {
  listings,
  products,
  sellerSkuMappings,
  type Listing,
} from "@workspace/db"
import type { DomainProduct } from "@workspace/marketplace"
import { toLocalListingStatus } from "@workspace/marketplace"
import { db } from "../db"
import { createShopConnector } from "./connector"
import { isOrderListingSyncPlatform } from "./app-env"
import { mergeListingPayload, nextLiveAt } from "./listing-merge"
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

/**
 * 定位本地刊登：
 * 1) 按 (shopId, externalItemId) 精确匹配；
 * 2) 未命中时按 seller_sku_mappings.sellerSku 反查本地草稿并回填 externalItemId，
 *    避免平台行与本地草稿各存一条「幽灵重复行」。
 */
async function findExistingListing(input: {
  shop: MarketplaceSyncShop
  product: DomainProduct
}): Promise<typeof listings.$inferSelect | null> {
  const { shop, product } = input
  const [byExternal] = await db
    .select()
    .from(listings)
    .where(
      and(
        eq(listings.shopId, shop.id),
        eq(listings.externalItemId, product.externalId)
      )
    )
    .limit(1)
  if (byExternal) return byExternal

  const sellerSkus = (product.skus ?? [])
    .map((sku) => (sku.sellerSku ?? "").trim())
    .filter(Boolean)
  if (sellerSkus.length === 0) return null

  const maps = await db
    .select({
      listingId: sellerSkuMappings.listingId,
      variantId: sellerSkuMappings.variantId,
    })
    .from(sellerSkuMappings)
    .where(
      and(
        eq(sellerSkuMappings.organizationId, shop.organizationId),
        eq(sellerSkuMappings.shopId, shop.id),
        inArray(sellerSkuMappings.sellerSku, sellerSkus)
      )
    )
    .limit(10)
  const listingId = maps.find((row) => row.listingId)?.listingId
  if (!listingId) return null
  const [byMapping] = await db
    .select()
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1)
  return byMapping ?? null
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

  const existing = await findExistingListing({ shop, product })

  const primarySku = product.skus?.[0]
  // 平台状态归一到本地值域（draft/pending_review/live/failed/offline），
  // publishState 统一 published：能被拉到即平台侧存在。
  const values = {
    organizationId: shop.organizationId,
    shopId: shop.id,
    productId,
    marketplaceId: shop.platform,
    status: toLocalListingStatus(product.status),
    title: product.title,
    listingTitle: product.title,
    externalItemId: product.externalId,
    priceAmount: primarySku?.priceAmount,
    priceCurrency: primarySku?.priceCurrency ?? shop.currency,
    stockOnHand: primarySku?.quantity ?? null,
    publishState: "published",
    payload: mergeListingPayload({
      existing: existing?.payload,
      platformRaw: product.raw,
      shop: { name: shop.name, platform: shop.platform, site: shop.region },
    }),
    liveAt: nextLiveAt({
      platformStatus: product.status,
      existingLiveAt: existing?.liveAt ?? null,
      now,
    }),
    updatedAt: now,
  }

  let listingId = existing?.id
  let variantId = existing?.primaryVariantId ?? existing?.variantId ?? null
  if (!listingId) {
    listingId = nanoid()
    await db.insert(listings).values({
      id: listingId,
      ...values,
      primaryVariantId: variantId,
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
      if (!variantId && map.variantId) variantId = map.variantId
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

  // 平台行补 primaryVariantId，让「商品与刊登」列表能聚合到本地 SKU。
  if (variantId && (!existing?.primaryVariantId || !existing?.variantId)) {
    await db
      .update(listings)
      .set({
        primaryVariantId: existing?.primaryVariantId ?? variantId,
        variantId: existing?.variantId ?? variantId,
        updatedAt: now,
      })
      .where(eq(listings.id, listingId))
  }

  return { listingId, created: !existing }
}

export async function syncListingsForShop(
  shop: MarketplaceSyncShop,
  now: Date
): Promise<{ listings: number }> {
  if (!isOrderListingSyncPlatform(shop.platform)) return { listings: 0 }
  const connector = await createShopConnector({
    id: shop.id,
    organizationId: shop.organizationId,
    platform: shop.platform,
    region: shop.region,
    shopCipher:
      shop.meta && typeof shop.meta.shopCipher === "string"
        ? shop.meta.shopCipher
        : shop.meta && typeof shop.meta.shop_cipher === "string"
          ? shop.meta.shop_cipher
          : null,
  })
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
