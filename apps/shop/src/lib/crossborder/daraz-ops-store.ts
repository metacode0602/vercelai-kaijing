'use client'

/**
 * Daraz LK P1 报表 / 合规 / 客服壳 mock 数据与公式。
 * P2 抓取/优惠券仅文档阻塞（Q36/Q38/Q44），此处不实现。
 */

export type SellThroughRow = {
  id: string
  sku: string
  name: string
  shop: string
  listedAt: string
  sold7: number
  sold30: number
  sold90: number
  avgStock7: number
  avgStock30: number
  avgStock90: number
  isNewUnder7d: boolean
}

export type StockRiskRow = {
  id: string
  sku: string
  name: string
  available: number
  inTransit: number
  customsClearing: number
  dailySales30: number
  daysOfCoverLocal: number | null
  daysOfCoverWithEta: number | null
  etaWarehouse: string
  flag: '滞销' | '断货风险' | '正常' | '新品观察'
}

export type AttributionRow = {
  id: string
  sku: string
  name: string
  badReviews: number
  returns: number
  reasons: {
    quality: number
    size: number
    logistics: number
    description: number
    other: number
  }
}

export type HsSlsiRow = {
  id: string
  hsCode: string
  description: string
  slsiRequired: boolean
  certName: string
  blockListing: boolean
  source: string
}

export type CsInboxMessage = {
  id: string
  shop: string
  platform: string
  customer: string
  subject: string
  preview: string
  receivedAt: string
  status: '未读' | '已读'
  authNote: string
}

export const SELL_THROUGH_SEED: SellThroughRow[] = [
  {
    id: 'ST-1',
    sku: 'TEE-001',
    name: '速干 Polo',
    shop: 'Daraz LK',
    listedAt: '2026-08-01',
    sold7: 42,
    sold30: 168,
    sold90: 410,
    avgStock7: 220,
    avgStock30: 260,
    avgStock90: 300,
    isNewUnder7d: false,
  },
  {
    id: 'ST-2',
    sku: 'HDY-220',
    name: '高速吹风机',
    shop: 'Daraz LK',
    listedAt: '2026-10-26',
    sold7: 8,
    sold30: 8,
    sold90: 8,
    avgStock7: 40,
    avgStock30: 40,
    avgStock90: 40,
    isNewUnder7d: true,
  },
  {
    id: 'ST-3',
    sku: 'BAG-088',
    name: '旅行收纳包',
    shop: 'Daraz LK',
    listedAt: '2026-06-10',
    sold7: 0,
    sold30: 0,
    sold90: 0,
    avgStock7: 180,
    avgStock30: 180,
    avgStock90: 180,
    isNewUnder7d: false,
  },
  {
    id: 'ST-4',
    sku: 'MUG-012',
    name: '保温咖啡杯',
    shop: 'Daraz LK',
    listedAt: '2026-07-20',
    sold7: 15,
    sold30: 55,
    sold90: 140,
    avgStock7: 90,
    avgStock30: 110,
    avgStock90: 150,
    isNewUnder7d: false,
  },
]

/** 动销率 = 销量 / 平均库存；新品未满 7 天不进 7 日分母（返回 null）。 */
export function sellThroughRate(sold: number, avgStock: number, includeInDenom: boolean) {
  if (!includeInDenom) return null
  if (avgStock <= 0) return sold > 0 ? 999 : 0
  return Number(((sold / avgStock) * 100).toFixed(1))
}

export const STOCK_RISK_SEED: StockRiskRow[] = [
  {
    id: 'SR-1',
    sku: 'BAG-088',
    name: '旅行收纳包',
    available: 180,
    inTransit: 0,
    customsClearing: 600,
    dailySales30: 0,
    daysOfCoverLocal: null,
    daysOfCoverWithEta: null,
    etaWarehouse: '2026-10-18',
    flag: '滞销',
  },
  {
    id: 'SR-2',
    sku: 'HDY-220',
    name: '高速吹风机',
    available: 12,
    inTransit: 120,
    customsClearing: 0,
    dailySales30: 2.5,
    daysOfCoverLocal: 4.8,
    daysOfCoverWithEta: 52.8,
    etaWarehouse: '2026-11-12',
    flag: '断货风险',
  },
  {
    id: 'SR-3',
    sku: 'TEE-001',
    name: '速干 Polo',
    available: 292,
    inTransit: 400,
    customsClearing: 200,
    dailySales30: 5.6,
    daysOfCoverLocal: 52.1,
    daysOfCoverWithEta: 159.3,
    etaWarehouse: '2026-11-12',
    flag: '正常',
  },
  {
    id: 'SR-4',
    sku: 'NEW-991',
    name: '硅胶厨具套装',
    available: 30,
    inTransit: 0,
    customsClearing: 0,
    dailySales30: 0.2,
    daysOfCoverLocal: 150,
    daysOfCoverWithEta: 150,
    etaWarehouse: '—',
    flag: '新品观察',
  },
]

/** 可售天数（本地）= available / dailySales；含在途 ETA = (available+在途+清关) / dailySales（原型简化，不按分段 ETA 折现）。 */
export function daysOfCover(available: number, inbound: number, dailySales: number) {
  if (dailySales <= 0) return null
  return Number(((available + inbound) / dailySales).toFixed(1))
}

export const ATTRIBUTION_SEED: AttributionRow[] = [
  {
    id: 'ATT-1',
    sku: 'HDY-220',
    name: '高速吹风机',
    badReviews: 18,
    returns: 11,
    reasons: { quality: 7, size: 1, logistics: 4, description: 4, other: 2 },
  },
  {
    id: 'ATT-2',
    sku: 'TEE-001',
    name: '速干 Polo',
    badReviews: 9,
    returns: 6,
    reasons: { quality: 2, size: 5, logistics: 1, description: 1, other: 0 },
  },
  {
    id: 'ATT-3',
    sku: 'BAG-088',
    name: '旅行收纳包',
    badReviews: 4,
    returns: 3,
    reasons: { quality: 1, size: 0, logistics: 2, description: 0, other: 1 },
  },
]

export const HS_SLSI_SEED: HsSlsiRow[] = [
  {
    id: 'HS-1',
    hsCode: '8516.31',
    description: '电吹风 / 干发器',
    slsiRequired: true,
    certName: 'SLSI 电热器具强制认证',
    blockListing: true,
    source: 'mock-import',
  },
  {
    id: 'HS-2',
    hsCode: '6109.10',
    description: '棉制 T 恤',
    slsiRequired: false,
    certName: '—',
    blockListing: false,
    source: 'manual',
  },
  {
    id: 'HS-3',
    hsCode: '8509.40',
    description: '食品研磨机',
    slsiRequired: true,
    certName: 'SLSI 家电强制认证',
    blockListing: true,
    source: 'mock-import',
  },
]

export const CS_INBOX_SEED: CsInboxMessage[] = [
  {
    id: 'MSG-1',
    shop: 'Daraz LK · 主店',
    platform: 'Daraz',
    customer: 'Nimal P.',
    subject: '吹风机包装破损',
    preview: '收到时外箱凹陷，是否可换货？',
    receivedAt: '2026-10-30 21:14',
    status: '未读',
    authNote: 'shop token scope=im.read（只读壳，无发送）',
  },
  {
    id: 'MSG-2',
    shop: 'Daraz LK · 主店',
    platform: 'Daraz',
    customer: 'Ayesha K.',
    subject: '尺码咨询',
    preview: 'L 码胸围是多少？',
    receivedAt: '2026-10-30 18:02',
    status: '已读',
    authNote: 'shop token scope=im.read',
  },
  {
    id: 'MSG-3',
    shop: 'Daraz LK · Outlet',
    platform: 'Daraz',
    customer: 'Ruwan S.',
    subject: '物流延迟',
    preview: '订单超过 ETA 未更新…',
    receivedAt: '2026-10-29 11:40',
    status: '未读',
    authNote: '每店独立 OAuth；本壳禁止 send API',
  },
]

export const ATTRIBUTION_REASON_LABELS = {
  quality: '质量',
  size: '尺码/规格',
  logistics: '物流破损/延误',
  description: '描述不符',
  other: '其他',
} as const
