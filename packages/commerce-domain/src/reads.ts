import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm"
import {
  commerceFreightRateCards,
  feeTemplates,
  inventoryBalances,
  listings,
  oceanShipments,
  orderLines,
  orders,
  pendingActions,
  pricingSuggestionDrafts,
  productCandidates,
  products,
  productVariants,
  settlements,
  skuCosts,
  stockAlerts,
  syncTasks,
  type AppDatabase,
} from "@workspace/db"
import { assertDesktopMarketplaceScope, DESKTOP_PLATFORM, DESKTOP_SITE } from "./desktop-scope"
import { NotFoundError } from "./errors"
import { assembleFreightUnion } from "./freight-scope"
import { currencyModeOf, sumMoneyByCurrency } from "./money"
import { normalizeLimit, normalizeOffset } from "./pagination"
import { redactRecord, redactUntrustedText } from "./redaction"
import { listDesktopShops, resolveDesktopShopIds } from "./shops"
import { dayBounds, timeMeta } from "./time"

export type ReadQuery = {
  shopId?: string | null
  platform?: string | null
  site?: string | null
  country?: string | null
  q?: string | null
  status?: string | null
  kind?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  timeZone?: string | null
  limit?: number
  offset?: number
  id?: string
}

function emptyNote(subject: string) {
  return `${subject}暂无数据，不视为 0 成功。`
}

function scopeInput(input: ReadQuery = {}) {
  return assertDesktopMarketplaceScope({
    platform: input.platform,
    site: input.site,
    country: input.country,
  })
}

async function scopedShopIds(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  scopeInput(input)
  return resolveDesktopShopIds(db, organizationId, input.shopId)
}

function noShopResult<T extends Record<string, unknown>>(
  bounds: ReturnType<typeof dayBounds>,
  extra: T = {} as T,
) {
  return {
    ...extra,
    items: Array.isArray((extra as { items?: unknown }).items)
      ? ((extra as { items?: unknown }).items as unknown[])
      : [],
    total: 0,
    dataAvailable: false,
    message: emptyNote("本期范围内没有 Daraz 斯里兰卡店铺，"),
    ...timeMeta(bounds),
  }
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export async function getDashboardKpis(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const bounds = dayBounds(input)
  const shopIds = await scopedShopIds(db, organizationId, input)
  const shops = await listDesktopShops(db, organizationId)
  if (shopIds.length === 0) {
    return {
      shops: shops.length,
      todayOrderCount: null,
      todaySales: { currencyMode: "empty" as const, currency: null, total: null, byCurrency: [], currencies: [] },
      pendingCount: 0,
      lowStockCount: 0,
      dataAvailable: false,
      message: emptyNote("今日经营"),
      ...timeMeta(bounds),
    }
  }

  const todayOrders = await db
    .select({
      currency: orders.currency,
      totalAmount: orders.totalAmount,
    })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, organizationId),
        inArray(orders.shopId, shopIds),
        gte(orders.placedAt, bounds.dateFrom),
        lte(orders.placedAt, bounds.dateTo),
      ),
    )

  const sales = sumMoneyByCurrency(
    todayOrders.map((row) => ({ currency: row.currency, amount: num(row.totalAmount) ?? 0 })),
  )

  const [pendingRow] = await db
    .select({ value: count() })
    .from(pendingActions)
    .where(
      and(
        eq(pendingActions.organizationId, organizationId),
        eq(pendingActions.status, "pending"),
        or(inArray(pendingActions.shopId, shopIds), sql`${pendingActions.shopId} is null`)!,
      ),
    )

  const [alertRow] = await db
    .select({ value: count() })
    .from(stockAlerts)
    .where(
      and(
        eq(stockAlerts.organizationId, organizationId),
        eq(stockAlerts.status, "open"),
        or(inArray(stockAlerts.shopId, shopIds), sql`${stockAlerts.shopId} is null`)!,
      ),
    )

  return {
    shops: shops.length,
    todayOrderCount: todayOrders.length,
    todaySales: sales,
    pendingCount: Number(pendingRow?.value ?? 0),
    lowStockCount: Number(alertRow?.value ?? 0),
    dataAvailable: true,
    message:
      todayOrders.length === 0
        ? emptyNote("今日订单")
        : sales.currencyMode === "mixed"
          ? "今日订单含多种币种，已按币种分列，未做跨币种合计。"
          : null,
    ...timeMeta(bounds),
  }
}

export async function getDashboardTrends(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const now = new Date()
  const timeZone = input.timeZone?.trim() || "Asia/Shanghai"
  const defaultFrom = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
  const bounds = dayBounds({
    now,
    dateFrom: input.dateFrom ?? defaultFrom.toISOString(),
    dateTo: input.dateTo ?? now.toISOString(),
    timeZone,
  })
  const shopIds = await scopedShopIds(db, organizationId, input)
  if (shopIds.length === 0) return noShopResult(bounds, { days: [] })

  const rows = await db
    .select({
      placedAt: orders.placedAt,
      currency: orders.currency,
      totalAmount: orders.totalAmount,
    })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, organizationId),
        inArray(orders.shopId, shopIds),
        gte(orders.placedAt, bounds.dateFrom),
        lte(orders.placedAt, bounds.dateTo),
      ),
    )

  const buckets = new Map<string, Array<{ currency: string; amount: number }>>()
  for (const row of rows) {
    if (!row.placedAt) continue
    const day = row.placedAt.toISOString().slice(0, 10)
    const amount = num(row.totalAmount) ?? 0
    const list = buckets.get(day) ?? []
    list.push({ currency: row.currency, amount })
    buckets.set(day, list)
  }
  const days = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({ day, sales: sumMoneyByCurrency(list), orderCount: list.length }))

  return {
    days,
    dataAvailable: days.length > 0,
    message: days.length === 0 ? emptyNote("趋势") : null,
    ...timeMeta(bounds),
  }
}

export async function getDashboardTodos(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const bounds = dayBounds(input)
  const shopIds = await scopedShopIds(db, organizationId, input)
  if (shopIds.length === 0) return noShopResult(bounds)

  const rows = await db
    .select({
      id: pendingActions.id,
      kind: pendingActions.kind,
      title: pendingActions.title,
      status: pendingActions.status,
      shopId: pendingActions.shopId,
      createdAt: pendingActions.createdAt,
    })
    .from(pendingActions)
    .where(
      and(
        eq(pendingActions.organizationId, organizationId),
        eq(pendingActions.status, "pending"),
        or(inArray(pendingActions.shopId, shopIds), sql`${pendingActions.shopId} is null`)!,
      ),
    )
    .orderBy(desc(pendingActions.createdAt))
    .limit(20)

  return {
    items: rows,
    total: rows.length,
    dataAvailable: rows.length > 0,
    message: rows.length === 0 ? "当前没有待办待审。" : "确认请在控制台 /console/pending 处理。",
    ...timeMeta(bounds),
  }
}

export async function getDashboardAlerts(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const bounds = dayBounds(input)
  const shopIds = await scopedShopIds(db, organizationId, input)
  if (shopIds.length === 0) return noShopResult(bounds)

  const alerts = await db
    .select()
    .from(stockAlerts)
    .where(
      and(
        eq(stockAlerts.organizationId, organizationId),
        eq(stockAlerts.status, "open"),
        or(inArray(stockAlerts.shopId, shopIds), sql`${stockAlerts.shopId} is null`)!,
      ),
    )
    .orderBy(desc(stockAlerts.triggeredAt))
    .limit(50)

  const failedSync = await db
    .select({
      id: syncTasks.id,
      type: syncTasks.type,
      status: syncTasks.status,
      error: syncTasks.error,
      shopId: syncTasks.shopId,
      finishedAt: syncTasks.finishedAt,
    })
    .from(syncTasks)
    .where(
      and(
        eq(syncTasks.organizationId, organizationId),
        inArray(syncTasks.status, ["failed", "skipped", "error"]),
        or(inArray(syncTasks.shopId, shopIds), sql`${syncTasks.shopId} is null`)!,
      ),
    )
    .orderBy(desc(syncTasks.finishedAt))
    .limit(20)

  return {
    stockAlerts: alerts.map((row) => ({
      id: row.id,
      shopId: row.shopId,
      warehouseCode: row.warehouseCode,
      variantId: row.variantId,
      threshold: row.threshold,
      status: row.status,
      triggeredAt: row.triggeredAt?.toISOString() ?? null,
    })),
    syncFailures: failedSync.map((row) => ({
      ...row,
      error: row.error || "已失败或已跳过，不视为成功。",
      finishedAt: row.finishedAt?.toISOString() ?? null,
    })),
    dataAvailable: alerts.length + failedSync.length > 0,
    message: alerts.length + failedSync.length === 0 ? "当前没有库存预警或失败同步。" : null,
    ...timeMeta(bounds),
  }
}

export async function searchProducts(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  scopeInput(input)
  const bounds = dayBounds(input)
  const limit = normalizeLimit(input.limit)
  const offset = normalizeOffset(input.offset)
  const filters: SQL[] = [eq(products.organizationId, organizationId)]
  if (input.status?.trim()) filters.push(eq(products.status, input.status.trim()))
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(or(ilike(products.title, q), ilike(products.spuCode, q))!)
  }
  const where = and(...filters)!
  const [totalRow] = await db.select({ value: count() }).from(products).where(where)
  const rows = await db
    .select({
      id: products.id,
      spuCode: products.spuCode,
      title: products.title,
      status: products.status,
      brand: products.brand,
      categoryHint: products.categoryHint,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .where(where)
    .orderBy(desc(products.updatedAt))
    .limit(limit)
    .offset(offset)

  return {
    items: rows.map((row) => ({ ...row, updatedAt: row.updatedAt?.toISOString() ?? null })),
    total: Number(totalRow?.value ?? 0),
    dataAvailable: Number(totalRow?.value ?? 0) > 0,
    message: Number(totalRow?.value ?? 0) === 0 ? emptyNote("商品目录") : null,
    ...timeMeta(bounds),
  }
}

export async function getProduct(db: AppDatabase, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.organizationId, organizationId), eq(products.id, id)))
    .limit(1)
  if (!row) throw new NotFoundError("商品不存在")
  const variants = await db
    .select({
      id: productVariants.id,
      skuCode: productVariants.skuCode,
      sku: productVariants.sku,
      status: productVariants.status,
      barcode: productVariants.barcode,
    })
    .from(productVariants)
    .where(and(eq(productVariants.organizationId, organizationId), eq(productVariants.productId, row.id)))
  return {
    id: row.id,
    spuCode: row.spuCode,
    title: row.title,
    status: row.status,
    brand: row.brand,
    categoryHint: row.categoryHint,
    variants: variants.map((item) => ({
      id: item.id,
      skuCode: item.skuCode || item.sku,
      sku: item.sku,
      status: item.status,
      barcode: item.barcode,
    })),
  }
}

export async function listCandidates(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  scopeInput(input)
  const bounds = dayBounds(input)
  const limit = normalizeLimit(input.limit)
  const offset = normalizeOffset(input.offset)
  const filters: SQL[] = [eq(productCandidates.organizationId, organizationId)]
  if (input.status?.trim()) filters.push(eq(productCandidates.status, input.status.trim()))
  if (input.q?.trim()) filters.push(ilike(productCandidates.title, `%${input.q.trim()}%`))
  const where = and(...filters)!
  const [totalRow] = await db.select({ value: count() }).from(productCandidates).where(where)
  const rows = await db
    .select()
    .from(productCandidates)
    .where(where)
    .orderBy(desc(productCandidates.updatedAt))
    .limit(limit)
    .offset(offset)
  return {
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      status: row.status,
      source: row.source,
      score: num(row.score),
      productId: row.productId,
      pendingActionId: row.pendingActionId,
      createdAt: row.createdAt.toISOString(),
    })),
    total: Number(totalRow?.value ?? 0),
    dataAvailable: Number(totalRow?.value ?? 0) > 0,
    message: Number(totalRow?.value ?? 0) === 0 ? emptyNote("选品候选") : null,
    ...timeMeta(bounds),
  }
}

export async function getCandidate(db: AppDatabase, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(productCandidates)
    .where(and(eq(productCandidates.organizationId, organizationId), eq(productCandidates.id, id)))
    .limit(1)
  if (!row) throw new NotFoundError("候选不存在")
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    status: row.status,
    source: row.source,
    score: num(row.score),
    rejectReason: row.rejectReason,
    productId: row.productId,
    pendingActionId: row.pendingActionId,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function candidateStats(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  scopeInput(input)
  const rows = await db
    .select({ status: productCandidates.status, value: count() })
    .from(productCandidates)
    .where(eq(productCandidates.organizationId, organizationId))
    .groupBy(productCandidates.status)
  const byStatus: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    byStatus[row.status] = Number(row.value)
    total += Number(row.value)
  }
  return { total, byStatus, dataAvailable: total > 0, message: total === 0 ? emptyNote("候选") : null }
}

export async function listListings(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const bounds = dayBounds(input)
  const shopIds = await scopedShopIds(db, organizationId, input)
  if (shopIds.length === 0) return noShopResult(bounds)
  const limit = normalizeLimit(input.limit)
  const offset = normalizeOffset(input.offset)
  const filters: SQL[] = [eq(listings.organizationId, organizationId), inArray(listings.shopId, shopIds)]
  if (input.status?.trim()) filters.push(eq(listings.status, input.status.trim()))
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(or(ilike(listings.title, q), ilike(listings.listingTitle, q), ilike(listings.externalItemId, q))!)
  }
  const where = and(...filters)!
  const [totalRow] = await db.select({ value: count() }).from(listings).where(where)
  const rows = await db.select().from(listings).where(where).orderBy(desc(listings.updatedAt)).limit(limit).offset(offset)
  return {
    items: rows.map((row) => ({
      id: row.id,
      shopId: row.shopId,
      productId: row.productId,
      status: row.status,
      publishState: row.publishState,
      title: row.listingTitle || row.title,
      externalItemId: row.externalItemId,
      priceAmount: num(row.priceAmount),
      priceCurrency: row.priceCurrency,
      stockOnHand: row.stockOnHand,
      lastError: row.lastError,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    })),
    total: Number(totalRow?.value ?? 0),
    dataAvailable: Number(totalRow?.value ?? 0) > 0,
    message: Number(totalRow?.value ?? 0) === 0 ? emptyNote("刊登") : null,
    ...timeMeta(bounds),
  }
}

export async function getListing(db: AppDatabase, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(listings)
    .where(and(eq(listings.organizationId, organizationId), eq(listings.id, id)))
    .limit(1)
  if (!row) throw new NotFoundError("刊登不存在")
  await requireScopedListingShop(db, organizationId, row.shopId)
  return {
    id: row.id,
    shopId: row.shopId,
    productId: row.productId,
    status: row.status,
    publishState: row.publishState,
    title: row.listingTitle || row.title,
    externalItemId: row.externalItemId,
    priceAmount: num(row.priceAmount),
    priceCurrency: row.priceCurrency,
    stockOnHand: row.stockOnHand,
    warehouseCode: row.warehouseCode,
    lastError: row.lastError,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    liveAt: row.liveAt?.toISOString() ?? null,
  }
}

async function requireScopedListingShop(db: AppDatabase, organizationId: string, shopId: string) {
  await resolveDesktopShopIds(db, organizationId, shopId)
}

export async function listingStats(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const shopIds = await scopedShopIds(db, organizationId, input)
  if (shopIds.length === 0) return { total: 0, byStatus: {}, dataAvailable: false, message: emptyNote("刊登") }
  const rows = await db
    .select({ status: listings.status, value: count() })
    .from(listings)
    .where(and(eq(listings.organizationId, organizationId), inArray(listings.shopId, shopIds)))
    .groupBy(listings.status)
  const byStatus: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    byStatus[row.status] = Number(row.value)
    total += Number(row.value)
  }
  return { total, byStatus, dataAvailable: total > 0, message: total === 0 ? emptyNote("刊登") : null }
}

function redactOrder(row: typeof orders.$inferSelect) {
  return {
    id: row.id,
    shopId: row.shopId,
    externalOrderId: row.externalOrderId,
    orderNumber: row.orderNumber,
    status: row.status,
    platformStatus: row.platformStatus,
    fulfillmentStatus: row.fulfillmentStatus,
    placedAt: row.placedAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    currency: row.currency,
    totalAmount: num(row.totalAmount),
    shippingFee: num(row.shippingFee),
    voucherAmount: num(row.voucherAmount),
    paymentMethod: row.paymentMethod,
    buyerRegion: row.buyerRegion,
    buyerNote: redactUntrustedText(row.buyerNote) ? "仅 Web 可见" : null,
    needCancelConfirm: row.needCancelConfirm,
    isCancelPending: row.isCancelPending,
  }
}

export async function listOrders(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const bounds = dayBounds({
    ...input,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    timeZone: input.timeZone,
  })
  const shopIds = await scopedShopIds(db, organizationId, input)
  if (shopIds.length === 0) return noShopResult(bounds)
  const limit = normalizeLimit(input.limit)
  const offset = normalizeOffset(input.offset)
  const filters: SQL[] = [eq(orders.organizationId, organizationId), inArray(orders.shopId, shopIds)]
  if (input.status?.trim()) filters.push(eq(orders.status, input.status.trim()))
  if (input.dateFrom || input.dateTo) {
    filters.push(gte(orders.placedAt, bounds.dateFrom), lte(orders.placedAt, bounds.dateTo))
  }
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(or(ilike(orders.externalOrderId, q), ilike(orders.orderNumber, q))!)
  }
  const where = and(...filters)!
  const [totalRow] = await db.select({ value: count() }).from(orders).where(where)
  const rows = await db.select().from(orders).where(where).orderBy(desc(orders.placedAt)).limit(limit).offset(offset)
  const items = rows.map((row) => redactOrder(row))
  const sales = sumMoneyByCurrency(items.map((row) => ({ currency: row.currency, amount: row.totalAmount ?? 0 })))
  return {
    items,
    total: Number(totalRow?.value ?? 0),
    sales,
    dataAvailable: Number(totalRow?.value ?? 0) > 0,
    message: Number(totalRow?.value ?? 0) === 0 ? emptyNote("订单") : "买家姓名、电话、地址与订单 raw 已脱敏。",
    ...timeMeta(bounds),
  }
}

export async function getOrder(db: AppDatabase, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.organizationId, organizationId), eq(orders.id, id)))
    .limit(1)
  if (!row) throw new NotFoundError("订单不存在")
  await requireScopedListingShop(db, organizationId, row.shopId)
  const lines = await db
    .select()
    .from(orderLines)
    .where(and(eq(orderLines.organizationId, organizationId), eq(orderLines.orderId, row.id)))
  return {
    ...redactOrder(row),
    remarks: row.remarks,
    lines: lines.map((line) => ({
      id: line.id,
      sellerSku: line.sellerSku,
      sku: line.sku,
      title: line.title,
      qty: line.qty,
      unitPrice: num(line.unitPrice),
      paidPrice: num(line.paidPrice),
      fulfillmentStatus: line.fulfillmentStatus,
    })),
    // 明确不返回 raw / PII
    raw: undefined,
    buyerPii: "仅 Web 可见",
  }
}

export async function listOrderExceptions(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const bounds = dayBounds(input)
  const shopIds = await scopedShopIds(db, organizationId, input)
  if (shopIds.length === 0) return noShopResult(bounds)
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, organizationId),
        inArray(orders.shopId, shopIds),
        or(eq(orders.needCancelConfirm, true), eq(orders.isCancelPending, true))!,
      ),
    )
    .orderBy(desc(orders.updatedAt))
    .limit(normalizeLimit(input.limit, 50))
  return {
    items: rows.map((row) => redactOrder(row)),
    total: rows.length,
    dataAvailable: rows.length > 0,
    message: rows.length === 0 ? "当前没有取消待确认或取消待处理订单。" : "买家信息已脱敏。",
    ...timeMeta(bounds),
  }
}

function availableQty(row: typeof inventoryBalances.$inferSelect): number {
  return row.onHand - row.reserved - row.qcHold - row.damaged
}

export async function listInventory(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const bounds = dayBounds(input)
  const shopIds = await scopedShopIds(db, organizationId, input)
  if (shopIds.length === 0) return noShopResult(bounds)
  const limit = normalizeLimit(input.limit, 50)
  const offset = normalizeOffset(input.offset)
  const rows = await db
    .select()
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.organizationId, organizationId),
        or(inArray(inventoryBalances.shopId, shopIds), sql`${inventoryBalances.shopId} is null`)!,
      ),
    )
    .orderBy(desc(inventoryBalances.updatedAt))
    .limit(limit)
    .offset(offset)
  const items = rows.map((row) => ({
    id: row.id,
    shopId: row.shopId,
    warehouseCode: row.warehouseCode,
    binCode: row.binCode,
    variantId: row.variantId,
    onHand: row.onHand,
    reserved: row.reserved,
    qcHold: row.qcHold,
    damaged: row.damaged,
    inTransit: row.inTransit,
    pendingInbound: row.pendingInbound,
    customsClearing: row.customsClearing,
    available: availableQty(row),
    updatedAt: row.updatedAt.toISOString(),
  }))
  return {
    items,
    total: items.length,
    dataAvailable: items.length > 0,
    message: items.length === 0 ? emptyNote("库存") : "可售 = 在库 − 预留 − 质检占用 − 损坏；在途/待入/清关不计入可售。",
    ...timeMeta(bounds),
  }
}

export async function listInventoryAlerts(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const bounds = dayBounds(input)
  const shopIds = await scopedShopIds(db, organizationId, input)
  if (shopIds.length === 0) return noShopResult(bounds)
  const rows = await db
    .select()
    .from(stockAlerts)
    .where(
      and(
        eq(stockAlerts.organizationId, organizationId),
        eq(stockAlerts.status, "open"),
        or(inArray(stockAlerts.shopId, shopIds), sql`${stockAlerts.shopId} is null`)!,
      ),
    )
    .orderBy(desc(stockAlerts.triggeredAt))
    .limit(normalizeLimit(input.limit, 50))
  return {
    items: rows.map((row) => ({
      id: row.id,
      shopId: row.shopId,
      warehouseCode: row.warehouseCode,
      variantId: row.variantId,
      threshold: row.threshold,
      status: row.status,
      triggeredAt: row.triggeredAt?.toISOString() ?? null,
    })),
    total: rows.length,
    dataAvailable: rows.length > 0,
    message: rows.length === 0 ? "当前没有未关闭的库存预警。" : null,
    ...timeMeta(bounds),
  }
}

export async function financeOverview(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const bounds = dayBounds(input)
  const shopIds = await scopedShopIds(db, organizationId, input)
  if (shopIds.length === 0) return noShopResult(bounds)
  const rows = await db
    .select()
    .from(settlements)
    .where(and(eq(settlements.organizationId, organizationId), inArray(settlements.shopId, shopIds)))
    .orderBy(desc(settlements.periodEnd))
    .limit(200)
  const payout = sumMoneyByCurrency(rows.map((row) => ({ currency: row.currency, amount: num(row.payoutAmount) ?? 0 })))
  const fees = sumMoneyByCurrency(rows.map((row) => ({ currency: row.currency, amount: num(row.feesTotal) ?? 0 })))
  return {
    settlementCount: rows.length,
    payout,
    fees,
    dataAvailable: rows.length > 0,
    message: rows.length === 0 ? emptyNote("结算") : "此为结算单汇总，不是完整利润核算。",
    ...timeMeta(bounds),
  }
}

export async function listSettlements(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const bounds = dayBounds(input)
  const shopIds = await scopedShopIds(db, organizationId, input)
  if (shopIds.length === 0) return noShopResult(bounds)
  const rows = await db
    .select()
    .from(settlements)
    .where(and(eq(settlements.organizationId, organizationId), inArray(settlements.shopId, shopIds)))
    .orderBy(desc(settlements.periodEnd))
    .limit(normalizeLimit(input.limit, 50))
  return {
    items: rows.map((row) => ({
      id: row.id,
      shopId: row.shopId,
      externalSettlementId: row.externalSettlementId,
      periodStart: row.periodStart?.toISOString?.() ?? row.periodStart,
      periodEnd: row.periodEnd?.toISOString?.() ?? row.periodEnd,
      currency: row.currency,
      payoutAmount: num(row.payoutAmount),
      feesTotal: num(row.feesTotal),
      itemRevenue: num(row.itemRevenue),
      status: row.status,
      payoutStatus: row.payoutStatus,
    })),
    total: rows.length,
    dataAvailable: rows.length > 0,
    message: rows.length === 0 ? emptyNote("结算单") : null,
    ...timeMeta(bounds),
  }
}

export async function financeProfits(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const overview = await financeOverview(db, organizationId, input)
  return {
    ...overview,
    message: overview.dataAvailable
      ? "本期仅返回结算汇总（打款与费用），完整利润核算请在 Web 查看，不会把空数据当成 0 利润。"
      : emptyNote("利润"),
  }
}

export async function listSkuCosts(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  scopeInput(input)
  const bounds = dayBounds(input)
  const rows = await db
    .select()
    .from(skuCosts)
    .where(eq(skuCosts.organizationId, organizationId))
    .orderBy(desc(skuCosts.createdAt))
    .limit(normalizeLimit(input.limit, 50))
  return {
    items: rows.map((row) => ({
      id: row.id,
      variantId: row.variantId,
      kind: row.kind,
      amount: num(row.amount),
      currency: row.currency,
      landedUnitCost: num(row.landedUnitCost),
      note: row.note,
      effectiveFrom: row.effectiveFrom?.toISOString?.() ?? row.effectiveFrom,
      effectiveTo: row.effectiveTo?.toISOString?.() ?? row.effectiveTo,
    })),
    total: rows.length,
    dataAvailable: rows.length > 0,
    message: rows.length === 0 ? emptyNote("SKU 成本") : "金额按原币种列出，未做跨币种合计。",
    currencySummary: sumMoneyByCurrency(rows.map((row) => ({ currency: row.currency, amount: num(row.amount) ?? 0 }))),
    ...timeMeta(bounds),
  }
}

export async function listFreight(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  scopeInput(input)
  const bounds = dayBounds(input)
  const templates = await db
    .select({
      id: feeTemplates.id,
      code: feeTemplates.code,
      name: feeTemplates.name,
      platform: feeTemplates.platform,
      country: feeTemplates.country,
      status: feeTemplates.status,
      type: feeTemplates.type,
    })
    .from(feeTemplates)
    .where(
      and(
        eq(feeTemplates.organizationId, organizationId),
        or(
          eq(feeTemplates.platform, DESKTOP_PLATFORM),
          sql`lower(${feeTemplates.platform}) = ${DESKTOP_PLATFORM}`,
        )!,
        or(
          eq(feeTemplates.country, DESKTOP_SITE),
          sql`upper(${feeTemplates.country}) = ${DESKTOP_SITE}`,
        )!,
      ),
    )
    .limit(100)

  const cards = await db
    .select({
      id: commerceFreightRateCards.id,
      code: commerceFreightRateCards.code,
      name: commerceFreightRateCards.name,
      currency: commerceFreightRateCards.currency,
      unitRate: commerceFreightRateCards.unitRate,
      status: commerceFreightRateCards.status,
      destPort: commerceFreightRateCards.destPort,
      originPort: commerceFreightRateCards.originPort,
      freightMode: commerceFreightRateCards.freightMode,
      effectiveFrom: commerceFreightRateCards.effectiveFrom,
      note: commerceFreightRateCards.note,
    })
    .from(commerceFreightRateCards)
    .where(eq(commerceFreightRateCards.organizationId, organizationId))
    .limit(200)

  const lots = await db
    .select({
      id: oceanShipments.id,
      lotCode: oceanShipments.lotCode,
      platform: oceanShipments.platform,
      destPort: oceanShipments.destPort,
      originPort: oceanShipments.originPort,
      freightMode: oceanShipments.freightMode,
      status: oceanShipments.status,
      etd: oceanShipments.etd,
      notes: oceanShipments.notes,
      packingDetails: oceanShipments.packingDetails,
    })
    .from(oceanShipments)
    .where(eq(oceanShipments.organizationId, organizationId))
    .limit(200)

  const assembled = assembleFreightUnion({
    templates,
    oceanLots: lots,
    rateCards: cards,
  })
  return {
    items: assembled.items,
    feeTemplates: assembled.feeTemplates,
    oceanShipments: assembled.oceanShipments,
    freightRateCards: assembled.freightRateCards,
    excludedOceanCount: assembled.excludedOceanCount,
    excludedRateCardCount: assembled.excludedRateCardCount,
    currencyMode: assembled.currencyMode,
    currency: assembled.currency,
    currencies: assembled.currencies,
    total: assembled.total,
    byCurrency: assembled.byCurrency,
    dataAvailable: assembled.dataAvailable,
    message: assembled.message,
    ...timeMeta(bounds),
  }
}

export async function listPricingDrafts(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  scopeInput(input)
  const bounds = dayBounds(input)
  const rows = await db
    .select()
    .from(pricingSuggestionDrafts)
    .where(
      and(
        eq(pricingSuggestionDrafts.organizationId, organizationId),
        sql`lower(${pricingSuggestionDrafts.platform}) = ${DESKTOP_PLATFORM}`,
        sql`upper(${pricingSuggestionDrafts.site}) = ${DESKTOP_SITE}`,
      ),
    )
    .orderBy(desc(pricingSuggestionDrafts.createdAt))
    .limit(normalizeLimit(input.limit, 50))
  return {
    items: rows.map((row) => ({
      id: row.id,
      variantId: row.variantId,
      sku: row.sku,
      platform: row.platform,
      site: row.site,
      status: row.status,
      suggestedRetail: num(row.suggestedRetail),
      suggestedFreeShipping: num(row.suggestedFreeShipping),
      currency: row.currency,
      isEstimate: row.isEstimate,
      source: row.source,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    })),
    total: rows.length,
    dataAvailable: rows.length > 0,
    message: rows.length === 0 ? "暂无建议草稿" : "仅返回已保存的建议草稿，不会改刊登售价。",
    currencyMode: currencyModeOf(rows.map((row) => row.currency)),
    ...timeMeta(bounds),
  }
}

export async function suggestPrices(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const drafts = await listPricingDrafts(db, organizationId, input)
  return {
    ...drafts,
    message: drafts.dataAvailable ? drafts.message : "暂无建议草稿。本期不会现场演算或虚构建议价。",
  }
}

export async function listShopPolicies(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  scopeInput(input)
  const bounds = dayBounds(input)
  const shops = await listDesktopShops(db, organizationId)
  const items = shops.map((shop) => ({
    shopId: shop.id,
    name: shop.name,
    platform: shop.platform,
    site: shop.marketplaceCountry || shop.region,
    currency: shop.currency,
    status: shop.status,
    inventoryPushEnabled: shop.inventoryPushEnabled,
    priceWritebackEnabled: shop.priceWritebackEnabled,
    lastSyncAt: shop.lastSyncAt?.toISOString() ?? null,
    note:
      !shop.inventoryPushEnabled || !shop.priceWritebackEnabled
        ? "店铺策略关闭时，确认待审后同步会被跳过，不会假成功。"
        : null,
  }))
  return {
    items,
    total: items.length,
    dataAvailable: items.length > 0,
    message: items.length === 0 ? emptyNote("店铺策略") : "v1 只能查看库存推送与改价回写开关，不能通过 MCP 修改。",
    ...timeMeta(bounds),
  }
}

export async function reportSellThrough(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const bounds = dayBounds(input)
  const shopIds = await scopedShopIds(db, organizationId, input)
  if (shopIds.length === 0) return noShopResult(bounds)
  const sold = await db
    .select({
      variantId: orderLines.variantId,
      qty: sql<number>`coalesce(sum(${orderLines.qty}), 0)`,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(
      and(
        eq(orderLines.organizationId, organizationId),
        inArray(orders.shopId, shopIds),
        gte(orders.placedAt, bounds.dateFrom),
        lte(orders.placedAt, bounds.dateTo),
      ),
    )
    .groupBy(orderLines.variantId)
    .limit(200)

  return {
    items: sold.map((row) => ({ variantId: row.variantId, soldQty: Number(row.qty ?? 0) })),
    total: sold.length,
    dataAvailable: sold.length > 0,
    message: sold.length === 0 ? emptyNote("动销") : "按订单行汇总销量；未与库存做强制比率，避免空库存被当成 0 动销成功。",
    ...timeMeta(bounds),
  }
}

export async function reportStockRisk(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const alerts = await listInventoryAlerts(db, organizationId, input)
  const inventory = await listInventory(db, organizationId, { ...input, limit: 100 })
  const alertItems = Array.isArray(alerts.items) ? alerts.items : []
  const inventoryItems = Array.isArray(inventory.items)
    ? (inventory.items as Array<{ available: number }>)
    : []
  const low = inventoryItems.filter((row) => row.available <= 0)
  return {
    openAlerts: alertItems,
    zeroOrNegativeAvailable: low,
    dataAvailable: alertItems.length + low.length > 0,
    message:
      alertItems.length + low.length === 0
        ? "当前没有打开的库存预警或可售为 0 的记录。"
        : "可售为负或 0 表示缺货风险，不是平台写入结果。",
    asOf: alerts.asOf,
    timeZone: alerts.timeZone,
    dateFrom: alerts.dateFrom,
    dateTo: alerts.dateTo,
  }
}

export async function reportAttribution(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  scopeInput(input)
  void db
  void organizationId
  const bounds = dayBounds(input)
  return {
    items: [],
    dataAvailable: false,
    message: "暂无归因数据，不视为已统计成功。",
    ...timeMeta(bounds),
  }
}

const PENDING_KIND_LABEL: Record<string, string> = {
  sourcing_upsert: "选品入库",
  listing_submit: "刊登提交",
  price_change: "改价",
  inventory_push: "库存推送",
  settlement_post: "结算过账",
}

export async function listPending(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const bounds = dayBounds(input)
  const shopIds = await scopedShopIds(db, organizationId, input)
  if (shopIds.length === 0) return noShopResult(bounds)
  const filters: SQL[] = [
    eq(pendingActions.organizationId, organizationId),
    or(inArray(pendingActions.shopId, shopIds), sql`${pendingActions.shopId} is null`)!,
  ]
  if (input.status?.trim()) filters.push(eq(pendingActions.status, input.status.trim()))
  if (input.kind?.trim()) filters.push(eq(pendingActions.kind, input.kind.trim()))
  const rows = await db
    .select()
    .from(pendingActions)
    .where(and(...filters)!)
    .orderBy(desc(pendingActions.createdAt))
    .limit(normalizeLimit(input.limit, 50))
    .offset(normalizeOffset(input.offset))
  return {
    items: rows.map((row) => mapPending(row)),
    total: rows.length,
    dataAvailable: rows.length > 0,
    message: rows.length === 0 ? "当前没有待审事项。" : "确认与拒绝只能在 /console/pending 由运营处理。",
    confirmPath: "/console/pending",
    ...timeMeta(bounds),
  }
}

export async function getPending(db: AppDatabase, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(pendingActions)
    .where(and(eq(pendingActions.organizationId, organizationId), eq(pendingActions.id, id)))
    .limit(1)
  if (!row) throw new NotFoundError("待审单不存在")
  if (row.shopId) await requireScopedListingShop(db, organizationId, row.shopId)
  return {
    ...mapPending(row),
    confirmPath: "/console/pending",
    message: "Agent 不能确认或拒绝待审，请到控制台处理。",
  }
}

function mapPending(row: typeof pendingActions.$inferSelect) {
  const payload = (row.payload ?? {}) as Record<string, unknown>
  return {
    id: row.id,
    kind: row.kind,
    kindLabel: PENDING_KIND_LABEL[row.kind] ?? row.kind,
    title: row.title,
    status: row.status,
    shopId: row.shopId,
    createdBy: row.createdBy,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    lastError: row.lastErrorMessage || row.error || null,
    createdAt: row.createdAt?.toISOString() ?? null,
    listingId: typeof payload.listingId === "string" ? payload.listingId : null,
    mode: typeof payload.mode === "string" ? payload.mode : null,
    payload: redactRecord(payload),
  }
}

export async function listSyncTasks(db: AppDatabase, organizationId: string, input: ReadQuery = {}) {
  const bounds = dayBounds(input)
  const shopIds = await scopedShopIds(db, organizationId, input)
  if (shopIds.length === 0) return noShopResult(bounds)
  const rows = await db
    .select()
    .from(syncTasks)
    .where(
      and(
        eq(syncTasks.organizationId, organizationId),
        or(inArray(syncTasks.shopId, shopIds), sql`${syncTasks.shopId} is null`)!,
      ),
    )
    .orderBy(desc(syncTasks.enqueuedAt))
    .limit(normalizeLimit(input.limit, 50))
  const items = rows.map((row) => ({
    id: row.id,
    taskNo: row.taskNo,
    type: row.type,
    target: row.target,
    status: row.status,
    shopId: row.shopId,
    error: row.error,
    note: row.note,
    progressDone: row.progressDone,
    progressTotal: row.progressTotal,
    enqueuedAt: row.enqueuedAt?.toISOString?.() ?? row.enqueuedAt,
    finishedAt: row.finishedAt?.toISOString?.() ?? row.finishedAt,
  }))
  return {
    items,
    total: items.length,
    failedOrSkipped: items.filter((row) => ["failed", "skipped", "error"].includes(String(row.status))).length,
    dataAvailable: items.length > 0,
    message: items.length === 0 ? emptyNote("同步任务") : "失败或已跳过不会被改写成成功。",
    ...timeMeta(bounds),
  }
}

export { PENDING_KIND_LABEL }
