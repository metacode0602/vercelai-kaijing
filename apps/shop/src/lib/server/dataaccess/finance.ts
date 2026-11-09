/**
 * 财务结算 / 成本 / 利润 / 运费估算 dataaccess（模块13）。
 * 平台结算经 apps/api syncSettlementsForShop；费用/税费不写死，按行汇总或记 0。
 */
import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  commerceFreightRateCards,
  feeTemplates,
  feeTemplateVersions,
  integrationCredentials,
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
import { inferFeeKind } from '@workspace/marketplace'
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
import * as syncDa from '@/lib/server/dataaccess/sync'
import { marketplaceApiConfigured } from '@/lib/server/marketplace/api-client'

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
  source: 'fee_template' | 'ocean' | 'logistics_fee' | 'freight_rate_card'
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
  variantIds?: string[],
): Promise<Map<string, number>> {
  const filters: SQL[] = [eq(skuCosts.organizationId, organizationId)]
  if (variantIds && variantIds.length > 0) filters.push(inArray(skuCosts.variantId, variantIds))
  // 数据库级去重：每个 variant 只取最新一条成本版本
  const rows = await db
    .selectDistinctOn([skuCosts.variantId], {
      variantId: skuCosts.variantId,
      amount: skuCosts.amount,
      landed: skuCosts.landedUnitCost,
    })
    .from(skuCosts)
    .where(and(...filters))
    .orderBy(skuCosts.variantId, desc(skuCosts.createdAt))
  const map = new Map<string, number>()
  for (const row of rows) {
    map.set(row.variantId, money(row.landed ?? row.amount))
  }
  return map
}

async function feesByOrderId(
  db: AppDatabase,
  organizationId: string,
  orderIds?: string[],
): Promise<Map<string, { fees: FeeBreakdown; settled: boolean }>> {
  const scope: SQL[] = [eq(settlementLines.organizationId, organizationId)]
  if (orderIds) {
    if (orderIds.length === 0) return new Map()
    scope.push(inArray(settlementLines.orderId, orderIds))
  }
  const lines = await db
    .select({
      orderId: settlementLines.orderId,
      feeKind: settlementLines.feeKind,
      amount: settlementLines.amount,
    })
    .from(settlementLines)
    .where(and(...scope))

  const map = new Map<string, { fees: FeeBreakdown; settled: boolean }>()
  for (const line of lines) {
    if (!line.orderId) continue
    const cur = map.get(line.orderId) ?? { fees: emptyFees(), settled: true }
    const bucket = feeKindBucket(line.feeKind)
    if (bucket) cur.fees[bucket] += money(line.amount)
    cur.settled = true
    map.set(line.orderId, cur)
  }

  const logisticsScope: SQL[] = [eq(logisticsFeeDetails.organizationId, organizationId)]
  if (orderIds) logisticsScope.push(inArray(logisticsFeeDetails.orderId, orderIds))
  const logistics = await db
    .select({
      orderId: logisticsFeeDetails.orderId,
      amount: logisticsFeeDetails.amount,
    })
    .from(logisticsFeeDetails)
    .where(and(...logisticsScope))
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

  const orderIds = orderRows.map((o) => o.id)
  const lines =
    orderIds.length === 0
      ? []
      : await db
          .select()
          .from(orderLines)
          .where(and(eq(orderLines.organizationId, organizationId), inArray(orderLines.orderId, orderIds)))

  // 仅加载当前页涉及的 variant 成本与订单费用（数据库级分页，不全量拉取）
  const variantIds = [...new Set(lines.map((l) => l.variantId).filter((v): v is string => Boolean(v)))]
  const costMap = await latestCostByVariant(db, organizationId, variantIds)
  const feeMap = await feesByOrderId(db, organizationId, orderIds)

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
  const filters: SQL[] = [eq(orderLines.organizationId, organizationId)]
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(or(ilike(orderLines.sku, q), ilike(orderLines.sellerSku, q), ilike(orderLines.title, q))!)
  }
  const where = and(...filters)!

  // 数据库级分页：group by 在数据库完成，只取当前页
  const revenueExpr = sql<string>`coalesce(sum(${orderLines.paidPrice}), 0)`
  const aggSub = db
    .select({
      sku: orderLines.sku,
      variantId: orderLines.variantId,
      title: orderLines.title,
      qty: sql<number>`coalesce(sum(${orderLines.qty}), 0)`.as('qty_sum'),
      revenue: revenueExpr.as('revenue_sum'),
    })
    .from(orderLines)
    .where(where)
    .groupBy(orderLines.sku, orderLines.variantId, orderLines.title)
    .as('sku_profit_agg')

  const [totalRow] = await db.select({ value: count() }).from(aggSub)
  const slice = await db
    .select()
    .from(aggSub)
    .orderBy(desc(aggSub.revenue))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize)

  const variantIds = [...new Set(slice.map((r) => r.variantId).filter((v): v is string => Boolean(v)))]
  const costMap = await latestCostByVariant(db, organizationId, variantIds)

  // 当前页 SKU → 订单费用按收入占比分摊（不再恒 0）
  const skus = [...new Set(slice.map((r) => r.sku).filter((s): s is string => Boolean(s)))]
  const skuOrderPaid = new Map<string, Map<string, number>>()
  const orderIds = new Set<string>()
  if (skus.length > 0) {
    const lineRows = await db
      .select({ orderId: orderLines.orderId, sku: orderLines.sku, paid: orderLines.paidPrice })
      .from(orderLines)
      .where(and(eq(orderLines.organizationId, organizationId), inArray(orderLines.sku, skus)))
    for (const row of lineRows) {
      if (!row.orderId || !row.sku) continue
      orderIds.add(row.orderId)
      const perOrder = skuOrderPaid.get(row.sku) ?? new Map<string, number>()
      perOrder.set(row.orderId, (perOrder.get(row.orderId) ?? 0) + money(row.paid))
      skuOrderPaid.set(row.sku, perOrder)
    }
  }
  const orderIdList = [...orderIds]
  // 订单口径分母：该订单全部行 paidPrice 合计（保证各 SKU 分摊比例守恒）
  const orderPaidTotal = new Map<string, number>()
  const feeMap = await feesByOrderId(db, organizationId, orderIdList)
  if (orderIdList.length > 0) {
    const totals = await db
      .select({ orderId: orderLines.orderId, total: sql<string>`coalesce(sum(${orderLines.paidPrice}), 0)` })
      .from(orderLines)
      .where(and(eq(orderLines.organizationId, organizationId), inArray(orderLines.orderId, orderIdList)))
      .groupBy(orderLines.orderId)
    for (const row of totals) {
      if (row.orderId) orderPaidTotal.set(row.orderId, money(row.total))
    }
  }

  const items: ProfitDto[] = slice.map((row) => {
    const sku = row.sku || '—'
    const qty = Number(row.qty ?? 0)
    const unitCost = row.variantId ? costMap.get(row.variantId) ?? 0 : 0
    const cost = unitCost * qty
    const revenue = money(row.revenue)
    const breakdown = emptyFees()
    let hasFeeOrders = false
    let allSettled = true
    const perOrder = row.sku ? skuOrderPaid.get(row.sku) : undefined
    if (perOrder) {
      for (const [orderId, skuPaid] of perOrder) {
        const info = feeMap.get(orderId)
        if (!info) continue
        const denominator = orderPaidTotal.get(orderId) ?? 0
        if (denominator <= 0 || skuPaid <= 0) continue
        const share = Math.min(1, skuPaid / denominator)
        hasFeeOrders = true
        if (!info.settled) allSettled = false
        for (const key of Object.keys(info.fees) as Array<keyof FeeBreakdown>) {
          breakdown[key] += info.fees[key] * share
        }
      }
    }
    const fees = sumFeeBreakdown(breakdown)
    const refund = breakdown.refunds
    const profit = revenue - cost - fees
    const settled = hasFeeOrders && allSettled
    return {
      id: sku,
      dimension: row.title || sku,
      view: 'sku',
      revenue,
      cost,
      fees,
      refund,
      profit,
      margin: revenue > 0 ? `${((profit / revenue) * 100).toFixed(1)}%` : '—',
      fx: '订单币种混计',
      status: settled ? '已结算' : '未结算',
      breakdown,
      currency: 'MIX',
    }
  })
  return { items, total: Number(totalRow?.value ?? 0), page: input.page, pageSize: input.pageSize }
}

/** 利润口径 SQL 聚合：订单收入 +（行销量×最新成本）+ 结算/物流费用。供 overview / KPI 复用。 */
async function profitTotals(db: AppDatabase, organizationId: string) {
  const [orderSum] = await db
    .select({
      revenue: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`,
      orderCount: count(),
    })
    .from(orders)
    .where(eq(orders.organizationId, organizationId))

  // 成本：按 variant 汇总销量，再乘该 variant 最新成本版本（两端都在数据库聚合）
  const qtyByVariant = await db
    .select({
      variantId: orderLines.variantId,
      qty: sql<string>`coalesce(sum(${orderLines.qty}), 0)`,
    })
    .from(orderLines)
    .where(and(eq(orderLines.organizationId, organizationId), isNotNull(orderLines.variantId)))
    .groupBy(orderLines.variantId)
  const costMap = await latestCostByVariant(
    db,
    organizationId,
    qtyByVariant.map((r) => r.variantId).filter((v): v is string => v != null),
  )
  let cost = 0
  for (const row of qtyByVariant) {
    cost += money(row.qty) * (row.variantId ? costMap.get(row.variantId) ?? 0 : 0)
  }

  const [slSum] = await db
    .select({ v: sql<string>`coalesce(sum(${settlementLines.amount}), 0)` })
    .from(settlementLines)
    .where(eq(settlementLines.organizationId, organizationId))
  const [lfSum] = await db
    .select({ v: sql<string>`coalesce(sum(${logisticsFeeDetails.amount}), 0)` })
    .from(logisticsFeeDetails)
    .where(eq(logisticsFeeDetails.organizationId, organizationId))
  const fees = money(slSum?.v) + money(lfSum?.v)

  return {
    revenue: money(orderSum?.revenue),
    cost,
    fees,
    orderCount: Number(orderSum?.orderCount ?? 0),
  }
}

async function countUnsettledOrders(db: AppDatabase, organizationId: string): Promise<number> {
  const [row] = await db
    .select({ v: count() })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, organizationId),
        sql`not exists (select 1 from ${settlementLines} sl where sl.organization_id = ${organizationId} and sl.order_id = ${orders.id})`,
        sql`not exists (select 1 from ${logisticsFeeDetails} lf where lf.organization_id = ${organizationId} and lf.order_id = ${orders.id})`,
      ),
    )
  return Number(row?.v ?? 0)
}

async function countSkuProfitRows(db: AppDatabase, organizationId: string): Promise<number> {
  const groups = db
    .select({ k: sql<number>`1` })
    .from(orderLines)
    .where(eq(orderLines.organizationId, organizationId))
    .groupBy(orderLines.sku, orderLines.variantId, orderLines.title)
    .as('sku_group')
  const [row] = await db.select({ v: count() }).from(groups)
  return Number(row?.v ?? 0)
}

/** 未结算 SKU：其关联订单全部无结算/物流费用行（与列表「已结算」口径一致）。 */
async function countUnsettledSkus(db: AppDatabase, organizationId: string): Promise<number> {
  const [row] = await db
    .select({ v: count() })
    .from(
      db
        .select({ sku: orderLines.sku, variantId: orderLines.variantId, title: orderLines.title })
        .from(orderLines)
        .where(eq(orderLines.organizationId, organizationId))
        .groupBy(orderLines.sku, orderLines.variantId, orderLines.title)
        .having(
          sql`bool_and(
            not exists (select 1 from ${settlementLines} sl where sl.organization_id = ${organizationId} and sl.order_id = ${orderLines.orderId})
            and not exists (select 1 from ${logisticsFeeDetails} lf where lf.organization_id = ${organizationId} and lf.order_id = ${orderLines.orderId})
          )`,
        )
        .as('unsettled_sku_groups'),
    )
  return Number(row?.v ?? 0)
}

export async function financeOverview(db: AppDatabase, organizationId: string) {
  const totals = await profitTotals(db, organizationId)
  const settlement = await settlementStats(db, organizationId)

  return {
    revenue: totals.revenue,
    cost: totals.cost,
    fees: totals.fees,
    profit: totals.revenue - totals.cost - totals.fees,
    margin:
      totals.revenue > 0
        ? `${(((totals.revenue - totals.cost - totals.fees) / totals.revenue) * 100).toFixed(1)}%`
        : '—',
    settlementCount: settlement.total,
    payoutTotal: settlement.payoutTotal,
    orderCount: totals.orderCount,
  }
}

export async function listFreightEstimates(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string },
): Promise<PaginatedResult<FreightEstimateDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)

  // 三源（费用模板最优版本 / 海运柜次 / 运价卡）在数据库 UNION 后分页
  const ftBest = db
    .selectDistinctOn([feeTemplates.id], {
      id: feeTemplates.id,
      code: feeTemplates.code,
      name: feeTemplates.name,
      platform: feeTemplates.platform,
      country: feeTemplates.country,
      type: feeTemplates.type,
      status: feeTemplates.status,
      pool: sql<string>`coalesce(nullif(${feeTemplates.fulfillmentPool}, ''), '—')`.as('pool'),
      versionNo: feeTemplateVersions.versionNo,
      priority: feeTemplateVersions.priority,
      effectiveFrom: sql<string>`coalesce(to_char(${feeTemplateVersions.effectiveFrom}, 'YYYY-MM-DD'), '—')`.as('effective_from'),
      note: sql<string>`coalesce(nullif(${feeTemplates.note}, ''), coalesce(${feeTemplateVersions.note}, ''))`.as('note'),
      source: sql<string>`'fee_template'`.as('source'),
      amount: sql<string | null>`null::numeric`.as('amount'),
      currency: sql<string>`'—'`.as('currency'),
      sortAt: feeTemplates.updatedAt,
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
          eq(feeTemplates.type, 'ocean_freight'),
          ilike(feeTemplates.code, '%FREIGHT%'),
          ilike(feeTemplates.name, '%运费%'),
          ilike(feeTemplates.name, '%海运%'),
        )!,
      ),
    )
    .orderBy(feeTemplates.id, sql`${feeTemplateVersions.versionNo} desc nulls last`)
    .as('freight_ft_best')

  const ftPart = db
    .select({
      id: ftBest.id,
      code: ftBest.code,
      name: ftBest.name,
      platform: ftBest.platform,
      country: ftBest.country,
      type: ftBest.type,
      status: ftBest.status,
      pool: ftBest.pool,
      versionNo: ftBest.versionNo,
      priority: ftBest.priority,
      effectiveFrom: ftBest.effectiveFrom,
      note: ftBest.note,
      source: ftBest.source,
      amount: ftBest.amount,
      currency: ftBest.currency,
      sortAt: ftBest.sortAt,
    })
    .from(ftBest)

  const oceanPart = db
    .select({
      id: oceanShipments.id,
      code: oceanShipments.lotCode,
      name: sql<string>`'海运柜次 ' || ${oceanShipments.lotCode}`.as('name'),
      platform: sql<string>`coalesce(nullif(${oceanShipments.platform}, ''), 'ocean')`.as('platform'),
      country: sql<string>`coalesce(nullif(${oceanShipments.destPort}, ''), '—')`.as('country'),
      type: sql<string>`coalesce(nullif(${oceanShipments.freightMode}, ''), 'ocean')`.as('type'),
      status: oceanShipments.status,
      pool: sql<string>`coalesce(nullif(${oceanShipments.originPort}, ''), nullif(${oceanShipments.destPort}, ''), '—')`.as('pool'),
      versionNo: sql<number | null>`null::integer`.as('version_no'),
      priority: sql<number | null>`null::integer`.as('priority'),
      effectiveFrom: sql<string>`coalesce(${oceanShipments.etd}, '—')`.as('effective_from'),
      note: sql<string>`coalesce(${oceanShipments.notes}, '')`.as('note'),
      source: sql<string>`'ocean'`.as('source'),
      amount: sql<string | null>`case
        when ${oceanShipments.packingDetails}->>'freightAmount' is not null then (${oceanShipments.packingDetails}->>'freightAmount')::numeric
        when ${oceanShipments.packingDetails}->>'totalFreight' is not null then (${oceanShipments.packingDetails}->>'totalFreight')::numeric
        when ${oceanShipments.packingDetails}->>'amount' is not null then (${oceanShipments.packingDetails}->>'amount')::numeric
        end`.as('amount'),
      currency: sql<string>`coalesce(${oceanShipments.packingDetails}->>'currency', 'USD')`.as('currency'),
      sortAt: oceanShipments.updatedAt,
    })
    .from(oceanShipments)
    .where(eq(oceanShipments.organizationId, organizationId))

  const cardPart = db
    .select({
      id: commerceFreightRateCards.id,
      code: commerceFreightRateCards.code,
      name: commerceFreightRateCards.name,
      platform: sql<string>`'freight_rate_card'`.as('platform'),
      country: sql<string>`coalesce(nullif(${commerceFreightRateCards.destPort}, ''), '—')`.as('country'),
      type: commerceFreightRateCards.freightMode,
      status: commerceFreightRateCards.status,
      pool: sql<string>`case
        when ${commerceFreightRateCards.originPort} is not null and ${commerceFreightRateCards.originPort} <> ''
          and ${commerceFreightRateCards.destPort} is not null and ${commerceFreightRateCards.destPort} <> ''
          then ${commerceFreightRateCards.originPort} || '→' || ${commerceFreightRateCards.destPort}
        when ${commerceFreightRateCards.originPort} is not null and ${commerceFreightRateCards.originPort} <> ''
          then ${commerceFreightRateCards.originPort}
        when ${commerceFreightRateCards.destPort} is not null and ${commerceFreightRateCards.destPort} <> ''
          then ${commerceFreightRateCards.destPort}
        else '—' end`.as('pool'),
      versionNo: sql<number | null>`null::integer`.as('version_no'),
      priority: sql<number | null>`null::integer`.as('priority'),
      effectiveFrom: commerceFreightRateCards.effectiveFrom,
      note: sql<string>`coalesce(${commerceFreightRateCards.note}, '')`.as('note'),
      source: sql<string>`'freight_rate_card'`.as('source'),
      amount: sql<string | null>`${commerceFreightRateCards.unitRate}`.as('amount'),
      currency: sql<string>`coalesce(${commerceFreightRateCards.currency}, 'USD')`.as('currency'),
      sortAt: commerceFreightRateCards.updatedAt,
    })
    .from(commerceFreightRateCards)
    .where(eq(commerceFreightRateCards.organizationId, organizationId))

  // 注意：以 oceanPart 为 union 起点——ftPart 部分字段来自子查询 SQL 别名（类型 never），
  // never 可赋给 string，反向不成立，故 never 字段的模板必须放在接收端之后。
  const merged = oceanPart.unionAll(cardPart).unionAll(ftPart).as('freight_merged')

  const filters: SQL[] = []
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(merged.code, q),
        ilike(merged.name, q),
        ilike(merged.platform, q),
        ilike(merged.type, q),
      )!,
    )
  }
  const where = filters.length > 0 ? and(...filters) : undefined

  const [totalRow] = await db.select({ value: count() }).from(merged).where(where)
  const rows = await db
    .select()
    .from(merged)
    .where(where)
    .orderBy(desc(merged.sortAt), merged.code)
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    items: rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      platform: row.platform,
      country: row.country,
      type: row.type,
      status: row.status,
      pool: row.pool,
      versionNo: row.versionNo,
      priority: row.priority,
      effectiveFrom: row.effectiveFrom,
      note: row.note ?? '',
      source: row.source as FreightEstimateDto['source'],
      amount: row.amount == null ? null : money(row.amount),
      currency: row.currency,
    })),
    total: Number(totalRow?.value ?? 0),
    page,
    pageSize,
  }
}

export async function getFreightEstimate(
  db: AppDatabase,
  organizationId: string,
  id: string,
): Promise<FreightEstimateDto | null> {
  // 按 id / code 定点查询三源，避免翻页遗漏
  const [card] = await db
    .select()
    .from(commerceFreightRateCards)
    .where(
      and(
        eq(commerceFreightRateCards.organizationId, organizationId),
        or(eq(commerceFreightRateCards.id, id), eq(commerceFreightRateCards.code, id))!,
      ),
    )
    .limit(1)
  if (card) {
    return {
      id: card.id,
      code: card.code,
      name: card.name,
      platform: 'freight_rate_card',
      country: card.destPort || '—',
      type: card.freightMode,
      status: card.status,
      pool: [card.originPort, card.destPort].filter(Boolean).join('→') || '—',
      versionNo: null,
      priority: null,
      effectiveFrom: card.effectiveFrom,
      note: card.note || '',
      source: 'freight_rate_card',
      amount: money(card.unitRate),
      currency: card.currency || 'USD',
    }
  }
  const [ocean] = await db
    .select()
    .from(oceanShipments)
    .where(
      and(
        eq(oceanShipments.organizationId, organizationId),
        or(eq(oceanShipments.id, id), eq(oceanShipments.lotCode, id))!,
      ),
    )
    .limit(1)
  if (ocean) {
    const packing = (ocean.packingDetails ?? {}) as Record<string, unknown>
    const amountRaw = packing.freightAmount ?? packing.totalFreight ?? packing.amount
    return {
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
    }
  }
  const [template] = await db
    .select({ template: feeTemplates, version: feeTemplateVersions })
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
        or(eq(feeTemplates.id, id), eq(feeTemplates.code, id))!,
      ),
    )
    .orderBy(desc(feeTemplateVersions.versionNo))
    .limit(1)
  if (!template) return null
  const { template: t, version: v } = template
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    platform: t.platform,
    country: t.country,
    type: t.type,
    status: t.status,
    pool: t.fulfillmentPool || '—',
    versionNo: v?.versionNo ?? null,
    priority: v?.priority ?? null,
    effectiveFrom: formatDateOnly(v?.effectiveFrom),
    note: t.note || v?.note || '',
    source: 'fee_template',
    amount: null,
    currency: '—',
  }
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


export type SettlementImportLineInput = {
  externalTransactionId?: string
  externalOrderNo?: string
  transactionType?: string
  feeKind?: string
  feeType?: string
  feeName?: string
  amount?: number
  taxAmount?: number
  whtAmount?: number
  whtIncludedInAmount?: boolean
  currency?: string
  paidStatus?: string
  paymentReference?: string
  sellerSku?: string
  platformSkuId?: string
  shippingProvider?: string
  shippingSpeed?: string
  shipmentType?: string
  note?: string
}

export type SettlementImportInput = {
  shopId: string
  externalSettlementId: string
  currency?: string
  periodStart?: string
  periodEnd?: string
  billAmount?: number
  itemRevenue?: number
  otherRevenueTotal?: number
  subtotal1?: number
  subtotal2?: number
  refundsAmount?: number
  feesOnRefundsTotal?: number
  shipmentFee?: number
  shipmentFeeCredit?: number
  feesTotal?: number
  guaranteeDeposit?: number
  openingBalance?: number
  closingBalance?: number
  payoutAmount?: number
  payoutStatus?: string
  paid?: boolean
  platformCreatedAt?: string
  platformUpdatedAt?: string
  status?: string
  note?: string
  lines?: SettlementImportLineInput[]
}

function parseImportDate(value?: string): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Excel / 粘贴导入结算批次（本地 ERP，非平台 OpenAPI）。仅覆盖本次提供的字段，不清空平台同步值。 */
export async function importSettlements(
  db: AppDatabase,
  organizationId: string,
  input: { rows: SettlementImportInput[] },
): Promise<{ total: number; success: number; failed: number; errors: Array<{ index: number; message: string }>; ids: string[] }> {
  if (!input.rows.length) throw new Error('没有可导入的结算行')
  let success = 0
  const errors: Array<{ index: number; message: string }> = []
  const ids: string[] = []
  const lineValues: Array<typeof settlementLines.$inferInsert> = []
  const seenLineKeys = new Set<string>()
  for (let i = 0; i < input.rows.length; i += 1) {
    const row = input.rows[i]!
    try {
      if (!row.shopId?.trim()) throw new Error('缺少 shopId')
      if (!row.externalSettlementId?.trim()) throw new Error('缺少 externalSettlementId')
      const [shop] = await db
        .select()
        .from(shops)
        .where(and(eq(shops.organizationId, organizationId), eq(shops.id, row.shopId.trim())))
        .limit(1)
      if (!shop) throw new Error(`店铺不存在：${row.shopId}`)
      const extId = row.externalSettlementId.trim()
      const [existing] = await db
        .select()
        .from(settlements)
        .where(and(eq(settlements.organizationId, organizationId), eq(settlements.shopId, shop.id), eq(settlements.externalSettlementId, extId)))
        .limit(1)
      const prevRaw = (existing?.raw as Record<string, unknown> | undefined) ?? {}
      const dbStatus = row.status
        ? toDbSettlementStatus(row.status) || 'pending'
        : row.paid === true
          ? 'paid'
          : (existing?.status ?? 'pending')
      const payoutStatus =
        row.payoutStatus ?? (row.paid != null ? (row.paid ? 'paid' : 'unpaid') : existing?.payoutStatus ?? null)
      const mergeNum = (next?: number, prev?: string | null) =>
        next != null ? String(next) : (prev ?? null)
      const values = {
        organizationId,
        shopId: shop.id,
        externalSettlementId: extId,
        periodStart: row.periodStart ? parseImportDate(row.periodStart) : existing?.periodStart ?? null,
        periodEnd: row.periodEnd ? parseImportDate(row.periodEnd) : existing?.periodEnd ?? null,
        currency: (row.currency ?? existing?.currency ?? 'USD').toUpperCase(),
        billAmount: mergeNum(row.billAmount, existing?.billAmount),
        itemRevenue: mergeNum(row.itemRevenue, existing?.itemRevenue),
        otherRevenueTotal: mergeNum(row.otherRevenueTotal, existing?.otherRevenueTotal),
        subtotal1: mergeNum(row.subtotal1, existing?.subtotal1),
        subtotal2: mergeNum(row.subtotal2, existing?.subtotal2),
        refundsAmount: mergeNum(row.refundsAmount, existing?.refundsAmount),
        feesOnRefundsTotal: mergeNum(row.feesOnRefundsTotal, existing?.feesOnRefundsTotal),
        shipmentFee: mergeNum(row.shipmentFee, existing?.shipmentFee),
        shipmentFeeCredit: mergeNum(row.shipmentFeeCredit, existing?.shipmentFeeCredit),
        feesTotal: mergeNum(row.feesTotal, existing?.feesTotal),
        guaranteeDeposit: mergeNum(row.guaranteeDeposit, existing?.guaranteeDeposit),
        openingBalance: mergeNum(row.openingBalance, existing?.openingBalance),
        closingBalance: mergeNum(row.closingBalance, existing?.closingBalance),
        payoutAmount: mergeNum(row.payoutAmount, existing?.payoutAmount),
        payoutStatus,
        paidAt:
          row.paid === true
            ? parseImportDate(row.platformUpdatedAt) ?? existing?.paidAt ?? new Date()
            : row.paid === false
              ? null
              : existing?.paidAt ?? null,
        platformCreatedAt: row.platformCreatedAt
          ? parseImportDate(row.platformCreatedAt)
          : existing?.platformCreatedAt ?? null,
        platformUpdatedAt: row.platformUpdatedAt
          ? parseImportDate(row.platformUpdatedAt)
          : existing?.platformUpdatedAt ?? null,
        status: dbStatus,
        raw: {
          ...prevRaw,
          source: 'excel_import',
          ...(row.note ? { importNote: row.note } : {}),
        },
      }
      const settlementId = existing?.id ?? createId()
      if (existing) {
        await db.update(settlements).set(values).where(eq(settlements.id, existing.id))
      } else {
        await db.insert(settlements).values({ id: settlementId, ...values, createdAt: new Date() })
      }
      ids.push(settlementId)
      for (const line of row.lines ?? []) {
        const externalTransactionId = line.externalTransactionId?.trim() || `imp-${createId()}`
        const key = `${settlementId}:${externalTransactionId}`
        if (seenLineKeys.has(key)) continue
        seenLineKeys.add(key)
        lineValues.push({
          id: createId(),
          settlementId,
          organizationId,
          feeKind: line.feeKind || inferFeeKind(line.feeType, line.feeName, line.transactionType),
          feeType: line.feeType || line.feeName || 'import',
          feeName: line.feeName || line.feeType || '导入费用',
          transactionType: line.transactionType || null,
          externalTransactionId,
          externalOrderNo: line.externalOrderNo || null,
          amount: line.amount != null ? String(line.amount) : '0',
          taxAmount: line.taxAmount != null ? String(line.taxAmount) : null,
          whtAmount: line.whtAmount != null ? String(line.whtAmount) : null,
          whtIncludedInAmount: Boolean(line.whtIncludedInAmount),
          currency: (line.currency || row.currency || 'USD').toUpperCase(),
          paidStatus: line.paidStatus || null,
          paymentReference: line.paymentReference || null,
          sellerSku: line.sellerSku || null,
          platformSkuId: line.platformSkuId || null,
          shippingProvider: line.shippingProvider || null,
          shippingSpeed: line.shippingSpeed || null,
          shipmentType: line.shipmentType || null,
          note: line.note || null,
        })
      }
      success += 1
    } catch (error) {
      errors.push({ index: i + 1, message: error instanceof Error ? error.message : '导入失败' })
    }
  }
  if (lineValues.length) {
    await db
      .insert(settlementLines)
      .values(lineValues)
      .onConflictDoUpdate({
        target: [settlementLines.settlementId, settlementLines.externalTransactionId],
        set: {
          feeKind: sql`excluded.fee_kind`,
          feeType: sql`excluded.fee_type`,
          feeName: sql`excluded.fee_name`,
          transactionType: sql`excluded.transaction_type`,
          externalOrderNo: sql`excluded.external_order_no`,
          amount: sql`excluded.amount`,
          taxAmount: sql`excluded.tax_amount`,
          whtAmount: sql`excluded.wht_amount`,
          whtIncludedInAmount: sql`excluded.wht_included_in_amount`,
          currency: sql`excluded.currency`,
          paidStatus: sql`excluded.paid_status`,
          paymentReference: sql`excluded.payment_reference`,
          sellerSku: sql`excluded.seller_sku`,
          platformSkuId: sql`excluded.platform_sku_id`,
          shippingProvider: sql`excluded.shipping_provider`,
          shippingSpeed: sql`excluded.shipping_speed`,
          shipmentType: sql`excluded.shipment_type`,
          note: sql`excluded.note`,
        },
      })
  }
  return { total: input.rows.length, success, failed: errors.length, errors: errors.slice(0, 20), ids }
}

export type ProfitDetailDto = ProfitDto & {
  feeLines: Array<{
    id: string
    source: 'settlement_line' | 'logistics_fee'
    settlementId: string
    feeKind: string
    feeType: string
    amount: number
    currency: string
    order: string
    note: string
  }>
}

export async function getProfit(
  db: AppDatabase,
  organizationId: string,
  input: { id: string; view?: 'order' | 'sku' },
): Promise<ProfitDetailDto | null> {
  const view = input.view ?? (input.id.startsWith('SKU:') || input.id.includes('/') ? 'sku' : 'order')
  const list = await listProfits(db, organizationId, { page: 1, pageSize: 200, view, q: input.id })
  const row = list.items.find((i) => i.id === input.id || i.dimension === input.id) ?? list.items[0]
  if (!row) return null

  const feeLines: ProfitDetailDto['feeLines'] = []
  if (view === 'order') {
    const orderId = row.id
    const sLines = await db
      .select()
      .from(settlementLines)
      .where(and(eq(settlementLines.organizationId, organizationId), eq(settlementLines.orderId, orderId)))
    for (const l of sLines) {
      feeLines.push({
        id: l.id,
        source: 'settlement_line',
        settlementId: l.settlementId,
        feeKind: l.feeKind || '—',
        feeType: l.feeType || l.feeName || '—',
        amount: money(l.amount),
        currency: l.currency || row.currency,
        order: l.externalOrderNo || orderId,
        note: l.note || '',
      })
    }
    const logistics = await db
      .select()
      .from(logisticsFeeDetails)
      .where(and(eq(logisticsFeeDetails.organizationId, organizationId), eq(logisticsFeeDetails.orderId, orderId)))
    for (const l of logistics) {
      feeLines.push({
        id: l.id,
        source: 'logistics_fee',
        settlementId: l.settlementId || '',
        feeKind: 'logistics',
        feeType: l.feeCode || l.feeName || '物流费',
        amount: money(l.amount),
        currency: l.currency || row.currency,
        order: l.externalOrderId || orderId,
        note: '',
      })
    }
  }
  return { ...row, feeLines }
}

export async function profitKpis(db: AppDatabase, organizationId: string, view: 'order' | 'sku' = 'order') {
  // 数据库级聚合，不拉全量行派生
  const totals = await profitTotals(db, organizationId)
  const revenue = view === 'order' ? totals.revenue : money(await sumLineRevenue(db, organizationId))
  const cost = totals.cost
  const fees = totals.fees
  const profit = revenue - cost - fees
  const rows = view === 'order' ? totals.orderCount : await countSkuProfitRows(db, organizationId)
  const unsettled =
    view === 'order'
      ? await countUnsettledOrders(db, organizationId)
      : await countUnsettledSkus(db, organizationId)
  return {
    revenue,
    cost,
    fees,
    profit,
    margin: revenue > 0 ? `${((profit / revenue) * 100).toFixed(1)}%` : '—',
    rows,
    unsettled,
  }
}

async function sumLineRevenue(db: AppDatabase, organizationId: string): Promise<number> {
  const [row] = await db
    .select({ v: sql<string>`coalesce(sum(${orderLines.paidPrice}), 0)` })
    .from(orderLines)
    .where(eq(orderLines.organizationId, organizationId))
  return money(row?.v)
}

const LAZOP_PLATFORMS = new Set(['daraz', 'lazada'])

export type SettlementSyncCapability = {
  marketplaceApiConfigured: boolean
  lazopShopCount: number
  credentialedLazopShopCount: number
  canSync: boolean
  disableReason: string | null
  shops: Array<{ id: string; name: string; platform: string; hasCredential: boolean }>
}

/** 控制台「从平台拉取」是否可真实调用 apps/api 结算同步。 */
export async function settlementSyncCapability(
  db: AppDatabase,
  organizationId: string,
): Promise<SettlementSyncCapability> {
  const apiOk = marketplaceApiConfigured()
  const shopRows = await db
    .select({
      id: shops.id,
      name: shops.name,
      platform: shops.platform,
    })
    .from(shops)
    .where(and(eq(shops.organizationId, organizationId), isNull(shops.deletedAt)))
  const lazop = shopRows.filter((s) => LAZOP_PLATFORMS.has(String(s.platform || '').toLowerCase()))
  const lazopIds = lazop.map((s) => s.id)
  const credRows =
    lazopIds.length === 0
      ? []
      : await db
          .select({ shopId: integrationCredentials.shopId })
          .from(integrationCredentials)
          .where(
            and(
              eq(integrationCredentials.organizationId, organizationId),
              inArray(integrationCredentials.shopId, lazopIds),
            ),
          )
  const credSet = new Set(credRows.map((r) => r.shopId))
  const shopsOut = lazop.map((s) => ({
    id: s.id,
    name: s.name,
    platform: s.platform,
    hasCredential: credSet.has(s.id),
  }))
  const credentialed = shopsOut.filter((s) => s.hasCredential).length
  let disableReason: string | null = null
  if (!apiOk) {
    disableReason =
      '未配置 MARKETPLACE_API_BASE_URL / INTERNAL_SYNC_API_KEY，无法调用 apps/api 结算同步。'
  } else if (lazop.length === 0) {
    disableReason =
      '组织内没有 Daraz/Lazada 店铺。结算平台同步仅支持 Lazop（listSettlements）；TikTok/Shopee 等暂无适配器，请用 CSV/JSON 导入，禁止假成功。'
  } else if (credentialed === 0) {
    disableReason = 'Daraz/Lazada 店铺尚未授权（缺少 integration_credentials），无法拉取结算。'
  }
  return {
    marketplaceApiConfigured: apiOk,
    lazopShopCount: lazop.length,
    credentialedLazopShopCount: credentialed,
    canSync: Boolean(apiOk && credentialed > 0),
    disableReason,
    shops: shopsOut,
  }
}

/**
 * 触发平台结算同步：入队 sync_tasks（结算同步）并 wait 调用 apps/api → syncSettlementsForShop。
 * 无凭证 / 未配置 API / 非 Lazop 时诚实失败，禁止假成功。
 */
export async function syncSettlementsFromPlatform(
  db: AppDatabase,
  organizationId: string,
  input: { shopId?: string } = {},
) {
  const capability = await settlementSyncCapability(db, organizationId)
  if (!capability.canSync) {
    throw new Error(capability.disableReason || '无法从平台拉取结算')
  }

  let shopId = input.shopId?.trim() || undefined
  if (shopId) {
    const shop = capability.shops.find((s) => s.id === shopId)
    if (!shop) {
      throw new Error('所选店铺不是本组织下的 Daraz/Lazada 店铺')
    }
    if (!shop.hasCredential) {
      throw new Error(`店铺「${shop.name}」尚未授权，无法拉取结算`)
    }
  }

  const task = await syncDa.enqueueOrRetrySyncTask(db, organizationId, {
    type: '结算同步',
    target: shopId ? `shop:${shopId}` : 'lazop-shops',
    shopId,
    actor: 'console',
    note: '结算拉取：apps/api → syncSettlementsForShop（Lazop finance OpenAPI）',
  })

  return {
    ok: task.status === '成功',
    syncTaskId: task.id,
    taskNo: task.taskNo,
    status: task.status,
    note:
      task.status === '成功'
        ? `结算同步完成（task=${task.taskNo}）`
        : task.error !== '—'
          ? task.error
          : '结算同步失败',
  }
}

