/**
 * 财务结算 / 成本 / 利润 / 运费估算 dataaccess（模块13）。
 * 不假装平台结算 API 已通；费用/税费不写死，按行汇总或记 0。
 */
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import {
  feeTemplates,
  feeTemplateVersions,
  logisticsFeeDetails,
  oceanShipments,
  orderLines,
  orders,
  products,
  productVariants,
  settlementLines,
  settlements,
  shops,
  skuCosts,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  emptyFees,
  feeKindBucket,
  formatDateOnly,
  formatStamp,
  money,
  sumFeeBreakdown,
  toDbSettlementStatus,
  toUiSettlementStatus,
  type FeeBreakdown,
  type UiSettlementStatus,
} from '@/lib/server/mappers/finance'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

export type SettlementLineDto = {
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

export type SettlementDto = {
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
  status: UiSettlementStatus
  platformStatus: string
  platformUpdatedAt: string
  fees: FeeBreakdown
  lines: SettlementLineDto[]
}

export type SkuCostDto = {
  id: string
  sku: string
  variantId: string
  name: string
  kind: string
  amount: number
  currency: string
  landedUnitCost: number | null
  containerLotId: string
  versionNo: number
  effectiveFrom: string
  status: string
  note: string
}

export type ProfitDto = {
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
  currency: string
}

export type FreightEstimateDto = {
  id: string
  code: string
  name: string
  platform: string
  country: string
  type: string
  status: string
  pool: string
  versionNo: number | null
  priority: number | null
  effectiveFrom: string
  note: string
  source: 'fee_template' | 'ocean' | 'logistics_fee'
  amount: number | null
  currency: string
}

function periodLabel(start: Date | null, end: Date | null): string {
  if (!start && !end) return '—'
  return `${formatDateOnly(start)} ~ ${formatDateOnly(end)}`
}

function aggregateFees(lines: { feeKind: string | null; amount: string | null }[]): FeeBreakdown {
  const fees = emptyFees()
  for (const line of lines) {
    const bucket = feeKindBucket(line.feeKind)
    if (!bucket) continue
    fees[bucket] += money(line.amount)
  }
  return fees
}

export async function listSettlements(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string; shopId?: string },
): Promise<PaginatedResult<SettlementDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(settlements.organizationId, organizationId)]
  const dbStatus = toDbSettlementStatus(input.status)
  if (dbStatus) filters.push(eq(settlements.status, dbStatus))
  if (input.shopId) filters.push(eq(settlements.shopId, input.shopId))
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(settlements.externalSettlementId, q),
        ilike(settlements.id, q),
        ilike(shops.name, q),
        ilike(shops.platform, q),
      )!,
    )
  }
  const where = and(...filters)!

  const [totalRow] = await db
    .select({ value: count() })
    .from(settlements)
    .innerJoin(shops, eq(settlements.shopId, shops.id))
    .where(where)

  const rows = await db
    .select({ settlement: settlements, shop: shops })
    .from(settlements)
    .innerJoin(shops, eq(settlements.shopId, shops.id))
    .where(where)
    .orderBy(desc(settlements.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const ids = rows.map((r) => r.settlement.id)
  const allLines =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(settlementLines)
          .where(
            and(
              eq(settlementLines.organizationId, organizationId),
              inArray(settlementLines.settlementId, ids),
            ),
          )

  const linesBySettlement = new Map<string, typeof allLines>()
  for (const line of allLines) {
    const list = linesBySettlement.get(line.settlementId) ?? []
    list.push(line)
    linesBySettlement.set(line.settlementId, list)
  }

  const items: SettlementDto[] = rows.map(({ settlement, shop }) => {
    const lines = linesBySettlement.get(settlement.id) ?? []
    const fees = aggregateFees(lines)
    if (fees.logistics === 0) fees.logistics = money(settlement.shipmentFee)
    if (fees.refunds === 0) fees.refunds = money(settlement.refundsAmount)
    const feesTotal = money(settlement.feesTotal) || sumFeeBreakdown(fees)
    return {
      id: settlement.id,
      externalSettlementId: settlement.externalSettlementId,
      platform: shop.platform || '—',
      shop: shop.name,
      shopId: shop.id,
      period: periodLabel(settlement.periodStart, settlement.periodEnd),
      periodStart: formatDateOnly(settlement.periodStart),
      periodEnd: formatDateOnly(settlement.periodEnd),
      billAmount: money(settlement.billAmount),
      itemRevenue: money(settlement.itemRevenue),
      otherRevenueTotal: money(settlement.otherRevenueTotal),
      refundsAmount: money(settlement.refundsAmount),
      shipmentFee: money(settlement.shipmentFee),
      feesTotal,
      payoutAmount: money(settlement.payoutAmount),
      payoutStatus: settlement.payoutStatus || 'pending',
      paidAt: formatStamp(settlement.paidAt),
      currency: settlement.currency || 'USD',
      matchedOrders: lines.filter((l) => l.orderId).length,
      diffAmount: 0,
      status: toUiSettlementStatus(settlement.status),
      platformStatus: settlement.status?.toUpperCase() || 'PENDING',
      platformUpdatedAt: formatStamp(settlement.platformUpdatedAt),
      fees,
      lines: lines.map((l) => ({
        id: l.id,
        order: l.externalOrderNo || l.orderId || '—',
        orderLineId: l.orderLineId || '—',
        feeKind: l.feeKind || '—',
        feeType: l.feeType || l.feeName || '—',
        transactionType: l.transactionType || '—',
        externalTransactionId: l.externalTransactionId || '—',
        amount: money(l.amount),
        taxAmount: money(l.taxAmount),
        currency: l.currency || settlement.currency || 'USD',
        sellerSku: l.sellerSku || '—',
        shippingProvider: l.shippingProvider || '—',
        note: l.note || '',
      })),
    }
  })

  return { items, total: Number(totalRow?.value ?? 0), page, pageSize }
}

export async function getSettlement(
  db: AppDatabase,
  organizationId: string,
  id: string,
): Promise<SettlementDto | null> {
  const [hit] = await db
    .select({ id: settlements.id })
    .from(settlements)
    .where(
      and(
        eq(settlements.organizationId, organizationId),
        or(eq(settlements.id, id), eq(settlements.externalSettlementId, id))!,
      ),
    )
    .limit(1)
  if (!hit) return null
  const page = await listSettlements(db, organizationId, { page: 1, pageSize: 50, q: hit.id })
  return page.items.find((i) => i.id === hit.id) ?? null
}

export async function settlementStats(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select({ status: settlements.status, value: count() })
    .from(settlements)
    .where(eq(settlements.organizationId, organizationId))
    .groupBy(settlements.status)
  const byStatus: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    const ui = toUiSettlementStatus(row.status)
    byStatus[ui] = (byStatus[ui] ?? 0) + Number(row.value)
    total += Number(row.value)
  }
  const [sumRow] = await db
    .select({
      payout: sql<string>`coalesce(sum(${settlements.payoutAmount}), 0)`,
      bill: sql<string>`coalesce(sum(${settlements.billAmount}), 0)`,
      fees: sql<string>`coalesce(sum(${settlements.feesTotal}), 0)`,
    })
    .from(settlements)
    .where(eq(settlements.organizationId, organizationId))
  return {
    total,
    byStatus,
    payoutTotal: money(sumRow?.payout),
    billTotal: money(sumRow?.bill),
    feesTotal: money(sumRow?.fees),
  }
}

export async function listSkuCosts(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; currency?: string },
): Promise<PaginatedResult<SkuCostDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(skuCosts.organizationId, organizationId)]
  if (input.currency) filters.push(eq(skuCosts.currency, input.currency))
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(ilike(productVariants.sku, q), ilike(products.title, q), ilike(skuCosts.kind, q))!,
    )
  }
  const where = and(...filters)!
  const [totalRow] = await db
    .select({ value: count() })
    .from(skuCosts)
    .innerJoin(productVariants, eq(skuCosts.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(where)
  const rows = await db
    .select({ cost: skuCosts, variant: productVariants, product: products })
    .from(skuCosts)
    .innerJoin(productVariants, eq(skuCosts.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(where)
    .orderBy(desc(skuCosts.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    items: rows.map(({ cost, variant, product }) => ({
      id: cost.id,
      sku: variant.sku,
      variantId: variant.id,
      name: product.title || variant.sku,
      kind: cost.kind,
      amount: money(cost.amount),
      currency: cost.currency || 'CNY',
      landedUnitCost: cost.landedUnitCost == null ? null : money(cost.landedUnitCost),
      containerLotId: cost.containerLotId || '—',
      versionNo: cost.versionNo ?? 1,
      effectiveFrom: formatDateOnly(cost.effectiveFrom),
      status: cost.effectiveTo ? '已失效' : '生效中',
      note: cost.note || '',
    })),
    total: Number(totalRow?.value ?? 0),
    page,
    pageSize,
  }
}

export async function listProfits(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; view?: 'order' | 'sku'; q?: string },
): Promise<PaginatedResult<ProfitDto>> {
  const view = input.view ?? 'order'
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)

  if (view === 'sku') {
    return listSkuProfits(db, organizationId, { page, pageSize, q: input.q })
  }
  return listOrderProfits(db, organizationId, { page, pageSize, q: input.q })
}

async function latestCostByVariant(
  db: AppDatabase,
  organizationId: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      variantId: skuCosts.variantId,
      amount: skuCosts.amount,
      landed: skuCosts.landedUnitCost,
      createdAt: skuCosts.createdAt,
    })
    .from(skuCosts)
    .where(eq(skuCosts.organizationId, organizationId))
    .orderBy(desc(skuCosts.createdAt))
  const map = new Map<string, number>()
  for (const row of rows) {
    if (map.has(row.variantId)) continue
    map.set(row.variantId, money(row.landed ?? row.amount))
  }
  return map
}

async function feesByOrderId(
  db: AppDatabase,
  organizationId: string,
): Promise<Map<string, { fees: FeeBreakdown; settled: boolean }>> {
  const lines = await db
    .select({
      orderId: settlementLines.orderId,
      feeKind: settlementLines.feeKind,
      amount: settlementLines.amount,
    })
    .from(settlementLines)
    .where(eq(settlementLines.organizationId, organizationId))

  const map = new Map<string, { fees: FeeBreakdown; settled: boolean }>()
  for (const line of lines) {
    if (!line.orderId) continue
    const cur = map.get(line.orderId) ?? { fees: emptyFees(), settled: true }
    const bucket = feeKindBucket(line.feeKind)
    if (bucket) cur.fees[bucket] += money(line.amount)
    cur.settled = true
    map.set(line.orderId, cur)
  }

  const logistics = await db
    .select({
      orderId: logisticsFeeDetails.orderId,
      amount: logisticsFeeDetails.amount,
    })
    .from(logisticsFeeDetails)
    .where(eq(logisticsFeeDetails.organizationId, organizationId))
  for (const row of logistics) {
    if (!row.orderId) continue
    const cur = map.get(row.orderId) ?? { fees: emptyFees(), settled: true }
    cur.fees.logistics += money(row.amount)
    cur.settled = true
    map.set(row.orderId, cur)
  }
  return map
}

async function listOrderProfits(
  db: AppDatabase,
  organizationId: string,
  input: { page: number; pageSize: number; q?: string },
): Promise<PaginatedResult<ProfitDto>> {
  const filters: SQL[] = [eq(orders.organizationId, organizationId)]
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(or(ilike(orders.externalOrderId, q), ilike(orders.orderNumber, q), ilike(orders.id, q))!)
  }
  const where = and(...filters)!
  const [totalRow] = await db.select({ value: count() }).from(orders).where(where)
  const orderRows = await db
    .select()
    .from(orders)
    .where(where)
    .orderBy(desc(orders.placedAt), desc(orders.createdAt))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize)

  const costMap = await latestCostByVariant(db, organizationId)
  const feeMap = await feesByOrderId(db, organizationId)

  const orderIds = orderRows.map((o) => o.id)
  const lines =
    orderIds.length === 0
      ? []
      : await db
          .select()
          .from(orderLines)
          .where(and(eq(orderLines.organizationId, organizationId), inArray(orderLines.orderId, orderIds)))

  const linesByOrder = new Map<string, typeof lines>()
  for (const line of lines) {
    const list = linesByOrder.get(line.orderId) ?? []
    list.push(line)
    linesByOrder.set(line.orderId, list)
  }

  const items: ProfitDto[] = orderRows.map((order) => {
    const ols = linesByOrder.get(order.id) ?? []
    let cost = 0
    for (const line of ols) {
      const unit = line.variantId ? costMap.get(line.variantId) ?? 0 : 0
      cost += unit * (line.qty ?? 1)
    }
    const feeInfo = feeMap.get(order.id)
    const breakdown = feeInfo?.fees ?? emptyFees()
    const fees = sumFeeBreakdown(breakdown)
    const refund = breakdown.refunds
    const revenue = money(order.totalAmount)
    const profit = revenue - cost - fees
    const settled = Boolean(feeInfo?.settled)
    return {
      id: order.orderNumber || order.externalOrderId || order.id,
      dimension: '订单',
      view: 'order',
      revenue,
      cost,
      fees,
      refund,
      profit,
      margin: revenue > 0 ? `${((profit / revenue) * 100).toFixed(1)}%` : '—',
      fx: order.currency || 'USD',
      status: settled ? '已结算' : '未结算',
      breakdown,
      currency: order.currency || 'USD',
    }
  })

  return { items, total: Number(totalRow?.value ?? 0), page: input.page, pageSize: input.pageSize }
}

async function listSkuProfits(
  db: AppDatabase,
  organizationId: string,
  input: { page: number; pageSize: number; q?: string },
): Promise<PaginatedResult<ProfitDto>> {
  const costMap = await latestCostByVariant(db, organizationId)
  const filters: SQL[] = [eq(orderLines.organizationId, organizationId)]
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(or(ilike(orderLines.sku, q), ilike(orderLines.sellerSku, q), ilike(orderLines.title, q))!)
  }
  const where = and(...filters)!

  const agg = await db
    .select({
      sku: orderLines.sku,
      variantId: orderLines.variantId,
      title: orderLines.title,
      qty: sql<number>`coalesce(sum(${orderLines.qty}), 0)`,
      revenue: sql<string>`coalesce(sum(${orderLines.paidPrice}), 0)`,
    })
    .from(orderLines)
    .where(where)
    .groupBy(orderLines.sku, orderLines.variantId, orderLines.title)
    .orderBy(desc(sql`coalesce(sum(${orderLines.paidPrice}), 0)`))

  const total = agg.length
  const slice = agg.slice((input.page - 1) * input.pageSize, input.page * input.pageSize)
  const feeMap = await feesByOrderId(db, organizationId)
  // SKU 维度费用粗分摊：无订单归属时记 0，避免写死税率
  const items: ProfitDto[] = slice.map((row) => {
    const sku = row.sku || '—'
    const qty = Number(row.qty ?? 0)
    const unitCost = row.variantId ? costMap.get(row.variantId) ?? 0 : 0
    const cost = unitCost * qty
    const revenue = money(row.revenue)
    const breakdown = emptyFees()
    const fees = 0
    const profit = revenue - cost - fees
    const settled = false
    // if any fee map exists globally, still mark unsettle at sku level unless we have settlement lines for sku — keep 未结算 when no settlement linkage
    void feeMap
    return {
      id: sku,
      dimension: row.title || sku,
      view: 'sku',
      revenue,
      cost,
      fees,
      refund: 0,
      profit,
      margin: revenue > 0 ? `${((profit / revenue) * 100).toFixed(1)}%` : '—',
      fx: '订单币种混计',
      status: settled ? '已结算' : '未结算',
      breakdown,
      currency: 'MIX',
    }
  })
  return { items, total, page: input.page, pageSize: input.pageSize }
}

export async function financeOverview(db: AppDatabase, organizationId: string) {
  const [orderSum] = await db
    .select({
      revenue: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`,
      orderCount: count(),
    })
    .from(orders)
    .where(eq(orders.organizationId, organizationId))

  const profits = await listOrderProfits(db, organizationId, { page: 1, pageSize: 500 })
  const cost = profits.items.reduce((s, p) => s + p.cost, 0)
  const fees = profits.items.reduce((s, p) => s + p.fees, 0)
  const revenue = money(orderSum?.revenue)
  const profit = revenue - cost - fees
  const settlement = await settlementStats(db, organizationId)

  return {
    revenue,
    cost,
    fees,
    profit,
    margin: revenue > 0 ? `${((profit / revenue) * 100).toFixed(1)}%` : '—',
    settlementCount: settlement.total,
    payoutTotal: settlement.payoutTotal,
    orderCount: Number(orderSum?.orderCount ?? 0),
  }
}

export async function listFreightEstimates(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string },
): Promise<PaginatedResult<FreightEstimateDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)

  const templateRows = await db
    .select({
      template: feeTemplates,
      version: feeTemplateVersions,
    })
    .from(feeTemplates)
    .leftJoin(
      feeTemplateVersions,
      and(
        eq(feeTemplateVersions.templateId, feeTemplates.id),
        eq(feeTemplateVersions.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(feeTemplates.organizationId, organizationId),
        or(
          eq(feeTemplates.type, 'logistics'),
          eq(feeTemplates.type, 'shipping'),
          eq(feeTemplates.type, 'ocean'),
          eq(feeTemplates.type, 'freight'),
          ilike(feeTemplates.type, '%fee%'),
          ilike(feeTemplates.code, '%FREIGHT%'),
          ilike(feeTemplates.code, '%SHIP%'),
          ilike(feeTemplates.name, '%运%'),
        )!,
      ),
    )
    .orderBy(desc(feeTemplates.updatedAt))
    .limit(200)

  const best = new Map<string, FreightEstimateDto>()
  for (const { template, version } of templateRows) {
    const existing = best.get(template.id)
    const candidate: FreightEstimateDto = {
      id: template.id,
      code: template.code,
      name: template.name,
      platform: template.platform,
      country: template.country,
      type: template.type,
      status: template.status,
      pool: template.fulfillmentPool || '—',
      versionNo: version?.versionNo ?? null,
      priority: version?.priority ?? null,
      effectiveFrom: formatDateOnly(version?.effectiveFrom),
      note: template.note || version?.note || '',
      source: 'fee_template',
      amount: null,
      currency: '—',
    }
    if (!existing || (candidate.versionNo ?? 0) > (existing.versionNo ?? 0)) {
      best.set(template.id, candidate)
    }
  }

  const oceanRows = await db
    .select()
    .from(oceanShipments)
    .where(eq(oceanShipments.organizationId, organizationId))
    .orderBy(desc(oceanShipments.updatedAt))
    .limit(50)

  for (const ocean of oceanRows) {
    const packing = (ocean.packingDetails ?? {}) as Record<string, unknown>
    const amountRaw = packing.freightAmount ?? packing.totalFreight ?? packing.amount
    best.set(`ocean:${ocean.id}`, {
      id: ocean.id,
      code: ocean.lotCode,
      name: `海运柜次 ${ocean.lotCode}`,
      platform: ocean.platform || 'ocean',
      country: ocean.destPort || '—',
      type: ocean.freightMode || 'ocean',
      status: ocean.status,
      pool: ocean.originPort || ocean.destPort || '—',
      versionNo: null,
      priority: null,
      effectiveFrom: ocean.etd || '—',
      note: ocean.notes || '',
      source: 'ocean',
      amount: amountRaw == null ? null : money(String(amountRaw)),
      currency: typeof packing.currency === 'string' ? packing.currency : 'USD',
    })
  }

  let items = [...best.values()]
  if (input.q?.trim()) {
    const q = input.q.trim().toLowerCase()
    items = items.filter(
      (i) =>
        i.code.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q) ||
        i.platform.toLowerCase().includes(q) ||
        i.type.toLowerCase().includes(q),
    )
  }
  const total = items.length
  const slice = items.slice((page - 1) * pageSize, page * pageSize)
  return { items: slice, total, page, pageSize }
}

export async function getFreightEstimate(
  db: AppDatabase,
  organizationId: string,
  id: string,
): Promise<FreightEstimateDto | null> {
  const list = await listFreightEstimates(db, organizationId, { page: 1, pageSize: 200, q: undefined })
  return list.items.find((i) => i.id === id || i.code === id) ?? null
}

/** 更新结算状态（本地 ERP，非平台回写） */
export async function updateSettlementStatus(
  db: AppDatabase,
  organizationId: string,
  id: string,
  status: string,
): Promise<SettlementDto> {
  const dbStatus = toDbSettlementStatus(status) || 'pending'
  const [existing] = await db
    .select()
    .from(settlements)
    .where(and(eq(settlements.organizationId, organizationId), eq(settlements.id, id)))
    .limit(1)
  if (!existing) throw new Error(`结算单不存在：${id}`)
  await db
    .update(settlements)
    .set({
      status: dbStatus,
      paidAt: dbStatus === 'paid' ? new Date() : existing.paidAt,
      payoutStatus: dbStatus === 'paid' ? 'paid' : existing.payoutStatus,
    })
    .where(eq(settlements.id, id))
  const detail = await getSettlement(db, organizationId, id)
  if (!detail) throw new Error(`结算单不存在：${id}`)
  return detail
}


export type SkuCostDetailDto = {
  sku: string
  variantId: string
  title: string
  currency: string
  versions: Array<{
    id: string
    kind: string
    amount: number
    landedUnitCost: number | null
    containerLotId: string
    versionNo: number
    effectiveFrom: string
    status: string
    note: string
    taxBreakdown: Record<string, number>
    calculatorSnapshot: Record<string, unknown>
  }>
  latest: {
    id: string
    kind: string
    amount: number
    landedUnitCost: number | null
    currency: string
    containerLotId: string
    versionNo: number
    suggestPrice: number | null
    targetMarginPct: number | null
    purchase: number
    freight: number
    customs: number
    pal: number
    cess: number
    vat: number
    sscl: number
  } | null
}

export async function getSkuCostsBySku(
  db: AppDatabase,
  organizationId: string,
  sku: string,
): Promise<SkuCostDetailDto | null> {
  const code = sku.trim()
  if (!code) return null
  const [variant] = await db
    .select({ variant: productVariants, product: products })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        or(eq(productVariants.skuCode, code), eq(productVariants.sku, code)),
      ),
    )
    .limit(1)
  if (!variant) return null

  const costs = await db
    .select()
    .from(skuCosts)
    .where(and(eq(skuCosts.organizationId, organizationId), eq(skuCosts.variantId, variant.variant.id)))
    .orderBy(desc(skuCosts.createdAt))

  const versions = costs.map((cost) => {
    const snap = (cost.calculatorSnapshot ?? {}) as Record<string, unknown>
    const tax = (snap.taxBreakdown ?? snap.taxes ?? {}) as Record<string, number>
    return {
      id: cost.id,
      kind: cost.kind,
      amount: money(cost.amount),
      landedUnitCost: cost.landedUnitCost == null ? null : money(cost.landedUnitCost),
      containerLotId: cost.containerLotId || '—',
      versionNo: cost.versionNo ?? 1,
      effectiveFrom: formatDateOnly(cost.effectiveFrom),
      status: cost.effectiveTo ? '已失效' : '生效中',
      note: cost.note || '',
      taxBreakdown: {
        pal: Number(tax.pal ?? 0) || 0,
        cess: Number(tax.cess ?? 0) || 0,
        vat: Number(tax.vat ?? 0) || 0,
        sscl: Number(tax.sscl ?? 0) || 0,
      },
      calculatorSnapshot: snap,
    }
  })

  const latestCost = costs[0]
  let latest: SkuCostDetailDto['latest'] = null
  if (latestCost) {
    const snap = (latestCost.calculatorSnapshot ?? {}) as Record<string, unknown>
    const tax = (snap.taxBreakdown ?? snap.taxes ?? {}) as Record<string, number>
    latest = {
      id: latestCost.id,
      kind: latestCost.kind,
      amount: money(latestCost.amount),
      landedUnitCost: latestCost.landedUnitCost == null ? null : money(latestCost.landedUnitCost),
      currency: latestCost.currency || 'CNY',
      containerLotId: latestCost.containerLotId || '—',
      versionNo: latestCost.versionNo ?? 1,
      suggestPrice: snap.suggestPrice == null ? null : Number(snap.suggestPrice),
      targetMarginPct: snap.targetMarginPct == null ? null : Number(snap.targetMarginPct),
      purchase: Number(snap.purchase ?? snap.fobUnit ?? latestCost.amount ?? 0) || money(latestCost.amount),
      freight: Number(snap.freight ?? 0) || 0,
      customs: Number(snap.customs ?? 0) || 0,
      pal: Number(tax.pal ?? 0) || 0,
      cess: Number(tax.cess ?? 0) || 0,
      vat: Number(tax.vat ?? 0) || 0,
      sscl: Number(tax.sscl ?? 0) || 0,
    }
  }

  return {
    sku: variant.variant.skuCode || variant.variant.sku,
    variantId: variant.variant.id,
    title: variant.product.title || variant.variant.sku,
    currency: latest?.currency ?? 'CNY',
    versions,
    latest,
  }
}

/** 按平台粗览：订单营收聚合 + 最近结算单。 */
export async function getFinanceByPlatform(
  db: AppDatabase,
  organizationId: string,
  platformKey: string,
) {
  const key = platformKey.trim().toLowerCase()
  let shopRows = await db
    .select()
    .from(shops)
    .where(and(eq(shops.organizationId, organizationId), eq(shops.platform, key)))
  if (shopRows.length === 0) {
    const all = await db.select().from(shops).where(eq(shops.organizationId, organizationId))
    shopRows = all.filter(
      (s) =>
        s.platform.toLowerCase() === key ||
        s.name.toLowerCase().includes(key) ||
        (s.marketplaceCountry ?? '').toLowerCase() === key,
    )
    if (shopRows.length === 0) return null
  }
  const shopIds = shopRows.map((s) => s.id)
  const [orderSum] = await db
    .select({
      revenue: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`,
      orderCount: count(),
    })
    .from(orders)
    .where(and(eq(orders.organizationId, organizationId), inArray(orders.shopId, shopIds)))

  const settlementList = await listSettlements(db, organizationId, { page: 1, pageSize: 20 })
  const related = settlementList.items.filter(
    (s) => shopIds.includes(s.shopId) || s.platform.toLowerCase() === key,
  )
  const overview = await financeOverview(db, organizationId)
  const revenue = money(orderSum?.revenue)
  return {
    platform: shopRows[0]?.platform ?? key,
    platformKey: key,
    shopNames: shopRows.map((s) => s.name),
    revenue,
    cost: overview.cost,
    fees: overview.fees,
    profit: revenue - overview.cost - overview.fees,
    margin: revenue > 0 ? `${(((revenue - overview.cost - overview.fees) / revenue) * 100).toFixed(1)}%` : '—',
    orderCount: Number(orderSum?.orderCount ?? 0),
    settlements: related,
    disabled: false,
  }
}
