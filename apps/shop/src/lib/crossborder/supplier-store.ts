'use client'

import * as React from 'react'
import {
  ERP_DEMO_SUPPLIER_MASTERS,
  type DemoSupplierMaster,
} from '@/lib/crossborder/erp-ued-data'

const STORAGE_KEY = 'open-shop.console.demo.suppliers.v1'

let snapshot: DemoSupplierMaster[] = ERP_DEMO_SUPPLIER_MASTERS
let hydrated = false
const listeners = new Set<() => void>()

function readStorage(): DemoSupplierMaster[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return ERP_DEMO_SUPPLIER_MASTERS
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return ERP_DEMO_SUPPLIER_MASTERS
    return parsed as DemoSupplierMaster[]
  } catch {
    return ERP_DEMO_SUPPLIER_MASTERS
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
  return ERP_DEMO_SUPPLIER_MASTERS
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function commit(next: DemoSupplierMaster[]) {
  snapshot = next
  hydrated = true
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  for (const listener of listeners) listener()
}

export function useSuppliers() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function supplierNames(suppliers: DemoSupplierMaster[]) {
  return suppliers.map((supplier) => supplier.name)
}

export function nextSupplierCode(suppliers: DemoSupplierMaster[]) {
  const max = suppliers.reduce((current, supplier) => {
    const matched = /^SUP-(\d+)$/.exec(supplier.code)
    return matched ? Math.max(current, Number(matched[1])) : current
  }, 0)
  return `SUP-${String(max + 1).padStart(4, '0')}`
}

export function addSupplier(
  suppliers: DemoSupplierMaster[],
  input: Pick<DemoSupplierMaster, 'name' | 'contact' | 'phone' | 'email' | 'settlement' | 'status' | 'note'>,
) {
  const next = [
    { ...input, code: nextSupplierCode(suppliers) },
    ...suppliers,
  ]
  commit(next)
  return next[0]
}

export function updateSupplier(
  suppliers: DemoSupplierMaster[],
  code: string,
  patch: Partial<DemoSupplierMaster>,
) {
  commit(suppliers.map((supplier) => (supplier.code === code ? { ...supplier, ...patch } : supplier)))
}
