/**
 * Seller SKU 映射类型与助手。
 * 主路径已切 tRPC → dataaccess/mappings → PostgreSQL（见 routers/mappings、console/mappings）。
 * 本文件不再读写 localStorage / mock；页面请使用 `trpc.mappings.*`。
 */

import type { UiMappingStatus } from '@/lib/server/mappers/listings'

export type DemoStatus = UiMappingStatus

export type MappingRecord = {
  id?: string
  shop: string
  platform: string
  site: string
  itemId: string
  platformSkuId: string
  sellerSku: string
  internalSku: string
  color: string
  size: string
  listingStatus: string
  mappingStatus: DemoStatus
}

export type CreateMappingInput = {
  shop: string
  platform: string
  site: string
  itemId: string
  platformSkuId?: string
  sellerSku: string
  internalSku: string
  color: string
  size: string
  listingStatus?: string
  mappingStatus?: DemoStatus
}

export type UpdateMappingInput = Partial<
  Pick<
    MappingRecord,
    | 'platform'
    | 'site'
    | 'itemId'
    | 'platformSkuId'
    | 'internalSku'
    | 'color'
    | 'size'
    | 'listingStatus'
    | 'mappingStatus'
  >
>

export function mappingRouteId(row: Pick<MappingRecord, 'shop' | 'sellerSku'> & { id?: string }) {
  if (row.id) return row.id
  return `${row.shop}::${row.sellerSku}`
}

/** @deprecated 主路径已禁用 localStorage */
export function useMappings(): MappingRecord[] {
  if (typeof console !== 'undefined') {
    console.warn('[mapping-store] useMappings() 已停用 localStorage。请改用 trpc.mappings.list / get。')
  }
  return []
}

/** @deprecated */
export function getMappings(): MappingRecord[] {
  return []
}

/** @deprecated */
export function getMapping(_shop: string, _sellerSku: string): MappingRecord | undefined {
  return undefined
}

/** @deprecated */
export function getMappingByRouteId(_id: string): MappingRecord | undefined {
  return undefined
}

/** @deprecated */
export function createMapping(_input: CreateMappingInput): never {
  throw new Error('mapping-store 已停用，请使用 trpc.mappings.create')
}

/** @deprecated */
export function updateMapping(_shop: string, _sellerSku: string, _patch: UpdateMappingInput): null {
  return null
}
