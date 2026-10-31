'use client'

/**
 * F33 汇率配置 localStorage 原型。
 * @see apps/shop/content/design/daraz-lk-erp-p0-ued.md
 */

import { createDemoStore } from '@/lib/crossborder/local-store'

export type FxRateRow = {
  id: string
  platform: string
  marketplace: string
  baseCurrency: string
  quoteCurrency: string
  rate: number
  effectiveDate: string
  source: string
  note: string
}

const SEED: FxRateRow[] = [
  {
    id: 'FX-DZ-USD-LKR-2026-10-21',
    platform: 'Daraz',
    marketplace: 'Daraz LK',
    baseCurrency: 'USD',
    quoteCurrency: 'LKR',
    rate: 300,
    effectiveDate: '2026-10-21',
    source: 'manual',
    note: '成本计算器默认演示汇率',
  },
  {
    id: 'FX-DZ-CNY-LKR-2026-10-21',
    platform: 'Daraz',
    marketplace: 'Daraz LK',
    baseCurrency: 'CNY',
    quoteCurrency: 'LKR',
    rate: 41.2,
    effectiveDate: '2026-10-21',
    source: 'import',
    note: 'mock 导入',
  },
  {
    id: 'FX-DZ-USD-CNY-2026-10-21',
    platform: 'Daraz',
    marketplace: 'Daraz LK',
    baseCurrency: 'USD',
    quoteCurrency: 'CNY',
    rate: 7.12,
    effectiveDate: '2026-10-21',
    source: 'api',
    note: '示例 API',
  },
  {
    id: 'FX-LZ-USD-MYR-2026-10-01',
    platform: 'Lazada',
    marketplace: 'Lazada MY',
    baseCurrency: 'USD',
    quoteCurrency: 'MYR',
    rate: 4.35,
    effectiveDate: '2026-10-01',
    source: 'manual',
    note: 'Lazada 独立配置；与 Daraz 分列',
  },
]

const store = createDemoStore<FxRateRow[]>('open-shop.console.demo.fx-rates.v1', SEED)

export function useFxRates() {
  return store.useStore()
}

export function getFxRates() {
  return store.get()
}

export function upsertFxRate(row: FxRateRow) {
  const list = store.get().filter((item) => item.id !== row.id)
  store.set([row, ...list])
  return row
}

export function removeFxRate(id: string) {
  store.set(store.get().filter((item) => item.id !== id))
}

export function importFxRatesMock(rows: FxRateRow[]) {
  const map = new Map(store.get().map((r) => [r.id, r]))
  for (const row of rows) map.set(row.id, row)
  store.set([...map.values()])
}

/** 原币 × 汇率 → 折算；保留三元组供展示。 */
export function convertWithFx(original: number, rate: FxRateRow) {
  return {
    original,
    rate: rate.rate,
    converted: Number((original * rate.rate).toFixed(4)),
    currencyPair: `${rate.baseCurrency}/${rate.quoteCurrency}`,
    effectiveDate: rate.effectiveDate,
    source: rate.source,
  }
}
