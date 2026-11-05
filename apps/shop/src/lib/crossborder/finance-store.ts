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

export type FinanceSettlementLine = {
  id: string
  order: string
  orderLineId: string
  feeKind: string
  feeType: string
  transactionType: string
  externalTransactionId: string
  amount: number
  taxAmount: number
  currency: string
  sellerSku: string
  shippingProvider: string
  note: string
}

export type FinanceSettlement = {
  id: string
  externalSettlementId: string
  platform: string
  shop: string
  shopId: string
  period: string
  periodStart: string
  periodEnd: string
  billAmount: number
  itemRevenue: number
  otherRevenueTotal: number
  refundsAmount: number
  shipmentFee: number
  feesTotal: number
  payoutAmount: number
  payoutStatus: string
  paidAt: string
  currency: string
  matchedOrders: number
  diffAmount: number
  status: string
  platformStatus: string
  platformUpdatedAt: string
  fees: FeeBreakdown
  lines: FinanceSettlementLine[]
}

export type FinanceAccountTransaction = {
  id: string
  transactionNumber: string
  shopId: string
  shop: string
  platform: string
  transactionTime: string
  type: string
  subType: string
  amount: number
  currency: string
  status: string
  reference: string
}

export type FinanceLogisticsFee = {
  id: string
  settlementId: string
  shopId: string
  shop: string
  platform: string
  externalOrderId: string
  externalOrderLineId: string
  externalPackageId: string
  feeCode: string
  feeName: string
  amount: number
  taxAmount: number
  currency: string
  feeCreatedAt: string
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
    externalSettlementId: 'DZ-SETTLE-202610-LK-01',
    platform: 'Daraz',
    shop: 'Daraz LK',
    shopId: 'b5ofcwj2mzauov29y08m0q99',
    period: '2026-10 上半月',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-15',
    billAmount: 4820.55,
    itemRevenue: 4620.5,
    otherRevenueTotal: 200.05,
    refundsAmount: 42.5,
    shipmentFee: 310.2,
    feesTotal: 867,
    payoutAmount: 3953.55,
    payoutStatus: 'pending',
    paidAt: '',
    currency: 'USD',
    matchedOrders: 148,
    diffAmount: -12.4,
    status: '差异待处理',
    platformStatus: 'STATEMENT_READY',
    platformUpdatedAt: '2026-10-20 08:00',
    fees: { platform: 420.1, logistics: 310.2, ads: 88.0, jsb: 0, refunds: 42.5, fx: 6.2 },
    lines: [
      {
        id: 'SLL-DZ-0001',
        order: 'DZ-10021',
        orderLineId: 'DZ-10021-1',
        feeKind: 'item',
        feeType: 'sale',
        transactionType: 'order_income',
        externalTransactionId: 'DZ-TXN-880021-01',
        amount: 24,
        taxAmount: 0,
        currency: 'USD',
        sellerSku: 'DZ-HUB-01',
        shippingProvider: 'Daraz Logistics',
        note: '订单商品收入',
      },
      {
        id: 'SLL-DZ-0002',
        order: 'DZ-10021',
        orderLineId: 'DZ-10021-1',
        feeKind: 'platform',
        feeType: 'commission',
        transactionType: 'platform_fee',
        externalTransactionId: 'DZ-TXN-880021-02',
        amount: -1.2,
        taxAmount: 0,
        currency: 'USD',
        sellerSku: 'DZ-HUB-01',
        shippingProvider: 'Daraz Logistics',
        note: '平台佣金 5%',
      },
    ],
  },
  {
    id: 'STL-LZ-2026-09-MY',
    externalSettlementId: 'LZ-SETTLE-202609-MY-02',
    platform: 'Lazada',
    shop: 'Lazada MY',
    shopId: 's8v7xkqw0asyz4zhswxwzdd3',
    period: '2026-09 下半月',
    periodStart: '2026-09-16',
    periodEnd: '2026-09-30',
    billAmount: 12640.2,
    itemRevenue: 12420.2,
    otherRevenueTotal: 220,
    refundsAmount: 35,
    shipmentFee: 640,
    feesTotal: 1887,
    payoutAmount: 10753.2,
    payoutStatus: 'paid',
    paidAt: '2026-10-12 10:00',
    currency: 'MYR',
    matchedOrders: 216,
    diffAmount: 0,
    status: '已确认',
    platformStatus: 'PAID',
    platformUpdatedAt: '2026-10-12 10:00',
    fees: { platform: 980, logistics: 640, ads: 220, jsb: 0, refunds: 35, fx: 12 },
    lines: [
      {
        id: 'SLL-LZ-0001',
        order: 'LZ-2201',
        orderLineId: 'LZ-2201-1',
        feeKind: 'item',
        feeType: 'sale',
        transactionType: 'order_income',
        externalTransactionId: 'LZ-TXN-2201-01',
        amount: 168,
        taxAmount: 8.4,
        currency: 'MYR',
        sellerSku: 'TEE-BLK-L',
        shippingProvider: 'LGS MY',
        note: '订单商品收入',
      },
      {
        id: 'SLL-LZ-0002',
        order: 'LZ-2201',
        orderLineId: 'LZ-2201-1',
        feeKind: 'logistics',
        feeType: 'shipping_fee',
        transactionType: 'logistics_fee',
        externalTransactionId: 'LZ-TXN-2201-02',
        amount: -12,
        taxAmount: 0,
        currency: 'MYR',
        sellerSku: 'TEE-BLK-L',
        shippingProvider: 'LGS MY',
        note: 'LGS 运费',
      },
    ],
  },
  {
    id: 'STL-LZ-2026-10-TH',
    externalSettlementId: 'LZ-SETTLE-202610-TH-03',
    platform: 'Lazada',
    shop: 'Lazada TH',
    shopId: 'lazada-th-demo',
    period: '2026-10 上半月',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-15',
    billAmount: 35800,
    itemRevenue: 34100,
    otherRevenueTotal: 1700,
    refundsAmount: 180,
    shipmentFee: 1860,
    feesTotal: 5820,
    payoutAmount: 29980,
    payoutStatus: 'pending',
    paidAt: '',
    currency: 'THB',
    matchedOrders: 97,
    diffAmount: 356,
    status: '待匹配',
    platformStatus: 'STATEMENT_READY',
    platformUpdatedAt: '2026-10-28 09:00',
    fees: { platform: 2100, logistics: 1860, ads: 400, jsb: 1240, refunds: 180, fx: 40 },
    lines: [
      {
        id: 'SLL-LZ-TH-0001',
        order: 'LZ-TH-2301',
        orderLineId: 'LZ-TH-2301-1',
        feeKind: 'jsb',
        feeType: 'jsb_handover',
        transactionType: 'logistics_fee',
        externalTransactionId: 'LZ-TXN-2301-01',
        amount: -1240,
        taxAmount: 0,
        currency: 'THB',
        sellerSku: 'TH-TEE-01',
        shippingProvider: 'JSB',
        note: 'TH JSB 灰清费用',
      },
      {
        id: 'SLL-LZ-TH-0002',
        order: 'LZ-TH-2301',
        orderLineId: 'LZ-TH-2301-1',
        feeKind: 'platform',
        feeType: 'commission',
        transactionType: 'platform_fee',
        externalTransactionId: 'LZ-TXN-2301-02',
        amount: -2100,
        taxAmount: 0,
        currency: 'THB',
        sellerSku: 'TH-TEE-01',
        shippingProvider: 'JSB',
        note: '平台佣金',
      },
    ],
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

const SEED_ACCOUNT_TRANSACTIONS: FinanceAccountTransaction[] = [
  {
    id: 'AT-DZ-0001',
    transactionNumber: 'DZ-ACC-20261020-001',
    shopId: 'b5ofcwj2mzauov29y08m0q99',
    shop: 'Daraz LK',
    platform: 'Daraz',
    transactionTime: '2026-10-20 09:15',
    type: 'settlement',
    subType: 'payout',
    amount: 3953.55,
    currency: 'USD',
    status: 'pending',
    reference: 'DZ-SETTLE-202610-LK-01',
  },
  {
    id: 'AT-DZ-0002',
    transactionNumber: 'DZ-ACC-20261018-002',
    shopId: 'b5ofcwj2mzauov29y08m0q99',
    shop: 'Daraz LK',
    platform: 'Daraz',
    transactionTime: '2026-10-18 16:40',
    type: 'fee',
    subType: 'shipping_fee',
    amount: -12.4,
    currency: 'USD',
    status: 'posted',
    reference: 'PKG-2026-0044',
  },
  {
    id: 'AT-LZ-0001',
    transactionNumber: 'LZ-ACC-20261012-001',
    shopId: 's8v7xkqw0asyz4zhswxwzdd3',
    shop: 'Lazada MY',
    platform: 'Lazada',
    transactionTime: '2026-10-12 10:00',
    type: 'settlement',
    subType: 'payout',
    amount: 10753.2,
    currency: 'MYR',
    status: 'paid',
    reference: 'LZ-SETTLE-202609-MY-02',
  },
  {
    id: 'AT-LZ-0002',
    transactionNumber: 'LZ-ACC-20261027-002',
    shopId: 's8v7xkqw0asyz4zhswxwzdd3',
    shop: 'Lazada MY',
    platform: 'Lazada',
    transactionTime: '2026-10-27 18:05',
    type: 'refund',
    subType: 'buyer_refund',
    amount: -6.8,
    currency: 'MYR',
    status: 'posted',
    reference: 'RTN-2026-0031',
  },
]

const SEED_LOGISTICS_FEES: FinanceLogisticsFee[] = [
  {
    id: 'LFD-DZ-0001',
    settlementId: 'STL-DZ-2026-10-LK',
    shopId: 'b5ofcwj2mzauov29y08m0q99',
    shop: 'Daraz LK',
    platform: 'Daraz',
    externalOrderId: 'DZ-10021',
    externalOrderLineId: 'DZ-10021-1',
    externalPackageId: 'DZ-PKG-10021-01',
    feeCode: 'LAST_MILE',
    feeName: '尾程派送费',
    amount: 2.4,
    taxAmount: 0,
    currency: 'USD',
    feeCreatedAt: '2026-10-20 14:10',
  },
  {
    id: 'LFD-DZ-0002',
    settlementId: 'STL-DZ-2026-10-LK',
    shopId: 'b5ofcwj2mzauov29y08m0q99',
    shop: 'Daraz LK',
    platform: 'Daraz',
    externalOrderId: 'DZ-10018',
    externalOrderLineId: 'DZ-10018-1',
    externalPackageId: 'DZ-PKG-10018-01',
    feeCode: 'FUEL_SURCHARGE',
    feeName: '燃油附加费',
    amount: 0.35,
    taxAmount: 0.02,
    currency: 'USD',
    feeCreatedAt: '2026-10-20 14:10',
  },
  {
    id: 'LFD-LZ-0001',
    settlementId: 'STL-LZ-2026-09-MY',
    shopId: 's8v7xkqw0asyz4zhswxwzdd3',
    shop: 'Lazada MY',
    platform: 'Lazada',
    externalOrderId: 'LZ-2201',
    externalOrderLineId: 'LZ-2201-1',
    externalPackageId: 'LZ-PKG-2201-01',
    feeCode: 'LGS_SHIPPING',
    feeName: 'LGS 运费',
    amount: 12,
    taxAmount: 0.72,
    currency: 'MYR',
    feeCreatedAt: '2026-10-12 10:00',
  },
  {
    id: 'LFD-LZ-TH-0001',
    settlementId: 'STL-LZ-2026-10-TH',
    shopId: 'lazada-th-demo',
    shop: 'Lazada TH',
    platform: 'Lazada',
    externalOrderId: 'LZ-TH-2301',
    externalOrderLineId: 'LZ-TH-2301-1',
    externalPackageId: 'LZ-TH-PKG-2301-01',
    feeCode: 'JSB_HANDOVER',
    feeName: 'JSB 交接费',
    amount: 1240,
    taxAmount: 0,
    currency: 'THB',
    feeCreatedAt: '2026-10-28 09:00',
  },
]

type FinanceState = {
  settlements: FinanceSettlement[]
  profits: FinanceProfit[]
  costs: FinanceCostRow[]
  accountTransactions: FinanceAccountTransaction[]
  logisticsFees: FinanceLogisticsFee[]
}

const seed: FinanceState = {
  settlements: SEED_SETTLEMENTS,
  profits: SEED_PROFITS,
  costs: SEED_COSTS,
  accountTransactions: SEED_ACCOUNT_TRANSACTIONS,
  logisticsFees: SEED_LOGISTICS_FEES,
}

const store = createDemoStore<FinanceState>('open-shop.console.demo.finance.v2', seed)

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

export function useAccountTransactions() {
  return store.useStore().accountTransactions
}

export function useLogisticsFees() {
  return store.useStore().logisticsFees
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

export function getAccountTransactions() {
  return store.get().accountTransactions
}

export function getLogisticsFees() {
  return store.get().logisticsFees
}

export function settlementLines(settlementId: string) {
  return store.get().settlements.find((row) => row.id === settlementId)?.lines ?? []
}

export function logisticsFeesForSettlement(settlementId: string) {
  return store.get().logisticsFees.filter((row) => row.settlementId === settlementId)
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
