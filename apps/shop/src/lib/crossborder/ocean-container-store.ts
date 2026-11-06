'use client'

/**
 * F22 海运柜次 — 类型与常量保留；主路径已切 tRPC → PostgreSQL。
 * @see apps/shop/src/lib/server/dataaccess/ocean.ts
 * @see docs/design/shop-module7-ocean-trpc.md
 */

export type OceanLotStatus =
  | '草稿'
  | '已订舱'
  | '在途'
  | '已到港'
  | '清关中'
  | '已入本地仓'
  | '已取消'

export type OceanLotLine = {
  id: string
  sku: string
  name: string
  qtyShipped: number
  qtyReceived: number
  qtyDamaged: number
}

export type OceanLot = {
  id: string
  lotCode: string
  containerNo: string
  containerType: string
  platform: string
  originPort: string
  destPort: string
  warehouse: string
  status: OceanLotStatus
  etd: string
  etaPort: string
  etaWarehouse: string
  notes: string
  lines: OceanLotLine[]
  freightMode?: string
  boxCount?: number
}

export type InventoryBucketRow = {
  id: string
  sku: string
  name: string
  warehouse: string
  inTransit: number
  customsClearing: number
  available: number
  damaged: number
}

/** @deprecated 主路径已停用；保留空实现以免旧引用崩溃。 */
export function useOceanLots(): OceanLot[] {
  return []
}

/** @deprecated */
export function getOceanLots(): OceanLot[] {
  return []
}

/** @deprecated */
export function upsertOceanLot(_lot: OceanLot) {
  throw new Error('ocean-container-store 已停用，请使用 trpc.ocean.*')
}

/** @deprecated */
export function advanceOceanLotStatus(_id: string) {
  throw new Error('ocean-container-store 已停用，请使用 trpc.ocean.advance')
}

/** @deprecated 请使用 trpc.ocean.inventoryBuckets */
export function inventoryBucketsFromLots(_lots: OceanLot[] = []): InventoryBucketRow[] {
  return []
}

/** @deprecated 请使用 trpc.ocean.stats */
export function oceanLotKpi(_lots: OceanLot[] = []) {
  return { total: 0, inTransit: 0, clearing: 0, received: 0, skuLines: 0 }
}
