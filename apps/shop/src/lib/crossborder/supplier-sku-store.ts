'use client'

/**
 * @deprecated 主路径已迁 trpc.suppliers.listSkus（模块12）。类型保留供旧引用兼容。
 */
import * as React from 'react'

export type DemoSupplierSku = {
  id: string
  sku: string
  supplier: string
  factoryCode: string
  price: number
  currency: string
  moq: number
  leadDays: number
  effective: string
  preferred: boolean
  status: string
  remark?: string
}

export const DEMO_SUPPLIER_SKUS: DemoSupplierSku[] = [
  { id: 'SSK-0001', sku: 'HSY000001001', supplier: '厦门优品服饰有限公司', factoryCode: 'TEE-001-BK-L', price: 28, currency: 'CNY', moq: 100, leadDays: 12, effective: '2026-10-01', preferred: true, status: '启用' },
  { id: 'SSK-0002', sku: 'HSY000001002', supplier: '厦门优品服饰有限公司', factoryCode: 'TEE-001-WH-L', price: 29, currency: 'CNY', moq: 100, leadDays: 12, effective: '2026-10-01', preferred: true, status: '启用' },
  { id: 'SSK-0003', sku: 'HSY000002001', supplier: '泉州联创数码配件厂', factoryCode: 'HUB-01', price: 62, currency: 'CNY', moq: 50, leadDays: 18, effective: '2026-09-15', preferred: true, status: '启用' },
  { id: 'SSK-0004', sku: 'HSY000001001', supplier: '汕头华彩印务', factoryCode: 'TEE-ALT-BK-L', price: 26.5, currency: 'CNY', moq: 200, leadDays: 20, effective: '2026-08-20', preferred: false, status: '停用' },
]

const STORAGE_KEY = 'open-shop.console.demo.supplier-skus.v1'

let snapshot: DemoSupplierSku[] = DEMO_SUPPLIER_SKUS
let hydrated = false
const listeners = new Set<() => void>()

function readStorage(): DemoSupplierSku[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEMO_SUPPLIER_SKUS
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEMO_SUPPLIER_SKUS
    return parsed as DemoSupplierSku[]
  } catch {
    return DEMO_SUPPLIER_SKUS
  }
}

function getSnapshot() {
  if (!hydrated && typeof window !== 'undefined') {
    snapshot = readStorage()
    hydrated = true
  }
  return snapshot
}

function getServerSnapshot() {
  return DEMO_SUPPLIER_SKUS
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function commit(next: DemoSupplierSku[]) {
  snapshot = next
  hydrated = true
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  for (const listener of listeners) listener()
}

export function useSupplierSkus() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function nextSupplierSkuId(rows: DemoSupplierSku[]) {
  const max = rows.reduce((current, row) => {
    const matched = /^SSK-(\d+)$/.exec(row.id)
    return matched ? Math.max(current, Number(matched[1])) : current
  }, 0)
  return `SSK-${String(max + 1).padStart(4, '0')}`
}

export function addSupplierSku(
  rows: DemoSupplierSku[],
  input: Omit<DemoSupplierSku, 'id'>,
) {
  const next = [{ ...input, id: nextSupplierSkuId(rows) }, ...rows]
  commit(next)
  return next[0]
}
