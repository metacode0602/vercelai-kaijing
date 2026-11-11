/**
 * Dashboard KPI / 趋势（模块13）。
 * 从 orders / inventory_balances / purchase / reverse / sync 聚合；缺省为 0，不用固定 mock 销售额。
 * 金额按订单币种展示，跨币种不合计；毛利/净利与 finance.overview 同一公式，并受同一筛选窗口约束。
 */
import { and, count, eq, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import {
  inventoryBalances,
  inventoryMovements,
  mappingExceptions,
  orderLines,
  orders,
  organization,
  pendingActions,
  productVariants,
  products,
  purchaseRequests,
  reverseOrders,
  sellerSkuMappings,
  shops,
  skuCosts,
  syncTasks,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { money } from '@/lib/server/mappers/finance'
import { toUiSyncStatus } from '@/lib/server/mappers/sync'
import { balanceStats } from '@/lib/server/dataaccess/wms'
import { orderExceptionStats } from '@/lib/server/dataaccess/order-exceptions'
import { feesByOrderId, latestCostByVariant } from '@/lib/server/dataaccess/finance'
import {
  addDays,
  currencyModeOf,
  dateKey,
  isDemoOrganization,
  normalizeFilterToken,
  profitFromComponents,
  resolveDashboardWindow,
  startOfLocalDay,
  REFUND_PENDING_FULFILLMENT_STATUSES,
  REFUND_PENDING_PLATFORM_STATUSES,
  type DashboardFilterInput,
  type DashboardTrendRange,
  type DashboardWindow,
} from '@/lib/console/dashboard-query'

export type { DashboardTrendRange, DashboardFilterInput }

export type DashboardCurrencyTotals = {
  currency: string
  revenue: number
  orders: number
  units: number
  aov: number
  cost: number
  fees: number
  grossProfit: number
  netProfit: number
  grossMargin: number | null
  netMargin: number | null
}

export type DashboardKpiDto = {
  range: DashboardTrendRange
  dateFrom: string
  dateTo: string
  dayCount: number
  revenue: number | null
  orders: number
  units: number
  aov: number | null
  prevRevenue: number | null
  prevOrders: number
  prevUnits: number
  prevAov: number | null
  currency: string | null
  currencyMode: 'single' | 'mixed' | 'empty'
  currencies: string[]
  cost: number | null
  fees: number | null
  grossProfit: number | null
  netProfit: number | null
  grossMargin: number | null
  netMargin: number | null
  prevGrossProfit: number | null
  prevNetProfit: number | null
  byCurrency: DashboardCurrencyTotals[]
}

export type DashboardTrendPoint = {
  date: string
  revenue: number | null
  orders: number
  units: number
  aov: number | null
  grossProfit: number | null
  netProfit: number | null
  grossMargin: number | null
  netMargin: number | null
  refundRate: number
  currency: string | null
  currencyMode: 'single' | 'mixed' | 'empty'
}

export type DashboardTodoDto = {
  readyToShip: number
  lowStock: number
  pendingPurchase: number
  refundPending: number
  mappingAbnormal: number
  syncFail: number
}

type OrderAggRow = {
  id: string
  placedAt: Date | null
  totalAmount: string | number | null
  currency: string
  isCancelPending: boolean | null
  shopId: string
  platform: string | null
  site: string | null
}

type LineAggRow = {
  orderId: string
  qty: number | null
  variantId: string | null
}

function orderConditions(
  organizationId: string,
  input: DashboardFilterInput,
  from: Date,
  to: Date,
): SQL[] {
  const conditions: SQL[] = [
    eq(orders.organizationId, organizationId),
    gte(orders.placedAt, from),
    lt(orders.placedAt, to),
  ]
  const shopId = normalizeFilterToken(input.shopId)
  const platform = normalizeFilterToken(input.platform)
  const site = normalizeFilterToken(input.site)
  if (shopId) conditions.push(eq(orders.shopId, shopId))
  if (platform) conditions.push(eq(shops.platform, platform))
  if (site) {
    conditions.push(or(eq(shops.marketplaceCountry, site), eq(shops.region, site))!)
  }
  return conditions
}

async function loadFilteredOrders(
  db: AppDatabase,
  organizationId: string,
  input: DashboardFilterInput,
  from: Date,
  to: Date,
): Promise<{ orders: OrderAggRow[]; lines: LineAggRow[] }> {
  const orderRows = await db
    .select({
      id: orders.id,
      placedAt: orders.placedAt,
      totalAmount: orders.totalAmount,
      currency: orders.currency,
      isCancelPending: orders.isCancelPending,
      shopId: orders.shopId,
      platform: shops.platform,
      site: sql<string>`coalesce(${shops.marketplaceCountry}, ${shops.region}, '')`,
    })
    .from(orders)
    .innerJoin(shops, eq(orders.shopId, shops.id))
    .where(and(...orderConditions(organizationId, input, from, to)))

  const ids = orderRows.map((o) => o.id)
  const lineRows =
    ids.length === 0
      ? []
      : await db
          .select({
            orderId: orderLines.orderId,
            qty: orderLines.qty,
            variantId: orderLines.variantId,
          })
          .from(orderLines)
          .where(and(eq(orderLines.organizationId, organizationId), inArray(orderLines.orderId, ids)))

  return { orders: orderRows, lines: lineRows }
}

async function profitMaps(
  db: AppDatabase,
  organizationId: string,
  lines: LineAggRow[],
  orderIds: string[],
) {
  const variantIds = [...new Set(lines.map((l) => l.variantId).filter((v): v is string => Boolean(v)))]
  const costMap =
    variantIds.length > 0 ? await latestCostByVariant(db, organizationId, variantIds) : new Map<string, number>()
  const feeMap = await feesByOrderId(db, organizationId, orderIds)
  return { costMap, feeMap }
}

function lineCost(
  lines: LineAggRow[],
  orderId: string,
  costMap: Map<string, number>,
): number {
  let cost = 0
  for (const line of lines) {
    if (line.orderId !== orderId) continue
    const qty = line.qty ?? 0
    const unit = line.variantId ? costMap.get(line.variantId) ?? 0 : 0
    cost += qty * unit
  }
  return cost
}

function feeTotal(
  feeMap: Map<string, { fees: Record<string, number>; settled: boolean }>,
  orderId: string,
): number {
  const entry = feeMap.get(orderId)
  if (!entry) return 0
  return Object.values(entry.fees).reduce((sum, n) => sum + n, 0)
}

function emptyCurrencyTotals(currency: string): DashboardCurrencyTotals {
  return {
    currency,
    revenue: 0,
    orders: 0,
    units: 0,
    aov: 0,
    cost: 0,
    fees: 0,
    grossProfit: 0,
    netProfit: 0,
    grossMargin: null,
    netMargin: null,
  }
}

function finalizeCurrencyTotals(row: DashboardCurrencyTotals): DashboardCurrencyTotals {
  const profit = profitFromComponents(row.revenue, row.cost, row.fees)
  row.aov = row.orders > 0 ? Math.round(row.revenue / row.orders) : 0
  row.grossProfit = profit.grossProfit
  row.netProfit = profit.netProfit
  row.grossMargin = profit.grossMargin
  row.netMargin = profit.netMargin
  return row
}

function aggregateByCurrency(
  orderRows: OrderAggRow[],
  lines: LineAggRow[],
  costMap: Map<string, number>,
  feeMap: Map<string, { fees: Record<string, number>; settled: boolean }>,
): DashboardCurrencyTotals[] {
  const unitsByOrder = new Map<string, number>()
  for (const line of lines) {
    unitsByOrder.set(line.orderId, (unitsByOrder.get(line.orderId) ?? 0) + (line.qty ?? 0))
  }
  const buckets = new Map<string, DashboardCurrencyTotals>()
  for (const order of orderRows) {
    const currency = (order.currency || '').trim().toUpperCase() || 'UNK'
    const bucket = buckets.get(currency) ?? emptyCurrencyTotals(currency)
    bucket.revenue += money(order.totalAmount)
    bucket.orders += 1
    bucket.units += unitsByOrder.get(order.id) ?? 0
    bucket.cost += lineCost(lines, order.id, costMap)
    bucket.fees += feeTotal(feeMap, order.id)
    buckets.set(currency, bucket)
  }
  return [...buckets.values()].map(finalizeCurrencyTotals).sort((a, b) => a.currency.localeCompare(b.currency))
}

function kpiFromTotals(
  window: DashboardWindow,
  current: DashboardCurrencyTotals[],
  previous: DashboardCurrencyTotals[],
  currentOrderCount: number,
  currentUnits: number,
  prevOrderCount: number,
  prevUnits: number,
): DashboardKpiDto {
  const mode = currencyModeOf(current.map((r) => r.currency))
  const prevMode = currencyModeOf(previous.map((r) => r.currency))
  const single = mode.currencyMode === 'single' ? current[0] : null
  const prevSingle =
    prevMode.currencyMode === 'single' && prevMode.currency === mode.currency ? previous[0] : null

  return {
    range: window.range,
    dateFrom: window.dateFrom,
    dateTo: window.dateTo,
    dayCount: window.dayCount,
    revenue: single ? single.revenue : null,
    orders: currentOrderCount,
    units: currentUnits,
    aov: single ? single.aov : null,
    prevRevenue: prevSingle ? prevSingle.revenue : null,
    prevOrders: prevOrderCount,
    prevUnits: prevUnits,
    prevAov: prevSingle ? prevSingle.aov : null,
    currency: mode.currency,
    currencyMode: mode.currencyMode,
    currencies: mode.currencies,
    cost: single ? single.cost : null,
    fees: single ? single.fees : null,
    grossProfit: single ? single.grossProfit : null,
    netProfit: single ? single.netProfit : null,
    grossMargin: single ? single.grossMargin : null,
    netMargin: single ? single.netMargin : null,
    prevGrossProfit: prevSingle ? prevSingle.grossProfit : null,
    prevNetProfit: prevSingle ? prevSingle.netProfit : null,
    byCurrency: current,
  }
}

export async function getDashboardKpis(
  db: AppDatabase,
  organizationId: string,
  input: DashboardFilterInput = {},
): Promise<DashboardKpiDto> {
  const window = resolveDashboardWindow(input)
  const dayCount = window.dayCount
  const prevTo = window.from
  const prevFrom = addDays(prevTo, -dayCount)

  const current = await loadFilteredOrders(db, organizationId, input, window.from, window.to)
  const previous = await loadFilteredOrders(db, organizationId, input, prevFrom, prevTo)

  const currentMaps = await profitMaps(
    db,
    organizationId,
    current.lines,
    current.orders.map((o) => o.id),
  )
  const prevMaps = await profitMaps(
    db,
    organizationId,
    previous.lines,
    previous.orders.map((o) => o.id),
  )

  const currentTotals = aggregateByCurrency(current.orders, current.lines, currentMaps.costMap, currentMaps.feeMap)
  const prevTotals = aggregateByCurrency(previous.orders, previous.lines, prevMaps.costMap, prevMaps.feeMap)

  const currentUnits = current.lines.reduce((s, l) => s + (l.qty ?? 0), 0)
  const prevUnits = previous.lines.reduce((s, l) => s + (l.qty ?? 0), 0)

  return kpiFromTotals(
    window,
    currentTotals,
    prevTotals,
    current.orders.length,
    currentUnits,
    previous.orders.length,
    prevUnits,
  )
}

export async function getDashboardTrends(
  db: AppDatabase,
  organizationId: string,
  input: DashboardFilterInput = {},
): Promise<DashboardTrendPoint[]> {
  const window = resolveDashboardWindow(input)
  const loaded = await loadFilteredOrders(db, organizationId, input, window.from, window.to)
  const maps = await profitMaps(
    db,
    organizationId,
    loaded.lines,
    loaded.orders.map((o) => o.id),
  )
  const overallMode = currencyModeOf(loaded.orders.map((o) => o.currency))

  const unitsByOrder = new Map<string, number>()
  for (const line of loaded.lines) {
    unitsByOrder.set(line.orderId, (unitsByOrder.get(line.orderId) ?? 0) + (line.qty ?? 0))
  }

  type DayBucket = {
    revenue: number
    orders: number
    units: number
    cost: number
    fees: number
    cancels: number
    currencies: Set<string>
  }
  const buckets = new Map<string, DayBucket>()
  for (let i = 0; i < window.dayCount; i++) {
    const key = dateKey(addDays(window.from, i))
    buckets.set(key, {
      revenue: 0,
      orders: 0,
      units: 0,
      cost: 0,
      fees: 0,
      cancels: 0,
      currencies: new Set(),
    })
  }

  for (const order of loaded.orders) {
    if (!order.placedAt) continue
    const key = dateKey(startOfLocalDay(order.placedAt))
    const bucket = buckets.get(key)
    if (!bucket) continue
    bucket.revenue += money(order.totalAmount)
    bucket.orders += 1
    bucket.units += unitsByOrder.get(order.id) ?? 0
    bucket.cost += lineCost(loaded.lines, order.id, maps.costMap)
    bucket.fees += feeTotal(maps.feeMap, order.id)
    if (order.isCancelPending) bucket.cancels += 1
    const currency = (order.currency || '').trim().toUpperCase()
    if (currency) bucket.currencies.add(currency)
  }

  const points: DashboardTrendPoint[] = []
  for (const [key, bucket] of buckets) {
    const dayMode =
      overallMode.currencyMode === 'mixed'
        ? currencyModeOf([...bucket.currencies])
        : overallMode
    const moneyOk = dayMode.currencyMode !== 'mixed'
    const profit = profitFromComponents(bucket.revenue, bucket.cost, bucket.fees)
    points.push({
      date: key,
      revenue: moneyOk ? bucket.revenue : null,
      orders: bucket.orders,
      units: bucket.units,
      aov: moneyOk && bucket.orders > 0 ? Math.round(bucket.revenue / bucket.orders) : moneyOk ? 0 : null,
      grossProfit: moneyOk ? profit.grossProfit : null,
      netProfit: moneyOk ? profit.netProfit : null,
      grossMargin: moneyOk ? profit.grossMargin : null,
      netMargin: moneyOk ? profit.netMargin : null,
      refundRate: bucket.orders > 0 ? Number(((bucket.cancels / bucket.orders) * 100).toFixed(1)) : 0,
      currency: moneyOk ? dayMode.currency : null,
      currencyMode: overallMode.currencyMode,
    })
  }
  return points
}

export async function getDashboardTodos(
  db: AppDatabase,
  organizationId: string,
): Promise<DashboardTodoDto> {
  const [readyRow] = await db
    .select({ value: count() })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, organizationId),
        sql`(${orders.fulfillmentStatus} in ('ready_to_ship', 'unfulfilled') or ${orders.status} in ('ready_to_ship', 'paid', 'unfulfilled'))`,
      ),
    )

  const bal = await balanceStats(db, organizationId)

  const [purchaseRow] = await db
    .select({ value: count() })
    .from(purchaseRequests)
    .where(
      and(
        eq(purchaseRequests.organizationId, organizationId),
        eq(purchaseRequests.status, 'pending_approval'),
      ),
    )

  const [refundRow] = await db
    .select({ value: count() })
    .from(reverseOrders)
    .where(
      and(
        eq(reverseOrders.organizationId, organizationId),
        or(
          inArray(reverseOrders.platformStatus, [...REFUND_PENDING_PLATFORM_STATUSES]),
          inArray(reverseOrders.fulfillmentStatus, [...REFUND_PENDING_FULFILLMENT_STATUSES]),
        ),
      ),
    )

  const [mappingOpen] = await db
    .select({ value: count() })
    .from(mappingExceptions)
    .where(and(eq(mappingExceptions.organizationId, organizationId), eq(mappingExceptions.status, 'open')))

  const [unmapped] = await db
    .select({ value: count() })
    .from(sellerSkuMappings)
    .where(
      and(
        eq(sellerSkuMappings.organizationId, organizationId),
        sql`${sellerSkuMappings.status} in ('unmapped', 'abnormal', 'pending')`,
      ),
    )

  const syncRows = await db
    .select({ status: syncTasks.status, value: count() })
    .from(syncTasks)
    .where(eq(syncTasks.organizationId, organizationId))
    .groupBy(syncTasks.status)

  let syncFail = 0
  for (const row of syncRows) {
    const ui = toUiSyncStatus(row.status)
    if (ui === '失败' || ui === '部分失败') syncFail += Number(row.value)
  }

  return {
    readyToShip: Number(readyRow?.value ?? 0),
    lowStock: bal.lowStock ?? 0,
    pendingPurchase: Number(purchaseRow?.value ?? 0),
    refundPending: Number(refundRow?.value ?? 0),
    mappingAbnormal: Number(mappingOpen?.value ?? 0) + Number(unmapped?.value ?? 0),
    syncFail,
  }
}

export async function getDashboardInventorySummary(db: AppDatabase, organizationId: string) {
  const bal = await balanceStats(db, organizationId)
  const [row] = await db
    .select({
      skus: count(),
      onHand: sql<string>`coalesce(sum(${inventoryBalances.onHand}), 0)`,
      reserved: sql<string>`coalesce(sum(${inventoryBalances.reserved}), 0)`,
    })
    .from(inventoryBalances)
    .where(eq(inventoryBalances.organizationId, organizationId))
  return {
    skus: Number(row?.skus ?? bal.skuCount ?? 0),
    onHand: money(row?.onHand) || bal.onHandTotal || 0,
    reserved: money(row?.reserved) || bal.reservedTotal || 0,
    available: bal.availableTotal || 0,
  }
}

export type DashboardPlatformMixItem = {
  platform: string
  currency: string
  revenue: number | null
  share: number
  orders: number
  shareBasis: 'revenue' | 'orders'
}

export type DashboardAlertDto = {
  type: string
  message: string
  href: string
  count: number
}

/** 按店铺 platform + 站点 + 币种聚合；跨币种用订单量占比，不把不同币种销售额相加。 */
export async function getDashboardPlatformMix(
  db: AppDatabase,
  organizationId: string,
  input: DashboardFilterInput = {},
): Promise<DashboardPlatformMixItem[]> {
  const window = resolveDashboardWindow(input)
  const rows = await db
    .select({
      platform: shops.platform,
      country: shops.marketplaceCountry,
      currency: orders.currency,
      revenue: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`,
      orders: count(),
    })
    .from(orders)
    .innerJoin(shops, eq(orders.shopId, shops.id))
    .where(and(...orderConditions(organizationId, input, window.from, window.to)))
    .groupBy(shops.platform, shops.marketplaceCountry, orders.currency)

  const items = rows.map((r) => {
    const platform = `${(r.platform || 'unknown').toUpperCase()}${r.country ? ` ${r.country}` : ''}`
    const currency = (r.currency || '').trim().toUpperCase()
    return {
      platform: currency ? `${platform} · ${currency}` : platform,
      currency,
      revenue: money(r.revenue),
      orders: Number(r.orders ?? 0),
      share: 0,
      shareBasis: 'revenue' as 'revenue' | 'orders',
    }
  })
  const mode = currencyModeOf(items.map((i) => i.currency))
  if (mode.currencyMode === 'mixed') {
    const totalOrders = items.reduce((s, i) => s + i.orders, 0)
    for (const item of items) {
      item.share = totalOrders > 0 ? Number(((item.orders / totalOrders) * 100).toFixed(1)) : 0
      item.shareBasis = 'orders'
    }
  } else {
    const total = items.reduce((s, i) => s + (i.revenue ?? 0), 0)
    for (const item of items) {
      item.share = total > 0 ? Number((((item.revenue ?? 0) / total) * 100).toFixed(1)) : 0
      item.shareBasis = 'revenue'
    }
  }
  items.sort((a, b) => b.share - a.share || b.orders - a.orders)
  return items
}

/** 今日预警：订单异常 stats + 同步失败 + 低库存；无数据返回空 */
export async function getDashboardAlerts(
  db: AppDatabase,
  organizationId: string,
): Promise<DashboardAlertDto[]> {
  const ex = await orderExceptionStats(db, organizationId)
  const todos = await getDashboardTodos(db, organizationId)
  const alerts: DashboardAlertDto[] = []

  const openEx = ex.open + ex.inProgress
  if (openEx > 0) {
    alerts.push({
      type: '订单异常',
      message: `未关闭异常 ${openEx} 件（超时未发 ${ex.timeoutUnshipped} / 占库失败 ${ex.reservationFailed} / 拣货 ${ex.pickingException} / 同步失败 ${ex.syncFailed}）`,
      href: '/console/order-exceptions',
      count: openEx,
    })
  }
  if (todos.syncFail > 0) {
    alerts.push({
      type: '同步',
      message: `同步失败 / 部分失败 ${todos.syncFail} 条`,
      href: '/console/sync-tasks',
      count: todos.syncFail,
    })
  }
  if (todos.lowStock > 0) {
    alerts.push({
      type: '库存',
      message: `低库存 SKU ${todos.lowStock} 个`,
      href: '/console/inventory-balances',
      count: todos.lowStock,
    })
  }
  if (todos.mappingAbnormal > 0) {
    alerts.push({
      type: '映射',
      message: `映射异常 ${todos.mappingAbnormal} 条`,
      href: '/console/mappings',
      count: todos.mappingAbnormal,
    })
  }
  if (todos.refundPending > 0) {
    alerts.push({
      type: '售后',
      message: `进行中退款/售后 ${todos.refundPending} 单`,
      href: '/console/aftersales',
      count: todos.refundPending,
    })
  }
  return alerts
}

export type CostCalcSeedDto = {
  sku: string
  title: string
  fobUnit: number
  landedUnitCost: number | null
  currency: string
  platformCommissionPct: number | null
  fromSkuCost: boolean
  fromFeeTemplate: boolean
  note: string
}

/** 成本测算工作台初始值：优先 sku_costs，其次 fee_templates 解析结果由前端 resolve */
export async function getCostCalcSeed(
  db: AppDatabase,
  organizationId: string,
  sku: string,
): Promise<CostCalcSeedDto | null> {
  const code = sku.trim()
  if (!code) return null
  const [variant] = await db
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      title: products.title,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(eq(productVariants.organizationId, organizationId), eq(productVariants.sku, code)))
    .limit(1)
  if (!variant) {
    return {
      sku: code,
      title: code,
      fobUnit: 0,
      landedUnitCost: null,
      currency: 'USD',
      platformCommissionPct: null,
      fromSkuCost: false,
      fromFeeTemplate: false,
      note: '库中无此 SKU；本地试算可继续，勿把 localStorage 当成本主记录',
    }
  }

  const [cost] = await db
    .select()
    .from(skuCosts)
    .where(and(eq(skuCosts.organizationId, organizationId), eq(skuCosts.variantId, variant.id)))
    .orderBy(sql`${skuCosts.createdAt} desc`)
    .limit(1)

  const snap = (cost?.calculatorSnapshot ?? {}) as Record<string, unknown>
  const fobUnit = Number(snap.fobUnit ?? snap.purchaseUnit ?? cost?.amount ?? 0)
  return {
    sku: variant.sku,
    title: variant.title || variant.sku,
    fobUnit: Number.isFinite(fobUnit) ? fobUnit : money(cost?.amount),
    landedUnitCost: cost?.landedUnitCost == null ? null : money(cost.landedUnitCost),
    currency: cost?.currency || 'USD',
    platformCommissionPct:
      snap.platformCommissionPct == null ? null : Number(snap.platformCommissionPct),
    fromSkuCost: Boolean(cost),
    fromFeeTemplate: Boolean(cost?.feeTemplateVersionId),
    note: cost
      ? '初始值来自 sku_costs（可本地试算覆盖；主记录在库）'
      : '无 sku_costs；请用费用模板 resolve 或手工试算后写入柜次成本',
  }
}

export type DashboardInventoryCategoryDto = {
  category: string
  stock: number
  inTransit: number
  turnoverDays: number
}

/**
 * 按商品品类聚合库存：balances.onHand + 近30天出库绝对值估算周转。
 * 无数据返回空数组（图表空态），不用固定 mock。
 */
export async function getDashboardInventoryByCategory(
  db: AppDatabase,
  organizationId: string,
): Promise<DashboardInventoryCategoryDto[]> {
  const balanceRows = await db
    .select({
      category: sql<string>`coalesce(nullif(${products.categoryHint}, ''), '未分类')`,
      stock: sql<string>`coalesce(sum(${inventoryBalances.onHand}), 0)`,
      reserved: sql<string>`coalesce(sum(${inventoryBalances.reserved}), 0)`,
    })
    .from(inventoryBalances)
    .innerJoin(productVariants, eq(inventoryBalances.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(inventoryBalances.organizationId, organizationId))
    .groupBy(sql`coalesce(nullif(${products.categoryHint}, ''), '未分类')`)

  const since = addDays(startOfLocalDay(new Date()), -30)
  const outflowRows = await db
    .select({
      category: sql<string>`coalesce(nullif(${products.categoryHint}, ''), '未分类')`,
      outflow: sql<string>`coalesce(sum(abs(least(${inventoryMovements.qtyDelta}, 0))), 0)`,
    })
    .from(inventoryMovements)
    .innerJoin(productVariants, eq(inventoryMovements.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      and(
        eq(inventoryMovements.organizationId, organizationId),
        gte(inventoryMovements.occurredAt, since),
      ),
    )
    .groupBy(sql`coalesce(nullif(${products.categoryHint}, ''), '未分类')`)

  const outflowMap = new Map(outflowRows.map((r) => [r.category, money(r.outflow)]))
  const items: DashboardInventoryCategoryDto[] = balanceRows.map((r) => {
    const stock = money(r.stock)
    const outflow = outflowMap.get(r.category) ?? 0
    const daily = outflow / 30
    const turnoverDays = daily > 0 ? Math.round((stock / daily) * 10) / 10 : 0
    return {
      category: r.category || '未分类',
      stock,
      inTransit: 0,
      turnoverDays,
    }
  })

  // 在途：若有 ocean / purchase 在途可后续补；此处保持 0，避免假数
  return items.filter((i) => i.stock > 0 || i.turnoverDays > 0)
}

export type NavBadgesDto = {
  pendingCount: number
  inventoryAlerts: number
  approvalPending: number
  orderExceptions: number
}

/** 侧栏角标：真实计数，缺数据为 0。 */
export async function getNavBadges(db: AppDatabase, organizationId: string): Promise<NavBadgesDto> {
  const [pendingRow] = await db
    .select({ value: count() })
    .from(pendingActions)
    .where(and(eq(pendingActions.organizationId, organizationId), eq(pendingActions.status, 'pending')))

  const bal = await balanceStats(db, organizationId)
  const todos = await getDashboardTodos(db, organizationId)
  const ex = await orderExceptionStats(db, organizationId)

  return {
    pendingCount: Number(pendingRow?.value ?? 0),
    inventoryAlerts: bal.lowStock ?? 0,
    approvalPending: todos.pendingPurchase,
    orderExceptions: ex.open ?? ex.total ?? 0,
  }
}

export type DashboardFilterOptionDto = {
  platforms: Array<{ value: string; label: string }>
  sites: Array<{ value: string; label: string }>
  shops: Array<{ id: string; name: string; platform: string; site: string; currency: string }>
}

/** 筛选下拉从本组织店铺主档读取，不写死平台/站点。 */
export async function getDashboardFilterOptions(
  db: AppDatabase,
  organizationId: string,
): Promise<DashboardFilterOptionDto> {
  const rows = await db
    .select({
      id: shops.id,
      name: shops.name,
      platform: shops.platform,
      region: shops.region,
      marketplaceCountry: shops.marketplaceCountry,
      currency: shops.currency,
    })
    .from(shops)
    .where(and(eq(shops.organizationId, organizationId), isNull(shops.deletedAt)))
    .orderBy(shops.name)

  const platforms = new Map<string, string>()
  const sites = new Map<string, string>()
  const shopOptions = rows.map((row) => {
    const platform = row.platform || 'unknown'
    const site = row.marketplaceCountry || row.region || ''
    if (!platforms.has(platform)) platforms.set(platform, platform.toUpperCase())
    if (site && !sites.has(site)) sites.set(site, site)
    return {
      id: row.id,
      name: row.name,
      platform,
      site,
      currency: row.currency,
    }
  })
  return {
    platforms: [...platforms.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
    sites: [...sites.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
    shops: shopOptions,
  }
}

export type DashboardMetaDto = {
  isDemoTenant: boolean
  organizationId: string
}

export async function getDashboardMeta(
  db: AppDatabase,
  organizationId: string,
): Promise<DashboardMetaDto> {
  const [org] = await db
    .select({ id: organization.id, slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)
  return {
    isDemoTenant: isDemoOrganization({ id: org?.id ?? organizationId, slug: org?.slug }),
    organizationId,
  }
}
