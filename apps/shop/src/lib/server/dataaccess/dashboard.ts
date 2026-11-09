/**
 * Dashboard KPI / 趋势（模块13）。
 * 从 orders / inventory_balances / purchase / reverse / sync 聚合；缺省为 0，不用固定 mock 销售额。
 */
import { and, count, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import {
  inventoryBalances,
  inventoryMovements,
  mappingExceptions,
  orderLines,
  orders,
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

export type DashboardTrendRange = 7 | 30 | 90

export type DashboardKpiDto = {
  range: DashboardTrendRange
  revenue: number
  orders: number
  units: number
  aov: number
  prevRevenue: number
  prevOrders: number
  prevUnits: number
  prevAov: number
  currency: string
}

export type DashboardTrendPoint = {
  date: string
  revenue: number
  orders: number
  units: number
  aov: number
  profit: number
  refundRate: number
}

export type DashboardTodoDto = {
  readyToShip: number
  lowStock: number
  pendingPurchase: number
  refundPending: number
  mappingAbnormal: number
  syncFail: number
}

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

function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function aggregateWindow(
  db: AppDatabase,
  organizationId: string,
  from: Date,
  to: Date,
): Promise<{ revenue: number; orders: number; units: number; currency: string }> {
  const [orderRow] = await db
    .select({
      revenue: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`,
      orders: count(),
      currency: sql<string>`coalesce(min(${orders.currency}), 'LKR')`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, organizationId),
        gte(orders.placedAt, from),
        lt(orders.placedAt, to),
      ),
    )

  const orderIds = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, organizationId),
        gte(orders.placedAt, from),
        lt(orders.placedAt, to),
      ),
    )

  let units = 0
  if (orderIds.length > 0) {
    const ids = orderIds.map((o) => o.id)
    const [unitRow] = await db
      .select({ units: sql<number>`coalesce(sum(${orderLines.qty}), 0)` })
      .from(orderLines)
      .where(and(eq(orderLines.organizationId, organizationId), inArray(orderLines.orderId, ids)))
    units = Number(unitRow?.units ?? 0)
  }

  return {
    revenue: money(orderRow?.revenue),
    orders: Number(orderRow?.orders ?? 0),
    units,
    currency: orderRow?.currency || 'LKR',
  }
}

export async function getDashboardKpis(
  db: AppDatabase,
  organizationId: string,
  range: DashboardTrendRange,
): Promise<DashboardKpiDto> {
  const today = startOfDay(new Date())
  const to = addDays(today, 1)
  const from = addDays(to, -range)
  const prevTo = from
  const prevFrom = addDays(prevTo, -range)

  const cur = await aggregateWindow(db, organizationId, from, to)
  const prev = await aggregateWindow(db, organizationId, prevFrom, prevTo)

  return {
    range,
    revenue: cur.revenue,
    orders: cur.orders,
    units: cur.units,
    aov: cur.orders > 0 ? Math.round(cur.revenue / cur.orders) : 0,
    prevRevenue: prev.revenue,
    prevOrders: prev.orders,
    prevUnits: prev.units,
    prevAov: prev.orders > 0 ? Math.round(prev.revenue / prev.orders) : 0,
    currency: cur.currency || 'LKR',
  }
}

export async function getDashboardTrends(
  db: AppDatabase,
  organizationId: string,
  range: DashboardTrendRange,
): Promise<DashboardTrendPoint[]> {
  const today = startOfDay(new Date())
  const to = addDays(today, 1)
  const from = addDays(to, -range)

  const orderRows = await db
    .select({
      placedAt: orders.placedAt,
      totalAmount: orders.totalAmount,
      id: orders.id,
      isCancelPending: orders.isCancelPending,
    })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, organizationId),
        gte(orders.placedAt, from),
        lt(orders.placedAt, to),
      ),
    )

  const ids = orderRows.map((o) => o.id)
  const lineRows =
    ids.length === 0
      ? []
      : await db
          .select({ orderId: orderLines.orderId, qty: orderLines.qty })
          .from(orderLines)
          .where(and(eq(orderLines.organizationId, organizationId), inArray(orderLines.orderId, ids)))

  const unitsByOrder = new Map<string, number>()
  for (const line of lineRows) {
    unitsByOrder.set(line.orderId, (unitsByOrder.get(line.orderId) ?? 0) + (line.qty ?? 0))
  }

  const buckets = new Map<string, DashboardTrendPoint>()
  for (let i = 0; i < range; i++) {
    const d = addDays(from, i)
    const key = dateKey(d)
    buckets.set(key, {
      date: key,
      revenue: 0,
      orders: 0,
      units: 0,
      aov: 0,
      profit: 0,
      refundRate: 0,
    })
  }

  const cancelByDay = new Map<string, number>()
  for (const order of orderRows) {
    if (!order.placedAt) continue
    const key = dateKey(startOfDay(order.placedAt))
    const bucket = buckets.get(key)
    if (!bucket) continue
    bucket.revenue += money(order.totalAmount)
    bucket.orders += 1
    bucket.units += unitsByOrder.get(order.id) ?? 0
    if (order.isCancelPending) cancelByDay.set(key, (cancelByDay.get(key) ?? 0) + 1)
  }

  for (const [key, bucket] of buckets) {
    bucket.aov = bucket.orders > 0 ? Math.round(bucket.revenue / bucket.orders) : 0
    bucket.profit = bucket.revenue
    const cancels = cancelByDay.get(key) ?? 0
    bucket.refundRate = bucket.orders > 0 ? Number(((cancels / bucket.orders) * 100).toFixed(1)) : 0
  }

  return [...buckets.values()]
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
        sql`coalesce(${reverseOrders.platformStatus}, '') in ('pending', 'open', 'PROCESSING', 'REQUESTED', 'WAIT_SELLER')
            or coalesce(${reverseOrders.fulfillmentStatus}, '') in ('pending', 'open', 'processing')`,
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
  revenue: number
  share: number
  orders: number
}

export type DashboardAlertDto = {
  type: string
  message: string
  href: string
  count: number
}

/** 按店铺 platform + marketplaceCountry 聚合销售额占比；无订单 → 空数组 */
export async function getDashboardPlatformMix(
  db: AppDatabase,
  organizationId: string,
  range: DashboardTrendRange,
): Promise<DashboardPlatformMixItem[]> {
  const today = startOfDay(new Date())
  const to = addDays(today, 1)
  const from = addDays(to, -range)

  const rows = await db
    .select({
      platform: shops.platform,
      country: shops.marketplaceCountry,
      revenue: sql<string>`coalesce(sum(${orders.totalAmount}), 0)`,
      orders: count(),
    })
    .from(orders)
    .innerJoin(shops, eq(orders.shopId, shops.id))
    .where(
      and(
        eq(orders.organizationId, organizationId),
        gte(orders.placedAt, from),
        lt(orders.placedAt, to),
      ),
    )
    .groupBy(shops.platform, shops.marketplaceCountry)

  const items = rows.map((r) => {
    const platform = `${(r.platform || 'unknown').toUpperCase()}${r.country ? ` ${r.country}` : ''}`
    return {
      platform,
      revenue: money(r.revenue),
      orders: Number(r.orders ?? 0),
      share: 0,
    }
  })
  const total = items.reduce((s, i) => s + i.revenue, 0)
  for (const item of items) {
    item.share = total > 0 ? Number(((item.revenue / total) * 100).toFixed(1)) : 0
  }
  items.sort((a, b) => b.revenue - a.revenue)
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

  const since = addDays(startOfDay(new Date()), -30)
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
