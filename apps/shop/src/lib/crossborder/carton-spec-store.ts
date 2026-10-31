'use client'

import { createDemoStore } from '@/lib/crossborder/local-store'

export type CartonSpec = {
  id: string
  name: string
  applicablePack: string
  lengthCm: number
  widthCm: number
  heightCm: number
  grossWeightKg: number
  unitsPerCarton: number
  status: '启用' | '停用'
  note: string
}

export const DEMO_CARTON_SPECS: CartonSpec[] = [
  { id: 'CTN-0001', name: '标准快递箱', applicablePack: '单件', lengthCm: 40, widthCm: 30, heightCm: 20, grossWeightKg: 12, unitsPerCarton: 40, status: '启用', note: '空运 DDP 常用' },
  { id: 'CTN-0002', name: '两件装礼盒箱', applicablePack: '两件装', lengthCm: 35, widthCm: 25, heightCm: 15, grossWeightKg: 8, unitsPerCarton: 20, status: '启用', note: '礼盒装商品使用' },
  { id: 'CTN-0003', name: '海运整箱', applicablePack: '单件', lengthCm: 60, widthCm: 45, heightCm: 35, grossWeightKg: 18, unitsPerCarton: 80, status: '启用', note: '海运拼箱/整柜装载' },
]

const store = createDemoStore<CartonSpec[]>('open-shop.console.demo.carton-specs.v1', DEMO_CARTON_SPECS)

export function useCartonSpecs() {
  return store.useStore()
}

export function nextCartonId(rows: CartonSpec[]) {
  const max = rows.reduce((current, row) => {
    const matched = /^CTN-(\d+)$/.exec(row.id)
    return matched ? Math.max(current, Number(matched[1])) : current
  }, 0)
  return `CTN-${String(max + 1).padStart(4, '0')}`
}

export function addCartonSpec(rows: CartonSpec[], input: Omit<CartonSpec, 'id'>) {
  store.set([...rows, { ...input, id: nextCartonId(rows) }])
}

export function updateCartonSpec(rows: CartonSpec[], id: string, patch: Partial<CartonSpec>) {
  store.set(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
}
