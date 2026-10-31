'use client'

/**
 * F22 海运柜次 localStorage 原型（无 tRPC / DB）。
 * @see apps/shop/content/design/daraz-lk-erp-p0-ued.md
 */

import { createDemoStore } from '@/lib/crossborder/local-store'

export type OceanLotStatus = '在途' | '清关中' | '已入本地仓' | '已取消'

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

const SEED: OceanLot[] = [
  {
    id: 'LOT-CMB-2026-10-01',
    lotCode: 'LOT-CMB-2026-10-01',
    containerNo: 'MSKU7834219',
    containerType: '40HQ',
    platform: 'Daraz',
    originPort: 'CNXMN',
    destPort: 'LKCMB',
    warehouse: 'WH-LK-CMB-001',
    status: '在途',
    etd: '2026-09-15',
    etaPort: '2026-11-05',
    etaWarehouse: '2026-11-12',
    notes: '海运约 50 天；未入厦门现货池',
    lines: [
      { id: 'L1', sku: 'TEE-001', name: '速干 Polo', qtyShipped: 400, qtyReceived: 0, qtyDamaged: 0 },
      { id: 'L2', sku: 'HDY-220', name: '高速吹风机', qtyShipped: 120, qtyReceived: 0, qtyDamaged: 0 },
    ],
  },
  {
    id: 'LOT-CMB-2026-09-02',
    lotCode: 'LOT-CMB-2026-09-02',
    containerNo: 'TGHU9928103',
    containerType: '20GP',
    platform: 'Daraz',
    originPort: 'CNXMN',
    destPort: 'LKCMB',
    warehouse: 'WH-LK-CMB-001',
    status: '清关中',
    etd: '2026-08-20',
    etaPort: '2026-10-10',
    etaWarehouse: '2026-10-18',
    notes: 'PAL/CESS 单据待补',
    lines: [
      { id: 'L3', sku: 'BAG-088', name: '旅行收纳包', qtyShipped: 600, qtyReceived: 0, qtyDamaged: 0 },
      { id: 'L4', sku: 'TEE-001', name: '速干 Polo', qtyShipped: 200, qtyReceived: 0, qtyDamaged: 0 },
    ],
  },
  {
    id: 'LOT-CMB-2026-08-01',
    lotCode: 'LOT-CMB-2026-08-01',
    containerNo: 'CMAU5510288',
    containerType: '40HQ',
    platform: 'Daraz',
    originPort: 'CNXMN',
    destPort: 'LKCMB',
    warehouse: 'WH-LK-CMB-001',
    status: '已入本地仓',
    etd: '2026-07-01',
    etaPort: '2026-08-20',
    etaWarehouse: '2026-08-28',
    notes: '已上架 Colombo',
    lines: [
      { id: 'L5', sku: 'TEE-001', name: '速干 Polo', qtyShipped: 300, qtyReceived: 292, qtyDamaged: 8 },
      { id: 'L6', sku: 'MUG-012', name: '保温咖啡杯', qtyShipped: 480, qtyReceived: 480, qtyDamaged: 0 },
    ],
  },
]

const store = createDemoStore<OceanLot[]>('open-shop.console.demo.ocean-lots.v1', SEED)

export function useOceanLots() {
  return store.useStore()
}

export function getOceanLots() {
  return store.get()
}

export function upsertOceanLot(lot: OceanLot) {
  const list = store.get().filter((item) => item.id !== lot.id)
  store.set([lot, ...list])
  return lot
}

export function advanceOceanLotStatus(id: string) {
  const list = store.get().map((lot) => {
    if (lot.id !== id) return lot
    if (lot.status === '在途') return { ...lot, status: '清关中' as const }
    if (lot.status === '清关中') {
      const lines = lot.lines.map((line) => ({
        ...line,
        qtyReceived: line.qtyReceived || Math.max(0, line.qtyShipped - 2),
        qtyDamaged: line.qtyDamaged || (line.qtyShipped > 0 ? 2 : 0),
      }))
      return { ...lot, status: '已入本地仓' as const, lines }
    }
    return lot
  })
  store.set(list)
}

export function inventoryBucketsFromLots(lots: OceanLot[] = store.get()): InventoryBucketRow[] {
  const map = new Map<string, InventoryBucketRow>()
  for (const lot of lots) {
    for (const line of lot.lines) {
      const key = `${line.sku}::${lot.warehouse}`
      const row =
        map.get(key) ??
        ({
          id: key,
          sku: line.sku,
          name: line.name,
          warehouse: lot.warehouse,
          inTransit: 0,
          customsClearing: 0,
          available: 0,
          damaged: 0,
        } satisfies InventoryBucketRow)
      if (lot.status === '在途') row.inTransit += line.qtyShipped
      else if (lot.status === '清关中') row.customsClearing += line.qtyShipped
      else if (lot.status === '已入本地仓') {
        row.available += line.qtyReceived
        row.damaged += line.qtyDamaged
      }
      map.set(key, row)
    }
  }
  return [...map.values()]
}

export function oceanLotKpi(lots: OceanLot[] = store.get()) {
  return {
    total: lots.length,
    inTransit: lots.filter((l) => l.status === '在途').length,
    clearing: lots.filter((l) => l.status === '清关中').length,
    received: lots.filter((l) => l.status === '已入本地仓').length,
    skuLines: lots.reduce((s, l) => s + l.lines.length, 0),
  }
}
