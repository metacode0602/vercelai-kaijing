'use client'

/**
 * 财务结算 / 利润 / 成本 — localStorage 原型（无 tRPC / DB）。
 * 费用拆分占位：platform / logistics / ads / jsb / refunds / fx。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'

export type FeeBreakdown = {
  platform: number
  logistics: number
  ads: number
  jsb: number
  refunds: number
  fx: number
}

export type FinanceSettlement = {
  id: string
  platform: string
  shop: string
  period: string
  billAmount: number
  currency: string
  matchedOrders: number
  diffAmount: number
  status: string
  fees: FeeBreakdown
}

export type FinanceProfit = {
  id: string
  dimension: string
  view: 'order' | 'sku'
  revenue: number
  cost: number
  fees: number
  refund: number
  profit: number
  margin: string
  fx: string
  status: string
  breakdown: FeeBreakdown
}

export type FinanceCostRow = {
  id: string
  sku: string
  name: string
  kind: string
  amount: number
  currency: string
  effectiveFrom: string
  status: string
}

const SEED_SETTLEMENTS: FinanceSettlement[] = [
  {
    id: 'STL-DZ-2026-10-LK',
    platform: 'Daraz',
    shop: 'Daraz LK',
    period: '2026-10 上半月',
    billAmount: 4820.55,
    currency: 'USD',
    matchedOrders: 148,
    diffAmount: -12.4,
    status: '差异待处理',
    fees: { platform: 420.1, logistics: 310.2, ads: 88.0, jsb: 0, refunds: 42.5, fx: 6.2 },
  },
  {
    id: 'STL-LZ-2026-09-MY',
    platform: 'Lazada',
    shop: 'Lazada MY',
    period: '2026-09 下半月',
    billAmount: 12640.2,
    currency: 'MYR',
    matchedOrders: 216,
    diffAmount: 0,
    status: '已确认',
    fees: { platform: 980, logistics: 640, ads: 220, jsb: 0, refunds: 35, fx: 12 },
  },
  {
    id: 'STL-LZ-2026-10-TH',
    platform: 'Lazada',
    shop: 'Lazada TH',
    period: '2026-10 上半月',
    billAmount: 35800,
    currency: 'THB',
    matchedOrders: 97,
    diffAmount: 356,
    status: '待匹配',
    fees: { platform: 2100, logistics: 1860, ads: 400, jsb: 1240, refunds: 180, fx: 40 },
  },
]

const SEED_PROFITS: FinanceProfit[] = [
  {
    id: 'DZ-10021',
    dimension: '订单 · Daraz LK',
    view: 'order',
    revenue: 24,
    cost: 9.6,
    fees: 4.1,
    refund: 0,
    profit: 10.3,
    margin: '42.9%',
    fx: 'USD 快照 2026-10-20',
    status: '已核算',
    breakdown: { platform: 1.2, logistics: 2.4, ads: 0.5, jsb: 0, refunds: 0, fx: 0 },
  },
  {
    id: 'LZ-2201',
    dimension: '订单 · Lazada TH',
    view: 'order',
    revenue: 168,
    cost: 62,
    fees: 27.4,
    refund: 0,
    profit: 78.6,
    margin: '46.8%',
    fx: 'THB 快照 2026-10-28',
    status: '已核算',
    breakdown: { platform: 8.4, logistics: 12.0, ads: 2.0, jsb: 5.0, refunds: 0, fx: 0 },
  },
  {
    id: 'LZ-2180',
    dimension: '订单 · Lazada MY',
    view: 'order',
    revenue: 46,
    cost: 18.4,
    fees: 8.2,
    refund: 6.8,
    profit: 12.6,
    margin: '27.4%',
    fx: 'MYR 快照 2026-10-25',
    status: '含退款调整',
    breakdown: { platform: 2.1, logistics: 3.4, ads: 1.0, jsb: 0, refunds: 6.8, fx: 0.2 },
  },
  {
    id: 'HSY000001001',
    dimension: 'SKU · Oversized Cotton Tee 黑色L',
    view: 'sku',
    revenue: 512,
    cost: 204.8,
    fees: 86.4,
    refund: 12,
    profit: 208.8,
    margin: '40.8%',
    fx: '多币种按月均汇率',
    status: '已核算',
    breakdown: { platform: 36, logistics: 28, ads: 12, jsb: 4, refunds: 12, fx: 2.4 },
  },
  {
    id: 'HSY000002001',
    dimension: 'SKU · USB-C Hub 7-in-1',
    view: 'sku',
    revenue: 720,
    cost: 310,
    fees: 118,
    refund: 0,
    profit: 292,
    margin: '40.6%',
    fx: '多币种按月均汇率',
    status: '已核算',
    breakdown: { platform: 48, logistics: 42, ads: 18, jsb: 8, refunds: 0, fx: 2 },
  },
]

const SEED_COSTS: FinanceCostRow[] = [
  {
    id: 'COST-001',
    sku: 'HSY000001001',
    name: 'Oversized Cotton Tee · 黑色 L',
    kind: '采购成本',
    amount: 28,
    currency: 'CNY',
    effectiveFrom: '2026-10-01',
    status: '生效',
  },
  {
    id: 'COST-002',
    sku: 'HSY000002001',
    name: 'USB-C Hub 7-in-1',
    kind: '采购成本',
    amount: 62,
    currency: 'CNY',
    effectiveFrom: '2026-09-15',
    status: '生效',
  },
  {
    id: 'COST-003',
    sku: 'HSY000001001',
    name: 'Oversized Cotton Tee · 黑色 L',
    kind: '头程运费分摊',
    amount: 1.8,
    currency: 'USD',
    effectiveFrom: '2026-10-01',
    status: '生效',
  },
]

type FinanceState = {
  settlements: FinanceSettlement[]
  profits: FinanceProfit[]
  costs: FinanceCostRow[]
}

const seed: FinanceState = {
  settlements: SEED_SETTLEMENTS,
  profits: SEED_PROFITS,
  costs: SEED_COSTS,
}

const store = createDemoStore<FinanceState>('open-shop.console.demo.finance.v1', seed)

export function useFinanceState() {
  return store.useStore()
}

export function useSettlements() {
  return store.useStore().settlements
}

export function useProfits() {
  return store.useStore().profits
}

export function useCosts() {
  return store.useStore().costs
}

export function getSettlements() {
  return store.get().settlements
}

export function getProfits() {
  return store.get().profits
}

export function getCosts() {
  return store.get().costs
}

export function sumFeeBreakdown(fees: FeeBreakdown) {
  return fees.platform + fees.logistics + fees.ads + fees.jsb + fees.refunds + fees.fx
}

export function financeOverview(state: FinanceState = store.get()) {
  const revenue = state.profits.filter((p) => p.view === 'order').reduce((s, p) => s + p.revenue, 0)
  const cost = state.profits.filter((p) => p.view === 'order').reduce((s, p) => s + p.cost, 0)
  const profit = state.profits.filter((p) => p.view === 'order').reduce((s, p) => s + p.profit, 0)
  const fees = state.profits.filter((p) => p.view === 'order').reduce((s, p) => s + p.fees, 0)
  const margin = revenue > 0 ? `${((profit / revenue) * 100).toFixed(1)}%` : '—'
  return { revenue, cost, profit, fees, margin, settlementCount: state.settlements.length }
}

export function upsertSettlement(row: FinanceSettlement) {
  const state = store.get()
  const list = state.settlements.filter((item) => item.id !== row.id)
  store.set({ ...state, settlements: [row, ...list] })
  return row
}

export function updateSettlementStatus(id: string, status: string, diffAmount?: number) {
  const state = store.get()
  const list = state.settlements.map((item) =>
    item.id === id
      ? { ...item, status, diffAmount: diffAmount === undefined ? item.diffAmount : diffAmount }
      : item,
  )
  store.set({ ...state, settlements: list })
}
