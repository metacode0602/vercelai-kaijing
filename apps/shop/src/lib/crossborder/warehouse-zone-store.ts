'use client'

import { createDemoStore } from '@/lib/crossborder/local-store'

export type WarehouseZone = {
  id: string
  warehouseCode: string
  code: string
  name: string
  purpose: string
  status: '启用' | '停用'
  note: string
}

export const DEMO_WAREHOUSE_ZONES: WarehouseZone[] = [
  { id: 'ZONE-0001', warehouseCode: 'WH-CN-XMN-001', code: 'A', name: 'A 区', purpose: '服装与配饰拣货区', status: '启用', note: '' },
  { id: 'ZONE-0002', warehouseCode: 'WH-CN-XMN-001', code: 'B', name: 'B 区', purpose: '数码配件与家居存储区', status: '启用', note: '' },
  { id: 'ZONE-0003', warehouseCode: 'WH-CN-XMN-001', code: 'C', name: 'C 区', purpose: '退货质检与残次暂存区', status: '启用', note: '' },
]

const store = createDemoStore<WarehouseZone[]>('open-shop.console.demo.warehouse-zones.v1', DEMO_WAREHOUSE_ZONES)

export function useWarehouseZones() {
  return store.useStore()
}

export function nextZoneId(rows: WarehouseZone[]) {
  const max = rows.reduce((current, row) => {
    const matched = /^ZONE-(\d+)$/.exec(row.id)
    return matched ? Math.max(current, Number(matched[1])) : current
  }, 0)
  return `ZONE-${String(max + 1).padStart(4, '0')}`
}

export function addWarehouseZone(rows: WarehouseZone[], input: Omit<WarehouseZone, 'id'>) {
  store.set([...rows, { ...input, id: nextZoneId(rows) }])
}

export function updateWarehouseZone(rows: WarehouseZone[], id: string, patch: Partial<WarehouseZone>) {
  store.set(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
}
