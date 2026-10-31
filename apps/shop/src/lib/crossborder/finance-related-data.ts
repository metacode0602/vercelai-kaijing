/**
 * 成本 / 财务 / 运费 UED 关联示例数据（本地原型，无 tRPC）。
 * 结算行、费用拆分、运费情景与承运商报价，供 related-info 分表展示。
 */

import { MOCK_SHOPS } from '@/lib/crossborder/mock-data'

/** 旧成本演示 SKU → 主数据内部 SKU */
export const COST_SKU_TO_INTERNAL: Record<string, string> = {
  'TEE-001': 'HSY000001001',
  'HUB-01': 'HSY000002001',
  'MAT-02': 'HSY000001001',
}

export function resolveInternalSku(sku: string | undefined): string | undefined {
  if (!sku || sku === '—') return undefined
  return COST_SKU_TO_INTERNAL[sku] ?? sku
}

export function findShopByLabel(label: string | undefined): (typeof MOCK_SHOPS)[number] | undefined {
  if (!label) return undefined
  const normalized = label.replace(/\s*·\s*.*$/, '').trim().toLowerCase()
  return (
    MOCK_SHOPS.find((shop) => shop.name === label) ??
    MOCK_SHOPS.find((shop) => shop.name.toLowerCase().startsWith(normalized)) ??
    MOCK_SHOPS.find(
      (shop) =>
        shop.name.toLowerCase().includes(normalized) ||
        `${shop.platform} ${shop.region}`.toLowerCase() === normalized ||
        `${shop.platform} ${shop.region}`.toLowerCase().replace(/\s+/g, ' ') ===
          normalized.replace(/\s+/g, ' '),
    )
  )
}

export type DemoSettlementLine = {
  settlementId: string
  orderExternalId: string
  feeType: string
  amount: number
  currency: string
  matchStatus: string
  note: string
}

/** 平台结算明细行（对账用） */
export const DEMO_SETTLEMENT_LINES: DemoSettlementLine[] = [
  {
    settlementId: 'STL-DZ-2026-10-LK',
    orderExternalId: 'DZ-10021',
    feeType: '货款净额',
    amount: 24,
    currency: 'USD',
    matchStatus: '已匹配',
    note: '订单货款',
  },
  {
    settlementId: 'STL-DZ-2026-10-LK',
    orderExternalId: 'DZ-10012',
    feeType: '货款净额',
    amount: 16.4,
    currency: 'USD',
    matchStatus: '已匹配',
    note: '订单货款',
  },
  {
    settlementId: 'STL-DZ-2026-10-LK',
    orderExternalId: 'DZ-10021',
    feeType: '佣金',
    amount: -2.64,
    currency: 'USD',
    matchStatus: '已匹配',
    note: '平台佣金 11%',
  },
  {
    settlementId: 'STL-DZ-2026-10-LK',
    orderExternalId: 'DZ-10012',
    feeType: '支付手续费',
    amount: -0.58,
    currency: 'USD',
    matchStatus: '差异待核',
    note: '与账单差 -0.12',
  },
  {
    settlementId: 'STL-DZ-2026-10-LK',
    orderExternalId: '—',
    feeType: '推广费',
    amount: -18.2,
    currency: 'USD',
    matchStatus: '费用行',
    note: '账期汇总推广',
  },
  {
    settlementId: 'STL-LZ-2026-09-MY',
    orderExternalId: 'LZ-2180',
    feeType: '货款净额',
    amount: 46,
    currency: 'MYR',
    matchStatus: '已匹配',
    note: '订单货款',
  },
  {
    settlementId: 'STL-LZ-2026-09-MY',
    orderExternalId: 'LZ-2180',
    feeType: '佣金',
    amount: -5.06,
    currency: 'MYR',
    matchStatus: '已匹配',
    note: '平台佣金',
  },
  {
    settlementId: 'STL-LZ-2026-09-MY',
    orderExternalId: 'LZ-2180',
    feeType: '退款扣回',
    amount: -6.8,
    currency: 'MYR',
    matchStatus: '已匹配',
    note: '部分退款',
  },
  {
    settlementId: 'STL-LZ-2026-10-TH',
    orderExternalId: 'LZ-2201',
    feeType: '货款净额',
    amount: 168,
    currency: 'THB',
    matchStatus: '待匹配',
    note: '待核对平台账单行',
  },
  {
    settlementId: 'STL-LZ-2026-10-TH',
    orderExternalId: 'LZ-2201',
    feeType: 'JSB 运费',
    amount: -42,
    currency: 'THB',
    matchStatus: '待匹配',
    note: '泰国灰清专线',
  },
]

export type DemoProfitFeeLine = {
  profitId: string
  feeType: string
  amount: number
  currency: string
  note: string
  settlementId?: string
  costSku?: string
}

export const DEMO_PROFIT_FEE_LINES: DemoProfitFeeLine[] = [
  {
    profitId: 'DZ-10021',
    feeType: '商品成本',
    amount: -9.6,
    currency: 'USD',
    note: '到仓成本分摊',
    costSku: 'TEE-001',
  },
  {
    profitId: 'DZ-10021',
    feeType: '佣金',
    amount: -2.64,
    currency: 'USD',
    note: '平台佣金',
    settlementId: 'STL-DZ-2026-10-LK',
  },
  {
    profitId: 'DZ-10021',
    feeType: '物流费',
    amount: -1.2,
    currency: 'USD',
    note: '尾程/头程分摊',
  },
  {
    profitId: 'DZ-10021',
    feeType: '推广费',
    amount: -0.26,
    currency: 'USD',
    note: '广告分摊（示例）',
  },
  {
    profitId: 'LZ-2201',
    feeType: '商品成本',
    amount: -62,
    currency: 'THB',
    note: '到仓成本分摊',
    costSku: 'HUB-01',
  },
  {
    profitId: 'LZ-2201',
    feeType: '佣金',
    amount: -18.5,
    currency: 'THB',
    note: '平台佣金',
    settlementId: 'STL-LZ-2026-10-TH',
  },
  {
    profitId: 'LZ-2201',
    feeType: 'JSB 运费',
    amount: -8.9,
    currency: 'THB',
    note: '专线运费',
    settlementId: 'STL-LZ-2026-10-TH',
  },
  {
    profitId: 'LZ-2180',
    feeType: '商品成本',
    amount: -18.4,
    currency: 'MYR',
    note: '到仓成本分摊',
  },
  {
    profitId: 'LZ-2180',
    feeType: '佣金',
    amount: -5.06,
    currency: 'MYR',
    note: '平台佣金',
    settlementId: 'STL-LZ-2026-09-MY',
  },
  {
    profitId: 'LZ-2180',
    feeType: '退款',
    amount: -6.8,
    currency: 'MYR',
    note: '部分退款扣回',
    settlementId: 'STL-LZ-2026-09-MY',
  },
  {
    profitId: 'HSY000001001',
    feeType: '商品成本',
    amount: -204.8,
    currency: 'USD',
    note: 'SKU 月度成本汇总',
    costSku: 'TEE-001',
  },
  {
    profitId: 'HSY000001001',
    feeType: '平台/物流费',
    amount: -86.4,
    currency: 'USD',
    note: '多店铺费用汇总',
  },
  {
    profitId: 'HSY000001001',
    feeType: '退款',
    amount: -12,
    currency: 'USD',
    note: '退款合计',
  },
  {
    profitId: 'HSY000002001',
    feeType: '商品成本',
    amount: -310,
    currency: 'USD',
    note: 'SKU 月度成本汇总',
    costSku: 'HUB-01',
  },
  {
    profitId: 'HSY000002001',
    feeType: '平台/物流费',
    amount: -118,
    currency: 'USD',
    note: '多店铺费用汇总',
  },
]

export type DemoFreightEstimate = {
  id: string
  scenarioKey: 'air_ddp' | 'sea_lcl' | 'sea_fcl'
  scenario: string
  sku: string
  title: string
  weightKg: number
  volumeM3: number
  declaredUsd: number
  freightUsd: number
  dutyUsd: number
  ddpUsd: number
  cartonId: string
  adoptedCarrierCode: string
  adoptedCarrier: string
  status: string
  adoptedAt: string
}

export const DEMO_FREIGHT_ESTIMATES: DemoFreightEstimate[] = [
  {
    id: 'FE-2026-1001',
    scenarioKey: 'air_ddp',
    scenario: '空运 DDP',
    sku: 'HSY000001001',
    title: 'Oversized Cotton Tee · 补货测算',
    weightKg: 120,
    volumeM3: 0.8,
    declaredUsd: 450,
    freightUsd: 582,
    dutyUsd: 67.5,
    ddpUsd: 649.5,
    cartonId: 'CTN-0001',
    adoptedCarrierCode: 'CAR-SF',
    adoptedCarrier: '顺丰国际',
    status: '已采纳',
    adoptedAt: '2026-10-28 11:20',
  },
  {
    id: 'FE-2026-1002',
    scenarioKey: 'sea_lcl',
    scenario: '海运拼箱 LCL',
    sku: 'HSY000002001',
    title: 'USB-C Hub 7-in-1 · 头程比价',
    weightKg: 86,
    volumeM3: 1.2,
    declaredUsd: 620,
    freightUsd: 103.2,
    dutyUsd: 93,
    ddpUsd: 196.2,
    cartonId: 'CTN-0003',
    adoptedCarrierCode: 'CAR-SINOTRANS',
    adoptedCarrier: '中外运',
    status: '已采纳',
    adoptedAt: '2026-10-26 16:05',
  },
  {
    id: 'FE-2026-1003',
    scenarioKey: 'sea_fcl',
    scenario: '海运整柜 FCL',
    sku: 'HSY000001001',
    title: 'Tee 旺季整柜预估',
    weightKg: 4200,
    volumeM3: 28,
    declaredUsd: 9800,
    freightUsd: 735,
    dutyUsd: 1470,
    ddpUsd: 2205,
    cartonId: 'CTN-0003',
    adoptedCarrierCode: 'CAR-COSCO',
    adoptedCarrier: '中远海运',
    status: '比价中',
    adoptedAt: '—',
  },
]

export type DemoFreightQuote = {
  id: string
  scenarioKey: 'air_ddp' | 'sea_lcl' | 'sea_fcl'
  estimateId?: string
  carrierCode: string
  carrierName: string
  lane: string
  type: string
  unit: string
  price: string
  transit: string
  hsRate: string
  validUntil: string
}

export const DEMO_FREIGHT_QUOTES: DemoFreightQuote[] = [
  {
    id: 'FQ-AIR-SF',
    scenarioKey: 'air_ddp',
    estimateId: 'FE-2026-1001',
    carrierCode: 'CAR-SF',
    carrierName: '顺丰国际',
    lane: 'CN-XMN → LK-CMB',
    type: '即期报价',
    unit: '按 kg',
    price: 'USD 4.85 / kg',
    transit: '5-7 天',
    hsRate: '手机壳 HS 3926.90 · 15%',
    validUntil: '2026-11-15',
  },
  {
    id: 'FQ-AIR-DHL',
    scenarioKey: 'air_ddp',
    estimateId: 'FE-2026-1001',
    carrierCode: 'CAR-DHL',
    carrierName: 'DHL',
    lane: 'CN-XMN → LK-CMB',
    type: '牌价',
    unit: '按 kg',
    price: 'USD 5.20 / kg',
    transit: '4-6 天',
    hsRate: '手机壳 HS 3926.90 · 15%',
    validUntil: '2026-11-30',
  },
  {
    id: 'FQ-LCL-SINO',
    scenarioKey: 'sea_lcl',
    estimateId: 'FE-2026-1002',
    carrierCode: 'CAR-SINOTRANS',
    carrierName: '中外运',
    lane: 'CN-XMN → LK-CMB',
    type: '即期报价',
    unit: '按 m³',
    price: 'USD 86 / m³',
    transit: '12-16 天',
    hsRate: '按整批 HS 归类',
    validUntil: '2026-11-20',
  },
  {
    id: 'FQ-LCL-SITC',
    scenarioKey: 'sea_lcl',
    estimateId: 'FE-2026-1002',
    carrierCode: 'CAR-SITC',
    carrierName: '海丰',
    lane: 'CN-XMN → LK-CMB',
    type: '牌价',
    unit: '按 m³',
    price: 'USD 92 / m³',
    transit: '14-18 天',
    hsRate: '按整批 HS 归类',
    validUntil: '2026-11-30',
  },
  {
    id: 'FQ-FCL-MAERSK',
    scenarioKey: 'sea_fcl',
    estimateId: 'FE-2026-1003',
    carrierCode: 'CAR-MAERSK',
    carrierName: '马士基',
    lane: 'CN-XMN → LK-CMB',
    type: '牌价',
    unit: '按柜型',
    price: 'USD 780 / 20GP',
    transit: '10-14 天',
    hsRate: '按整批 HS 归类',
    validUntil: '2026-11-30',
  },
  {
    id: 'FQ-FCL-COSCO',
    scenarioKey: 'sea_fcl',
    estimateId: 'FE-2026-1003',
    carrierCode: 'CAR-COSCO',
    carrierName: '中远海运',
    lane: 'CN-XMN → LK-CMB',
    type: '即期报价',
    unit: '按柜型',
    price: 'USD 735 / 20GP',
    transit: '11-15 天',
    hsRate: '按整批 HS 归类',
    validUntil: '2026-11-18',
  },
]

export function quotesForCarrier(codeOrName: string | undefined): DemoFreightQuote[] {
  if (!codeOrName) return []
  return DEMO_FREIGHT_QUOTES.filter(
    (item) => item.carrierCode === codeOrName || item.carrierName === codeOrName,
  )
}

export function quotesForEstimate(estimateId: string | undefined): DemoFreightQuote[] {
  if (!estimateId) return []
  const estimate = DEMO_FREIGHT_ESTIMATES.find((item) => item.id === estimateId)
  if (!estimate) return []
  return DEMO_FREIGHT_QUOTES.filter(
    (item) => item.estimateId === estimateId || item.scenarioKey === estimate.scenarioKey,
  )
}

export function estimatesForCarton(cartonId: string | undefined): DemoFreightEstimate[] {
  if (!cartonId) return []
  return DEMO_FREIGHT_ESTIMATES.filter((item) => item.cartonId === cartonId)
}

export function estimatesForCarrier(codeOrName: string | undefined): DemoFreightEstimate[] {
  if (!codeOrName) return []
  return DEMO_FREIGHT_ESTIMATES.filter(
    (item) => item.adoptedCarrierCode === codeOrName || item.adoptedCarrier === codeOrName,
  )
}

export function settlementLinesFor(settlementId: string | undefined): DemoSettlementLine[] {
  if (!settlementId) return []
  return DEMO_SETTLEMENT_LINES.filter((item) => item.settlementId === settlementId)
}

export function profitFeesFor(profitId: string | undefined): DemoProfitFeeLine[] {
  if (!profitId) return []
  return DEMO_PROFIT_FEE_LINES.filter((item) => item.profitId === profitId)
}
