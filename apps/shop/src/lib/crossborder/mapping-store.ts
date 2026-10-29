'use client'

/**
 * seller_sku_mappings 原型会话 store（schema §3.2）。
 * 唯一键：店铺 + Seller SKU。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'
import {
  ERP_DEMO_MAPPINGS,
  type DemoMapping,
  type DemoStatus,
} from '@/lib/crossborder/erp-ued-data'

export type MappingRecord = DemoMapping

export type CreateMappingInput = {
  shop: string
  platform: string
  site: string
  itemId: string
  sellerSku: string
  internalSku: string
  color: string
  size: string
  listingStatus?: string
  mappingStatus?: DemoStatus
}

export type UpdateMappingInput = Partial<
  Pick<
    DemoMapping,
    | 'platform'
    | 'site'
    | 'itemId'
    | 'internalSku'
    | 'color'
    | 'size'
    | 'listingStatus'
    | 'mappingStatus'
  >
>

function mappingKey(shop: string, sellerSku: string) {
  return `${shop}::${sellerSku}`
}

const seed = structuredClone(ERP_DEMO_MAPPINGS) as MappingRecord[]
const store = createDemoStore<MappingRecord[]>('open-shop.console.demo.mappings.v1', seed)

export function useMappings() {
  return store.useStore()
}

export function getMappings() {
  return store.get()
}

export function getMapping(shop: string, sellerSku: string) {
  return store.get().find((item) => item.shop === shop && item.sellerSku === sellerSku)
}

export function getMappingByRouteId(id: string) {
  const [shop, sellerSku] = id.split('::')
  if (!shop || !sellerSku) return undefined
  return getMapping(shop, sellerSku)
}

export function mappingRouteId(row: Pick<DemoMapping, 'shop' | 'sellerSku'>) {
  return mappingKey(row.shop, row.sellerSku)
}

export function createMapping(input: CreateMappingInput): MappingRecord {
  const row: MappingRecord = {
    shop: input.shop.trim(),
    platform: input.platform.trim(),
    site: input.site.trim(),
    itemId: input.itemId.trim(),
    sellerSku: input.sellerSku.trim(),
    internalSku: input.internalSku.trim(),
    color: input.color.trim(),
    size: input.size.trim(),
    listingStatus: input.listingStatus ?? '待同步',
    mappingStatus: input.mappingStatus ?? '待确认',
  }
  const list = store.get().filter(
    (item) => !(item.shop === row.shop && item.sellerSku === row.sellerSku),
  )
  store.set([row, ...list])
  return row
}

export function updateMapping(
  shop: string,
  sellerSku: string,
  patch: UpdateMappingInput,
): MappingRecord | null {
  const list = store.get()
  const index = list.findIndex((item) => item.shop === shop && item.sellerSku === sellerSku)
  if (index < 0) return null
  const next = { ...list[index]!, ...patch }
  const copy = [...list]
  copy[index] = next
  store.set(copy)
  return next
}
