'use client'

/**
 * 刊登原型会话 store（P0）：头（listing）+ 映射行（seller_sku_mappings 投影）。
 * 替换 MOCK_LISTING_* 本地只读；同步任务仍为原型，不接真实 connector。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'
import { ERP_DEMO_LISTINGS } from '@/lib/crossborder/erp-ued-data'
import { createMapping, getMappings, mappingRouteId } from '@/lib/crossborder/mapping-store'

export const LISTING_STATUSES = ['草稿', '待审', '在售', '失败', '下架'] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

export const LISTING_PUBLISH_STATES = ['未发布', '待同步', '已发布', '同步失败'] as const
export type ListingPublishState = (typeof LISTING_PUBLISH_STATES)[number]

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

function nowDate() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function shopIdOf(shopName: string, platform: string): string {
  if (shopName.includes('Daraz') || platform.toLowerCase() === 'daraz') {
    return 'b5ofcwj2mzauov29y08m0q99'
  }
  if (shopName.includes('Lazada') || platform.toLowerCase() === 'lazada') {
    return 's8v7xkqw0asyz4zhswxwzdd3'
  }
  if (shopName.includes('TikTok') || platform.toLowerCase().includes('tiktok')) {
    return 'kqw7alhkgefjmffogbib1z79'
  }
  return 'b5ofcwj2mzauov29y08m0q99'
}

function publishOf(status: ListingStatus): ListingPublishState {
  if (status === '在售') return '已发布'
  if (status === '失败') return '同步失败'
  if (status === '待审') return '待同步'
  return '未发布'
}

function seedLine(listing: (typeof ERP_DEMO_LISTINGS)[number]): ListingMappingLine {
  return {
    id: `${listing.id}::${listing.sellerSku}`,
    shop: listing.shop,
    platform: listing.platform,
    site: listing.site,
    itemId: listing.id.replace('lst-', 'ITEM-'),
    sellerSku: listing.sellerSku,
    internalSku: listing.sku,
    color: listing.title.includes('White') ? 'White' : listing.title.includes('Black') ? 'Black' : '—',
    size: listing.title.includes(' L') || listing.sku.endsWith('001') || listing.sku.endsWith('002') ? 'L' : '—',
    listingStatus: listing.status === '在售' ? '在线' : listing.status === '草稿' ? '草稿' : '待同步',
    mappingStatus: listing.status === '失败' ? '异常' : listing.status === '草稿' ? '待确认' : '启用',
  }
}

export const DEMO_LISTINGS: ShopListing[] = ERP_DEMO_LISTINGS.map((item) => {
  const line = seedLine(item)
  return {
    id: item.id,
    spu: item.spu,
    sku: item.sku,
    shopId: shopIdOf(item.shop, item.platform),
    shopName: item.shop,
    platform: item.platform,
    site: item.site,
    sellerSku: item.sellerSku,
    title: item.title,
    sellPrice: item.sellPrice,
    currency: item.currency,
    status: item.status as ListingStatus,
    publishState: publishOf(item.status as ListingStatus),
    stockOnHand: item.stockOnHand,
    warehouseCode: 'WH-CN-XMN-001',
    logisticsChannel: item.platform === 'Daraz' ? 'Daraz Logistics' : 'Lazada LGS',
    brandName: item.spu === 'HSY000002' ? 'Generic Hub' : 'Cotton Basic',
    brandExternalId: item.spu === 'HSY000002' ? 'BR-HUB' : 'BR-TEE',
    categoryPath:
      item.spu === 'HSY000002'
        ? 'Electronics > Computer Accessories > Hubs'
        : 'Fashion > Men > T-Shirts',
    categoryExternalId: item.spu === 'HSY000002' ? 'CAT-HUB' : 'CAT-TEE',
    externalItemId: item.status === '在售' ? item.id.replace('lst-', '') : '',
    platformSku: item.sellerSku,
    lastError: item.status === '失败' ? '类目属性缺失（示例）' : '',
    submittedAt: item.status === '草稿' ? '' : item.updatedAt,
    liveAt: item.status === '在售' ? item.updatedAt : '',
    updatedAt: item.updatedAt,
    note: item.note ?? '',
    mappingLines: [line],
  }
})

const seed = structuredClone(DEMO_LISTINGS) as ShopListing[]
const store = createDemoStore<ShopListing[]>('open-shop.console.demo.listings.v1', seed)

function mutate(updater: (current: ShopListing[]) => ShopListing[]) {
  store.set(updater(store.get()))
}

export function useListings() {
  return store.useStore()
}

export function getListings() {
  return store.get()
}

export function getListingById(id: string) {
  return store.get().find((item) => item.id === id)
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

export function toRelatedListingShape(listing: ShopListing) {
  return {
    id: listing.id,
    sku: listing.sku,
    spu: listing.spu,
    shop: listing.shopName,
    platform: listing.platform,
    site: listing.site,
    sellerSku: listing.sellerSku,
    title: listing.title,
    sellPrice: listing.sellPrice,
    currency: listing.currency,
    status: listing.status,
    publishState: listing.publishState,
    stockOnHand: listing.stockOnHand,
    externalItemId: listing.externalItemId || '—',
  }
}

function nextListingId(list: ShopListing[]) {
  let max = 100
  for (const item of list) {
    const matched = /^lst-new-(\d+)$/.exec(item.id)
    if (matched) max = Math.max(max, Number(matched[1]))
  }
  return `lst-new-${max + 1}`
}

export function createListing(input: {
  shopName: string
  platform: string
  site: string
  sku: string
  spu?: string
  sellerSku: string
  title: string
  sellPrice: number
  currency: string
  status?: ListingStatus
  warehouseCode?: string
  logisticsChannel?: string
  brandName?: string
  categoryPath?: string
  note?: string
}): { ok: true; listing: ShopListing } | { ok: false; reason: string } {
  if (!input.shopName.trim()) return { ok: false, reason: '请选择店铺' }
  if (!input.platform.trim()) return { ok: false, reason: '请选择平台' }
  if (!input.site.trim()) return { ok: false, reason: '请选择站点' }
  if (!input.sku.trim()) return { ok: false, reason: '请选择内部 SKU' }
  if (!input.sellerSku.trim()) return { ok: false, reason: '请填写 Seller SKU' }
  if (!input.title.trim()) return { ok: false, reason: '请填写刊登标题' }
  if (!Number.isFinite(input.sellPrice) || input.sellPrice <= 0) {
    return { ok: false, reason: '售价必须大于 0' }
  }

  const dup = store
    .get()
    .find(
      (item) =>
        item.shopName === input.shopName.trim() &&
        item.sellerSku === input.sellerSku.trim(),
    )
  if (dup) {
    return { ok: false, reason: `店铺 ${input.shopName} 已存在 Seller SKU ${input.sellerSku}` }
  }

  const status = input.status ?? '草稿'
  const spu = input.spu?.trim() || input.sku.trim().slice(0, 9)
  const id = nextListingId(store.get())
  const line: ListingMappingLine = {
    id: `${id}::${input.sellerSku.trim()}`,
    shop: input.shopName.trim(),
    platform: input.platform.trim(),
    site: input.site.trim(),
    itemId: '',
    sellerSku: input.sellerSku.trim(),
    internalSku: input.sku.trim(),
    color: '—',
    size: '—',
    listingStatus: status === '在售' ? '在线' : '草稿',
    mappingStatus: '待确认',
  }
  const listing: ShopListing = {
    id,
    spu,
    sku: input.sku.trim(),
    shopId: shopIdOf(input.shopName, input.platform),
    shopName: input.shopName.trim(),
    platform: input.platform.trim(),
    site: input.site.trim(),
    sellerSku: input.sellerSku.trim(),
    title: input.title.trim(),
    sellPrice: input.sellPrice,
    currency: input.currency.trim() || 'USD',
    status,
    publishState: publishOf(status),
    stockOnHand: 0,
    warehouseCode: input.warehouseCode?.trim() || 'WH-CN-XMN-001',
    logisticsChannel: input.logisticsChannel?.trim() || '—',
    brandName: input.brandName?.trim() || '—',
    brandExternalId: '',
    categoryPath: input.categoryPath?.trim() || '—',
    categoryExternalId: '',
    externalItemId: '',
    platformSku: input.sellerSku.trim(),
    lastError: '',
    submittedAt: '',
    liveAt: '',
    updatedAt: nowDate(),
    note: input.note?.trim() || '原型新建刊登',
    mappingLines: [line],
  }

  // 双向：同步写入 mapping-store（若尚无）
  const existing = getMappings().find(
    (item) => item.shop === listing.shopName && item.sellerSku === listing.sellerSku,
  )
  if (!existing) {
    createMapping({
      shop: listing.shopName,
      platform: listing.platform,
      site: listing.site,
      itemId: line.itemId || listing.id,
      sellerSku: listing.sellerSku,
      internalSku: listing.sku,
      color: line.color,
      size: line.size,
      listingStatus: line.listingStatus,
      mappingStatus: '待确认',
    })
  }

  mutate((list) => [listing, ...list])
  return { ok: true, listing }
}

export function updateListing(
  id: string,
  patch: Partial<
    Pick<
      ShopListing,
      | 'title'
      | 'sellPrice'
      | 'currency'
      | 'status'
      | 'publishState'
      | 'warehouseCode'
      | 'logisticsChannel'
      | 'brandName'
      | 'categoryPath'
      | 'note'
      | 'stockOnHand'
      | 'externalItemId'
      | 'lastError'
    >
  >,
): { ok: true; listing: ShopListing } | { ok: false; reason: string } {
  const current = getListingById(id)
  if (!current) return { ok: false, reason: '刊登不存在' }
  if (patch.sellPrice != null && (!Number.isFinite(patch.sellPrice) || patch.sellPrice <= 0)) {
    return { ok: false, reason: '售价必须大于 0' }
  }
  if (patch.title != null && !patch.title.trim()) {
    return { ok: false, reason: '标题不能为空' }
  }

  let updated!: ShopListing
  mutate((list) =>
    list.map((item) => {
      if (item.id !== id) return item
      const status = patch.status ?? item.status
      updated = {
        ...item,
        ...patch,
        title: patch.title?.trim() ?? item.title,
        status,
        publishState: patch.publishState ?? (patch.status ? publishOf(status) : item.publishState),
        updatedAt: nowDate(),
        liveAt: status === '在售' ? item.liveAt || nowDate() : item.liveAt,
        submittedAt:
          status !== '草稿' && !item.submittedAt ? nowDate() : item.submittedAt,
      }
      return updated
    }),
  )
  return { ok: true, listing: updated }
}

export function addListingMappingLine(
  listingId: string,
  input: {
    sellerSku: string
    internalSku: string
    color?: string
    size?: string
    itemId?: string
  },
): { ok: true; listing: ShopListing; line: ListingMappingLine } | { ok: false; reason: string } {
  const current = getListingById(listingId)
  if (!current) return { ok: false, reason: '刊登不存在' }
  if (!input.sellerSku.trim()) return { ok: false, reason: '请填写 Seller SKU' }
  if (!input.internalSku.trim()) return { ok: false, reason: '请选择内部 SKU' }
  if (current.mappingLines.some((line) => line.sellerSku === input.sellerSku.trim())) {
    return { ok: false, reason: '该刊登下 Seller SKU 已存在' }
  }

  const line: ListingMappingLine = {
    id: `${listingId}::${input.sellerSku.trim()}`,
    shop: current.shopName,
    platform: current.platform,
    site: current.site,
    itemId: input.itemId?.trim() || current.externalItemId || '',
    sellerSku: input.sellerSku.trim(),
    internalSku: input.internalSku.trim(),
    color: input.color?.trim() || '—',
    size: input.size?.trim() || '—',
    listingStatus: current.status === '在售' ? '在线' : '草稿',
    mappingStatus: '待确认',
  }

  const existing = getMappings().find(
    (item) => item.shop === current.shopName && item.sellerSku === line.sellerSku,
  )
  if (!existing) {
    createMapping({
      shop: current.shopName,
      platform: current.platform,
      site: current.site,
      itemId: line.itemId || current.id,
      sellerSku: line.sellerSku,
      internalSku: line.internalSku,
      color: line.color,
      size: line.size,
      listingStatus: line.listingStatus,
      mappingStatus: '待确认',
    })
  }

  let updated!: ShopListing
  mutate((list) =>
    list.map((item) => {
      if (item.id !== listingId) return item
      updated = {
        ...item,
        mappingLines: [...item.mappingLines, line],
        updatedAt: nowDate(),
      }
      return updated
    }),
  )
  return { ok: true, listing: updated, line }
}

export function listingMappingHref(line: ListingMappingLine) {
  return `/console/mappings/${encodeURIComponent(mappingRouteId(line))}`
}
