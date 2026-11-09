/**
 * 刊登类型与常量。
 * 主路径已切 tRPC → dataaccess/listings → PostgreSQL（见 routers/listings、console/listings）。
 * 本文件不再读写 localStorage / mock；页面请使用 `trpc.listings.*`。
 */

import type {
  UiListingPublishState,
  UiListingStatus,
} from '@/lib/server/mappers/listings'

export const LISTING_STATUSES = ['草稿', '待审', '在售', '失败', '下架'] as const
export type ListingStatus = UiListingStatus

export const LISTING_PUBLISH_STATES = ['未发布', '待同步', '已发布', '同步失败'] as const
export type ListingPublishState = UiListingPublishState

export type ListingMappingLine = {
  id: string
  shop: string
  platform: string
  site: string
  itemId: string
  sellerSku: string
  internalSku: string
  color: string
  size: string
  listingStatus: string
  mappingStatus: string
  href?: string
}

export type ShopListing = {
  id: string
  spu: string
  sku: string
  shopId: string
  shopName: string
  platform: string
  site: string
  sellerSku: string
  title: string
  sellPrice: number
  currency: string
  status: ListingStatus
  publishState: ListingPublishState
  stockOnHand: number
  warehouseCode: string
  logisticsChannel: string
  brandName: string
  brandExternalId: string
  categoryPath: string
  categoryExternalId: string
  externalItemId: string
  platformSku: string
  lastError: string
  submittedAt: string
  liveAt: string
  updatedAt: string
  note: string
  mappingLines: ListingMappingLine[]
}

export type ListingListRow = {
  id: string
  title: string
  sku: string
  spu: string
  shop: string
  shopId: string
  platform: string
  status: ListingStatus
  publishState: ListingPublishState
  brandName: string
  categoryPath: string
  externalItemId: string
  stockOnHand: number
  warehouseCode: string
  logisticsChannel: string
  priceAmount: number
  priceCurrency: string
  sellerSku: string
  updatedAt: string
  lastError: string
  mappingLineCount: number
}

/** @deprecated 主路径已禁用 localStorage */
export function useListings(): ShopListing[] {
  if (typeof console !== 'undefined') {
    console.warn('[listing-store] useListings() 已停用 localStorage。请改用 trpc.listings.list / get。')
  }
  return []
}

/** @deprecated */
export function getListings(): ShopListing[] {
  return []
}

/** @deprecated */
export function getListingById(_id: string): ShopListing | undefined {
  return undefined
}

export function toListingListRow(listing: ShopListing): ListingListRow {
  return {
    id: listing.id,
    title: listing.title,
    sku: listing.sku,
    spu: listing.spu,
    shop: listing.shopName,
    shopId: listing.shopId,
    platform: listing.platform,
    status: listing.status,
    publishState: listing.publishState,
    brandName: listing.brandName || '—',
    categoryPath: listing.categoryPath || '—',
    externalItemId: listing.externalItemId || '—',
    stockOnHand: listing.stockOnHand,
    warehouseCode: listing.warehouseCode || '—',
    logisticsChannel: listing.logisticsChannel || '—',
    priceAmount: listing.sellPrice,
    priceCurrency: listing.currency,
    sellerSku: listing.sellerSku,
    updatedAt: listing.updatedAt,
    lastError: listing.lastError,
    mappingLineCount: listing.mappingLines.length,
  }
}

export function toRelatedListingShape(listing: ShopListing | Record<string, unknown>) {
  const row = listing as ShopListing
  return {
    id: row.id,
    sku: row.sku,
    spu: row.spu,
    shop: row.shopName ?? (listing as { shop?: string }).shop,
    platform: row.platform,
    site: row.site,
    sellerSku: row.sellerSku,
    title: row.title,
    sellPrice: row.sellPrice,
    currency: row.currency,
    status: row.status,
    publishState: row.publishState,
    stockOnHand: row.stockOnHand,
    externalItemId: row.externalItemId || '—',
  }
}

/** @deprecated */
export function createListing(_input: unknown): { ok: false; reason: string } {
  return { ok: false, reason: 'listing-store 已停用，请使用 trpc.listings.create' }
}

/** @deprecated */
export function updateListing(_id: string, _patch: unknown): { ok: false; reason: string } {
  return { ok: false, reason: 'listing-store 已停用，请使用 trpc.listings.update' }
}

/** @deprecated */
export function addListingMappingLine(
  _listingId: string,
  _input: unknown,
): { ok: false; reason: string } {
  return { ok: false, reason: 'listing-store 已停用，请使用 trpc.listings.addMappingLine' }
}

export function listingMappingHref(line: Pick<ListingMappingLine, 'id' | 'shop' | 'sellerSku' | 'href'>) {
  if (line.href) return line.href
  return `/console/mappings/${encodeURIComponent(line.id)}`
}
