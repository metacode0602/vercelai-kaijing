/**
 * 报表专题（模块16）：动销 / 滞销 / 断货。
 * 口径：orders.placedAt + order_lines.qty + inventory_balances；无数据返回空数组。
 */
import { and, eq, gte, isNotNull, lt, sql } from 'drizzle-orm'
import {
  inventoryBalances,
  orderLines,
  orders,
  productVariants,
  products,
  shops,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function availableQty(b: {
  onHand: number
  reserved: number
  qcHold: number
  damaged: number
}): number {
  return Math.max(0, b.onHand - b.reserved - b.qcHold - b.damaged)
}

function rate(sold: number, avgStock: number): number | null {
  if (avgStock <= 0) return sold > 0 ? 100 : 0
  return Math.round((sold / avgStock) * 1000) / 10
}

export type SellThroughRow = {
  sku: string
  name: string
  shop: string
  listedAt: string
  isNewUnder7d: boolean
  sold7: number
  sold30: number
  sold90: number
  avgStock7: number
  avgStock30: number
  avgStock90: number
  rate7: number | null
  rate30: number | null
  rate90: number | null
}

export type StockRiskRow = {
  sku: string
  name: string
  available: number
  inTransit: number
  customsClearing: number
  reserved: number
  sold30: number
  dailySales30: number
  daysOfCoverLocal: number | null
  daysOfCoverWithEta: number | null
  flag: '滞销' | '断货风险' | '正常' | '新品观察'
}

/**
 * 动销率 = 区间销量 ÷ 期末可用库存（无日库存快照时用期末可用近似平均库存）。
 * 日期：今天 0 点为终点，向前 7/30/90 天；销量按 orders.placedAt。
 * 新品：变体 createdAt 未满 7 天则 rate7 = null（不计分母）。
 */
export async function listSellThrough(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string } = {},
): Promise<PaginatedResult<SellThroughRow> & { formula: string; rangeEnd: string }> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize ?? 50)
  const end = startOfDay(addDays(new Date(), 1))
  const d7 = addDays(end, -7)
  const d30 = addDays(end, -30)
  const d90 = addDays(end, -90)

  const variants = await db
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      skuCode: productVariants.skuCode,
      title: products.title,
      createdAt: productVariants.createdAt,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.organizationId, organizationId))

  const balRows = await db
    .select({
      variantId: inventoryBalances.variantId,
      onHand: inventoryBalances.onHand,
      reserved: inventoryBalances.reserved,
      qcHold: inventoryBalances.qcHold,
      damaged: inventoryBalances.damaged,
    })
    .from(inventoryBalances)
    .where(eq(inventoryBalances.organizationId, organizationId))

  const availByVariant = new Map<string, number>()
  for (const b of balRows) {
    availByVariant.set(b.variantId, (availByVariant.get(b.variantId) ?? 0) + availableQty(b))
  }

  async function soldMap(from: Date): Promise<Map<string, number>> {
    const rows = await db
      .select({
        variantId: orderLines.variantId,
        qty: sql<number>`coalesce(sum(${orderLines.qty}), 0)`,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(
        and(
          eq(orderLines.organizationId, organizationId),
          isNotNull(orderLines.variantId),
          gte(orders.placedAt, from),
          lt(orders.placedAt, end),
        ),
      )
      .groupBy(orderLines.variantId)
    const m = new Map<string, number>()
    for (const r of rows) {
      if (r.variantId) m.set(r.variantId, Number(r.qty) || 0)
    }
    return m
  }

  const [sold7, sold30, sold90] = await Promise.all([soldMap(d7), soldMap(d30), soldMap(d90)])

  const shopRows = await db
    .select({ name: shops.name })
    .from(shops)
    .where(eq(shops.organizationId, organizationId))
    .limit(1)
  const shopLabel = shopRows[0]?.name ?? '—'

  let rows: SellThroughRow[] = variants.map((v) => {
    const sku = v.skuCode || v.sku
    const avail = availByVariant.get(v.id) ?? 0
    const s7 = sold7.get(v.id) ?? 0
    const s30 = sold30.get(v.id) ?? 0
    const s90 = sold90.get(v.id) ?? 0
    const ageMs = end.getTime() - new Date(v.createdAt).getTime()
    const isNewUnder7d = ageMs < 7 * 24 * 3600 * 1000
    const avg7 = avail
    const avg30 = avail
    const avg90 = avail
    return {
      sku,
      name: v.title || sku,
      shop: shopLabel,
      listedAt: new Date(v.createdAt).toISOString().slice(0, 10),
      isNewUnder7d,
      sold7: s7,
      sold30: s30,
      sold90: s90,
      avgStock7: avg7,
      avgStock30: avg30,
      avgStock90: avg90,
      rate7: isNewUnder7d ? null : rate(s7, avg7),
      rate30: rate(s30, avg30),
      rate90: rate(s90, avg90),
    }
  })

  if (input.q?.trim()) {
    const q = input.q.trim().toLowerCase()
    rows = rows.filter(
      (r) => r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.shop.toLowerCase().includes(q),
    )
  }

  // 只保留有销量或有库存的 SKU，避免整表噪音；全空则返回空
  rows = rows.filter((r) => r.sold90 > 0 || r.avgStock90 > 0)
  rows.sort((a, b) => (b.rate30 ?? -1) - (a.rate30 ?? -1))

  const total = rows.length
  const items = rows.slice((page - 1) * pageSize, page * pageSize)
  return {
    items,
    total,
    page,
    pageSize,
    formula:
      '动销率 = 区间销量(order_lines.qty，orders.placedAt) ÷ 期末可用库存(on_hand-reserved-qc_hold-damaged)。无日库存快照时用期末可用近似平均库存。新品未满7天：7日动销不计分母。',
    rangeEnd: end.toISOString().slice(0, 10),
  }
}

/**
 * 滞销 = 90 天销量 = 0 且可用 > 0。
 * 断货风险 = 日均销(30d)>0 且本地可售天 < 7。
 * 可售天(本地) = 可用 / 日均销；可售天(含在途) = (可用+在途+清关) / 日均销。
 */
export async function listStockRisk(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; flag?: string } = {},
): Promise<PaginatedResult<StockRiskRow> & { formula: string }> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize ?? 50)
  const end = startOfDay(addDays(new Date(), 1))
  const d30 = addDays(end, -30)
  const d90 = addDays(end, -90)

  const variants = await db
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      skuCode: productVariants.skuCode,
      title: products.title,
      createdAt: productVariants.createdAt,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.organizationId, organizationId))

  const balRows = await db
    .select()
    .from(inventoryBalances)
    .where(eq(inventoryBalances.organizationId, organizationId))

  const agg = new Map<
    string,
    { available: number; inTransit: number; customs: number; reserved: number }
  >()
  for (const b of balRows) {
    const cur = agg.get(b.variantId) ?? { available: 0, inTransit: 0, customs: 0, reserved: 0 }
    cur.available += availableQty(b)
    cur.inTransit += b.inTransit
    cur.customs += b.customsClearing
    cur.reserved += b.reserved
    agg.set(b.variantId, cur)
  }

  async function soldMap(from: Date): Promise<Map<string, number>> {
    const rows = await db
      .select({
        variantId: orderLines.variantId,
        qty: sql<number>`coalesce(sum(${orderLines.qty}), 0)`,
      })
      .from(orderLines)
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(
        and(
          eq(orderLines.organizationId, organizationId),
          isNotNull(orderLines.variantId),
          gte(orders.placedAt, from),
          lt(orders.placedAt, end),
        ),
      )
      .groupBy(orderLines.variantId)
    const m = new Map<string, number>()
    for (const r of rows) {
      if (r.variantId) m.set(r.variantId, Number(r.qty) || 0)
    }
    return m
  }

  const [sold30, sold90] = await Promise.all([soldMap(d30), soldMap(d90)])

  let rows: StockRiskRow[] = variants.map((v) => {
    const sku = v.skuCode || v.sku
    const a = agg.get(v.id) ?? { available: 0, inTransit: 0, customs: 0, reserved: 0 }
    const s30 = sold30.get(v.id) ?? 0
    const s90 = sold90.get(v.id) ?? 0
    const daily = Math.round((s30 / 30) * 100) / 100
    const coverLocal = daily > 0 ? Math.round((a.available / daily) * 10) / 10 : null
    const coverEta =
      daily > 0 ? Math.round(((a.available + a.inTransit + a.customs) / daily) * 10) / 10 : null
    const ageMs = end.getTime() - new Date(v.createdAt).getTime()
    const isNew = ageMs < 14 * 24 * 3600 * 1000
    let flag: StockRiskRow['flag'] = '正常'
    if (s90 === 0 && a.available > 0 && !isNew) flag = '滞销'
    else if (daily > 0 && coverLocal != null && coverLocal < 7) flag = '断货风险'
    else if (isNew) flag = '新品观察'
    return {
      sku,
      name: v.title || sku,
      available: a.available,
      inTransit: a.inTransit,
      customsClearing: a.customs,
      reserved: a.reserved,
      sold30: s30,
      dailySales30: daily,
      daysOfCoverLocal: coverLocal,
      daysOfCoverWithEta: coverEta,
      flag,
    }
  })

  rows = rows.filter((r) => r.available > 0 || r.inTransit > 0 || r.sold30 > 0 || r.customsClearing > 0)
  if (input.q?.trim()) {
    const q = input.q.trim().toLowerCase()
    rows = rows.filter((r) => r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
  }
  if (input.flag && input.flag !== '全部') {
    rows = rows.filter((r) => r.flag === input.flag)
  }
  rows.sort((a, b) => {
    const rank = (f: StockRiskRow['flag']) =>
      f === '断货风险' ? 0 : f === '滞销' ? 1 : f === '新品观察' ? 2 : 3
    return rank(a.flag) - rank(b.flag) || a.sku.localeCompare(b.sku)
  })

  const total = rows.length
  return {
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    formula:
      '滞销=90天销量0且可用>0（排除新品14天）。断货风险=日均销(30d销量/30)>0 且 本地可售天=可用/日均销 <7。含在途可售天=(可用+在途+清关)/日均销。',
  }
}
