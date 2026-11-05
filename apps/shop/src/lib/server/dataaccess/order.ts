/**
 * 订单同步 → 占库 → 拣货出库 dataaccess（模块3）。
 * Q07/C12：默认 paid/ready_to_ship 自动占库 + 人工补锁；扣减在出库过账；流水幂等。
 */
import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  inventoryBalances,
  inventoryMovements,
  inventoryReservations,
  orderLines,
  orders,
  productVariants,
  sellerSkuMappings,
  shops,
  stockOutboundLines,
  stockOutbounds,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  formatStamp,
  money,
  shouldAutoReserve,
  toUiMappingStatus,
  toUiOrderStatus,
  toUiOutboundStatus,
  toUiOutboundType,
  type UiMappingStatus,
  type UiOrderStatus,
  type UiOutboundStatus,
  type UiOutboundType,
} from '@/lib/server/mappers/order'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

const DEFAULT_WAREHOUSE = 'WH-CN-XMN-001'
const DEFAULT_BIN = 'A-01-01'

export type OrderLineDto = {
  id: string
  externalLineId: string
  sku: string
  sellerSku: string
  shopSku: string
  title: string
  qty: number
  unitPrice: number
  paidPrice: number
  variantId: string
  bin: string
  warehouse: string
  fulfillmentStatus: string
  platformStatus: string
  mappingStatus: UiMappingStatus
}

export type OrderTimelineStep = {
  at: string
  status: string
  note: string
  current?: boolean
}

export type OrderDto = {
  id: string
  externalOrderId: string
  orderNumber: string
  shopId: string
  externalShopId: string
  shop: string
  platform: string
  status: string
  statusLabel: UiOrderStatus
  platformStatus: string
  fulfillmentStatus: string
  currency: string
  totalAmount: number
  shippingFee: number
  voucherAmount: number
  buyerRegion: string
  paymentMethod: string
  buyerNote: string
  placedAt: string
  paidAt: string
  platformUpdatedAt: string
  lastSyncedAt: string
  reserved: boolean
  mappingStatus: UiMappingStatus
  shipmentCount: number
  warehouseCode: string
  lines: OrderLineDto[]
  timeline: OrderTimelineStep[]
}

export type OrderListRow = Omit<OrderDto, 'lines' | 'timeline' | 'buyerNote' | 'voucherAmount' | 'shippingFee'> & {
  lineCount: number
  firstSku: string
}

export type OutboundLineDto = {
  id: string
  lineNo: number
  orderLineId: string
  sku: string
  variantId: string
  bin: string
  qty: number
  note: string
}

export type OutboundDto = {
  id: string
  outboundNo: string
  outboundType: UiOutboundType
  status: UiOutboundStatus
  warehouse: string
  shopId: string
  orderId: string
  externalOrderId: string
  packageId: string
  picker: string
  reason: string
  remark: string
  idempotencyKey: string
  createdAt: string
  pickedAt: string
  reviewedAt: string
  postedAt: string
  lines: OutboundLineDto[]
  totalQty: number
}

export type OutboundListRow = Omit<OutboundDto, 'lines'> & {
  lineCount: number
  firstSku: string
}

export type SyncOrderLineInput = {
  externalLineId?: string
  sellerSku: string
  shopSku?: string
  sku?: string
  title?: string
  qty: number
  unitPrice?: number
  paidPrice?: number
  platformStatus?: string
  warehouseCode?: string
  binCode?: string
}

export type SyncOrderInput = {
  externalOrderId: string
  orderNumber?: string
  shopId?: string
  externalShopId?: string
  platform?: string
  status?: string
  platformStatus?: string
  fulfillmentStatus?: string
  currency?: string
  totalAmount?: number
  shippingFee?: number
  voucherAmount?: number
  buyerRegion?: string
  paymentMethod?: string
  buyerNote?: string
  placedAt?: string
  paidAt?: string
  platformUpdatedAt?: string
  warehouseCode?: string
  lines: SyncOrderLineInput[]
  autoReserve?: boolean
}

function rawMeta(row: { raw?: unknown }): Record<string, unknown> {
  const raw = row.raw
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  return {}
}

async function resolveShop(
  db: DbLike,
  organizationId: string,
  input: { shopId?: string; externalShopId?: string; platform?: string; name?: string },
) {
  if (input.shopId) {
    const [row] = await db
      .select()
      .from(shops)
      .where(and(eq(shops.organizationId, organizationId), eq(shops.id, input.shopId)))
      .limit(1)
    if (row) return row
  }
  if (input.externalShopId) {
    const [row] = await db
      .select()
      .from(shops)
      .where(
        and(
          eq(shops.organizationId, organizationId),
          eq(shops.externalShopId, input.externalShopId),
        ),
      )
      .limit(1)
    if (row) return row
  }
  const platform = input.platform || 'daraz'
  const externalShopId = input.externalShopId || `demo-${platform}-shop`
  const id = createId()
  try {
    await db.insert(shops).values({
      id,
      organizationId,
      platform,
      name: input.name || 'Demo Shop',
      externalShopId,
      status: 'active',
      region: 'LK',
      currency: 'LKR',
      marketplaceCountry: 'LK',
    })
  } catch {
    // unique (org, platform, external_shop_id) 冲突时回读
  }
  const [created] = await db.select().from(shops).where(eq(shops.id, id)).limit(1)
  if (created) return created
  const [again] = await db
    .select()
    .from(shops)
    .where(
      and(eq(shops.organizationId, organizationId), eq(shops.externalShopId, externalShopId)),
    )
    .limit(1)
  if (!again) throw new Error('无法创建或定位店铺')
  return again
}

async function resolveVariantBySellerSku(
  db: DbLike,
  organizationId: string,
  shopId: string,
  sellerSku: string,
): Promise<{ variantId: string | null; mappingStatus: 'ok' | 'pending' | 'exception' }> {
  const code = sellerSku.trim()
  if (!code) return { variantId: null, mappingStatus: 'exception' }

  const [mapping] = await db
    .select()
    .from(sellerSkuMappings)
    .where(
      and(
        eq(sellerSkuMappings.organizationId, organizationId),
        eq(sellerSkuMappings.shopId, shopId),
        eq(sellerSkuMappings.sellerSku, code),
      ),
    )
    .limit(1)
  if (mapping?.variantId && mapping.status === 'active') {
    return { variantId: mapping.variantId, mappingStatus: 'ok' }
  }
  if (mapping?.status === 'pending') {
    return { variantId: mapping.variantId ?? null, mappingStatus: 'pending' }
  }

  const [variant] = await db
    .select()
    .from(productVariants)
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        or(eq(productVariants.skuCode, code), eq(productVariants.sku, code)),
      ),
    )
    .limit(1)
  if (variant) {
    const [existingMap] = await db
      .select({ id: sellerSkuMappings.id })
      .from(sellerSkuMappings)
      .where(
        and(
          eq(sellerSkuMappings.organizationId, organizationId),
          eq(sellerSkuMappings.shopId, shopId),
          eq(sellerSkuMappings.sellerSku, code),
        ),
      )
      .limit(1)
    if (!existingMap) {
      await db.insert(sellerSkuMappings).values({
        id: createId(),
        organizationId,
        shopId,
        sellerSku: code,
        variantId: variant.id,
        status: 'active',
        source: 'auto',
        platformSkuId: code,
      })
    }
    return { variantId: variant.id, mappingStatus: 'ok' }
  }
  return { variantId: null, mappingStatus: 'exception' }
}

async function findBalanceForVariant(
  db: DbLike,
  organizationId: string,
  warehouseCode: string,
  variantId: string,
  preferredBin?: string | null,
) {
  if (preferredBin) {
    const [exact] = await db
      .select()
      .from(inventoryBalances)
      .where(
        and(
          eq(inventoryBalances.organizationId, organizationId),
          eq(inventoryBalances.warehouseCode, warehouseCode),
          eq(inventoryBalances.binCode, preferredBin),
          eq(inventoryBalances.variantId, variantId),
        ),
      )
      .limit(1)
    if (exact) return exact
  }
  const rows = await db
    .select()
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.organizationId, organizationId),
        eq(inventoryBalances.warehouseCode, warehouseCode),
        eq(inventoryBalances.variantId, variantId),
      ),
    )
    .orderBy(desc(inventoryBalances.onHand))
  const available = rows.find((r) => r.onHand - r.reserved > 0)
  return available ?? rows[0] ?? null
}

async function orderHasActiveReservation(
  db: DbLike,
  organizationId: string,
  orderId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: inventoryReservations.id })
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.organizationId, organizationId),
        eq(inventoryReservations.orderId, orderId),
        eq(inventoryReservations.status, 'active'),
      ),
    )
    .limit(1)
  return Boolean(row)
}

async function countOutboundsForOrder(
  db: DbLike,
  organizationId: string,
  orderId: string,
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(stockOutbounds)
    .where(
      and(
        eq(stockOutbounds.organizationId, organizationId),
        eq(stockOutbounds.orderId, orderId),
        sql`${stockOutbounds.status} <> 'cancelled'`,
      ),
    )
  return Number(row?.c ?? 0)
}

async function mapOrderDto(
  db: DbLike,
  organizationId: string,
  order: typeof orders.$inferSelect,
  shop?: typeof shops.$inferSelect | null,
): Promise<OrderDto> {
  const shopRow =
    shop ??
    (
      await db.select().from(shops).where(eq(shops.id, order.shopId)).limit(1)
    )[0] ??
    null
  const lines = await db
    .select()
    .from(orderLines)
    .where(and(eq(orderLines.organizationId, organizationId), eq(orderLines.orderId, order.id)))
    .orderBy(orderLines.externalLineId)

  let mappingStatus: 'ok' | 'pending' | 'exception' = 'ok'
  const lineDtos: OrderLineDto[] = []
  for (const line of lines) {
    let lineMapping: 'ok' | 'pending' | 'exception' = 'ok'
    if (!line.variantId) {
      lineMapping = 'exception'
      mappingStatus = 'exception'
    } else {
      const resolved = await resolveVariantBySellerSku(
        db,
        organizationId,
        order.shopId,
        line.sellerSku || line.sku || '',
      )
      lineMapping = resolved.mappingStatus
      if (lineMapping === 'exception') mappingStatus = 'exception'
      else if (lineMapping === 'pending' && mappingStatus === 'ok') mappingStatus = 'pending'
    }
    const meta = rawMeta(order)
    const binHint =
      (typeof meta.binByLine === 'object' &&
        meta.binByLine &&
        (meta.binByLine as Record<string, string>)[line.id]) ||
      DEFAULT_BIN
    lineDtos.push({
      id: line.id,
      externalLineId: line.externalLineId || '',
      sku: line.sku || line.sellerSku || '',
      sellerSku: line.sellerSku || line.sku || '',
      shopSku: line.shopSku || '',
      title: line.title || '',
      qty: line.qty,
      unitPrice: money(line.unitPrice),
      paidPrice: money(line.paidPrice),
      variantId: line.variantId || '',
      bin: String(binHint),
      warehouse: line.warehouseCode || DEFAULT_WAREHOUSE,
      fulfillmentStatus: line.fulfillmentStatus || '',
      platformStatus: line.platformStatus || '',
      mappingStatus: toUiMappingStatus(lineMapping),
    })
  }

  const reserved = await orderHasActiveReservation(db, organizationId, order.id)
  const shipmentCount = await countOutboundsForOrder(db, organizationId, order.id)
  const meta = rawMeta(order)
  const timeline = Array.isArray(meta.timeline)
    ? (meta.timeline as OrderTimelineStep[])
    : [
        {
          at: formatStamp(order.placedAt || order.createdAt),
          status: toUiOrderStatus(order.status),
          note: '订单落库',
          current: true,
        },
      ]
  const lastSyncedAt =
    typeof meta.lastSyncedAt === 'string'
      ? meta.lastSyncedAt
      : formatStamp(order.updatedAt)

  return {
    id: order.id,
    externalOrderId: order.externalOrderId,
    orderNumber: order.orderNumber || order.externalOrderId,
    shopId: order.shopId,
    externalShopId: shopRow?.externalShopId || '',
    shop: shopRow?.name || '—',
    platform: shopRow?.platform || 'unknown',
    status: order.status,
    statusLabel: toUiOrderStatus(order.status),
    platformStatus: order.platformStatus || '',
    fulfillmentStatus: order.fulfillmentStatus || '',
    currency: order.currency,
    totalAmount: money(order.totalAmount),
    shippingFee: money(order.shippingFee),
    voucherAmount: money(order.voucherAmount),
    buyerRegion: order.buyerRegion || '',
    paymentMethod: order.paymentMethod || '',
    buyerNote: order.buyerNote || '',
    placedAt: formatStamp(order.placedAt),
    paidAt: formatStamp(order.paidAt),
    platformUpdatedAt: formatStamp(order.platformUpdatedAt),
    lastSyncedAt,
    reserved,
    mappingStatus: toUiMappingStatus(mappingStatus),
    shipmentCount,
    warehouseCode:
      (typeof meta.warehouseCode === 'string' && meta.warehouseCode) ||
      lines[0]?.warehouseCode ||
      DEFAULT_WAREHOUSE,
    lines: lineDtos,
    timeline,
  }
}

function toListRow(dto: OrderDto): OrderListRow {
  const { lines, timeline: _t, buyerNote: _b, voucherAmount: _v, shippingFee: _s, ...rest } = dto
  return {
    ...rest,
    lineCount: lines.length,
    firstSku: lines[0]?.sku || '',
  }
}

export async function listOrders(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string; shopId?: string; platform?: string } = {},
): Promise<PaginatedResult<OrderListRow>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(orders.organizationId, organizationId)]
  if (input.status && input.status !== 'all') {
    filters.push(eq(orders.status, input.status))
  }
  if (input.shopId && input.shopId !== 'all') {
    filters.push(eq(orders.shopId, input.shopId))
  }
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(orders.externalOrderId, q),
        ilike(orders.orderNumber, q),
        ilike(orders.buyerRegion, q),
      )!,
    )
  }

  const where = and(...filters)
  const [totalRow] = await db.select({ c: count() }).from(orders).where(where)
  const total = Number(totalRow?.c ?? 0)
  const rows = await db
    .select({ order: orders, shop: shops })
    .from(orders)
    .leftJoin(shops, eq(orders.shopId, shops.id))
    .where(where)
    .orderBy(desc(orders.placedAt), desc(orders.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  let items: OrderListRow[] = []
  for (const row of rows) {
    const dto = await mapOrderDto(db, organizationId, row.order, row.shop)
    if (input.platform && input.platform !== 'all' && dto.platform !== input.platform) continue
    items.push(toListRow(dto))
  }
  return { items, total, page, pageSize }
}

export async function orderStats(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select({ status: orders.status, c: count() })
    .from(orders)
    .where(eq(orders.organizationId, organizationId))
    .groupBy(orders.status)
  const byStatus: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    byStatus[row.status] = Number(row.c)
    total += Number(row.c)
  }
  const [reservedRow] = await db
    .select({ c: count() })
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.organizationId, organizationId),
        eq(inventoryReservations.status, 'active'),
      ),
    )
  const [openOutbound] = await db
    .select({ c: count() })
    .from(stockOutbounds)
    .where(
      and(
        eq(stockOutbounds.organizationId, organizationId),
        sql`${stockOutbounds.status} not in ('posted', 'cancelled')`,
      ),
    )
  return {
    total,
    byStatus,
    reservedOrders: Number(reservedRow?.c ?? 0),
    openOutbounds: Number(openOutbound?.c ?? 0),
  }
}

export async function getOrder(
  db: AppDatabase | DbLike,
  organizationId: string,
  id: string,
): Promise<OrderDto | null> {
  const [row] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, organizationId),
        or(eq(orders.id, id), eq(orders.externalOrderId, id)),
      ),
    )
    .limit(1)
  if (!row) return null
  return mapOrderDto(db, organizationId, row)
}

async function appendTimeline(
  existing: Record<string, unknown>,
  step: OrderTimelineStep,
): Promise<Record<string, unknown>> {
  const timeline = Array.isArray(existing.timeline)
    ? (existing.timeline as OrderTimelineStep[]).map((s) => ({ ...s, current: false }))
    : []
  timeline.push({ ...step, current: true })
  return { ...existing, timeline, lastSyncedAt: step.at || formatStamp(new Date()) }
}

/**
 * 幂等 upsert 订单 + 行；可选自动占库（Q07）。
 */
export async function upsertOrderFromSync(
  db: AppDatabase,
  organizationId: string,
  input: SyncOrderInput,
): Promise<OrderDto> {
  return db.transaction(async (tx) => {
    const shop = await resolveShop(tx, organizationId, {
      shopId: input.shopId,
      externalShopId: input.externalShopId,
      platform: input.platform,
    })
    const status = input.status || 'paid'
    const now = new Date()
    const [existing] = await tx
      .select()
      .from(orders)
      .where(
        and(eq(orders.shopId, shop.id), eq(orders.externalOrderId, input.externalOrderId)),
      )
      .limit(1)

    let orderId = existing?.id
    const baseMeta = existing ? rawMeta(existing) : {}
    const meta = await appendTimeline(baseMeta, {
      at: formatStamp(now),
      status: toUiOrderStatus(status),
      note: existing ? '增量同步更新' : '同步落库',
    })
    meta.warehouseCode = input.warehouseCode || DEFAULT_WAREHOUSE

    if (!orderId) {
      orderId = createId()
      await tx.insert(orders).values({
        id: orderId,
        organizationId,
        shopId: shop.id,
        externalOrderId: input.externalOrderId,
        orderNumber: input.orderNumber || input.externalOrderId,
        status,
        platformStatus: input.platformStatus || 'pending',
        fulfillmentStatus: input.fulfillmentStatus || 'unfulfilled',
        placedAt: input.placedAt ? new Date(input.placedAt) : now,
        paidAt: input.paidAt ? new Date(input.paidAt) : status === 'paid' ? now : null,
        platformUpdatedAt: input.platformUpdatedAt ? new Date(input.platformUpdatedAt) : now,
        currency: input.currency || shop.currency || 'USD',
        totalAmount: String(input.totalAmount ?? 0),
        shippingFee: String(input.shippingFee ?? 0),
        voucherAmount: String(input.voucherAmount ?? 0),
        buyerRegion: input.buyerRegion || '',
        paymentMethod: input.paymentMethod || '',
        buyerNote: input.buyerNote || '',
        raw: meta,
      })
    } else {
      await tx
        .update(orders)
        .set({
          orderNumber: input.orderNumber || existing!.orderNumber,
          status,
          platformStatus: input.platformStatus || existing!.platformStatus,
          fulfillmentStatus: input.fulfillmentStatus || existing!.fulfillmentStatus,
          paidAt: input.paidAt
            ? new Date(input.paidAt)
            : existing!.paidAt || (status === 'paid' ? now : null),
          platformUpdatedAt: input.platformUpdatedAt
            ? new Date(input.platformUpdatedAt)
            : now,
          currency: input.currency || existing!.currency,
          totalAmount: String(input.totalAmount ?? existing!.totalAmount ?? 0),
          shippingFee: String(input.shippingFee ?? existing!.shippingFee ?? 0),
          voucherAmount: String(input.voucherAmount ?? existing!.voucherAmount ?? 0),
          buyerRegion: input.buyerRegion ?? existing!.buyerRegion,
          paymentMethod: input.paymentMethod ?? existing!.paymentMethod,
          buyerNote: input.buyerNote ?? existing!.buyerNote,
          raw: meta,
          updatedAt: now,
        })
        .where(eq(orders.id, orderId))
    }

    const binByLine: Record<string, string> = {}
    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i]!
      const externalLineId = line.externalLineId || `${input.externalOrderId}-${i + 1}`
      const resolved = await resolveVariantBySellerSku(
        tx,
        organizationId,
        shop.id,
        line.sellerSku || line.sku || '',
      )
      const [existLine] = await tx
        .select()
        .from(orderLines)
        .where(
          and(eq(orderLines.orderId, orderId), eq(orderLines.externalLineId, externalLineId)),
        )
        .limit(1)
      const values = {
        organizationId,
        orderId,
        externalLineId,
        shopSku: line.shopSku || line.sellerSku || '',
        sku: line.sku || line.sellerSku || '',
        sellerSku: line.sellerSku || line.sku || '',
        platformSkuId: line.sellerSku || line.sku || '',
        title: line.title || '',
        qty: line.qty,
        unitPrice: String(line.unitPrice ?? 0),
        paidPrice: String(line.paidPrice ?? line.unitPrice ?? 0),
        variantId: resolved.variantId,
        fulfillmentStatus: 'unfulfilled',
        platformStatus: line.platformStatus || input.platformStatus || '',
        warehouseCode: line.warehouseCode || input.warehouseCode || DEFAULT_WAREHOUSE,
      }
      let lineId = existLine?.id
      if (!lineId) {
        lineId = createId()
        await tx.insert(orderLines).values({ id: lineId, ...values })
      } else {
        await tx.update(orderLines).set(values).where(eq(orderLines.id, lineId))
      }
      binByLine[lineId] = line.binCode || DEFAULT_BIN
    }
    meta.binByLine = binByLine
    await tx.update(orders).set({ raw: meta, updatedAt: now }).where(eq(orders.id, orderId))

    const wantAuto =
      input.autoReserve !== false && shouldAutoReserve(status)
    if (wantAuto) {
      try {
        await reserveOrderInternal(tx, organizationId, orderId, 'sync-auto', false)
      } catch {
        // 映射异常 / 库存不足：保留订单，人工补锁
      }
    }

    return (await getOrder(tx, organizationId, orderId))!
  })
}

/**
 * Stub 适配器：人工触发增量同步（演示订单 → 真实 DB upsert）。
 * 真实平台 API 可替换 fetchStubPlatformOrders。
 */
export async function syncOrdersIncremental(
  db: AppDatabase,
  organizationId: string,
  input: { shopId?: string; limit?: number } = {},
): Promise<{ upserted: number; reserved: number; orders: OrderListRow[] }> {
  const stub = await fetchStubPlatformOrders(db, organizationId, input.shopId)
  const limit = Math.min(input.limit ?? stub.length, 50)
  const slice = stub.slice(0, limit)
  const results: OrderListRow[] = []
  let reserved = 0
  for (const item of slice) {
    const dto = await upsertOrderFromSync(db, organizationId, item)
    results.push(toListRow(dto))
    if (dto.reserved) reserved += 1
  }
  return { upserted: results.length, reserved, orders: results }
}

async function fetchStubPlatformOrders(
  db: DbLike,
  organizationId: string,
  shopId?: string,
): Promise<SyncOrderInput[]> {
  const shop = await resolveShop(db, organizationId, {
    shopId,
    externalShopId: 'dz-lk-88021',
    platform: 'daraz',
    name: 'Daraz LK · Demo',
  })
  const skus = ['HSY000001001', 'HSY000001002']
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  return [
    {
      externalOrderId: `DZ-${stamp}-1001`,
      orderNumber: `DZ-${stamp}-1001`,
      shopId: shop.id,
      externalShopId: shop.externalShopId || undefined,
      platform: shop.platform,
      status: 'paid',
      platformStatus: 'pending',
      fulfillmentStatus: 'unfulfilled',
      currency: shop.currency || 'LKR',
      totalAmount: 59.9,
      shippingFee: 2.5,
      buyerRegion: 'Colombo',
      paymentMethod: 'COD',
      placedAt: now.toISOString(),
      paidAt: now.toISOString(),
      warehouseCode: DEFAULT_WAREHOUSE,
      lines: [
        {
          externalLineId: `DZ-${stamp}-1001-1`,
          sellerSku: skus[0]!,
          sku: skus[0]!,
          title: '基础圆领短袖 T 恤 · 黑色 L',
          qty: 2,
          unitPrice: 24.95,
          paidPrice: 24.95,
          binCode: DEFAULT_BIN,
        },
      ],
    },
    {
      externalOrderId: `DZ-${stamp}-1002`,
      orderNumber: `DZ-${stamp}-1002`,
      shopId: shop.id,
      externalShopId: shop.externalShopId || undefined,
      platform: shop.platform,
      status: 'paid',
      platformStatus: 'pending',
      currency: shop.currency || 'LKR',
      totalAmount: 28.0,
      buyerRegion: 'Kandy',
      paymentMethod: 'Online',
      placedAt: now.toISOString(),
      paidAt: now.toISOString(),
      warehouseCode: DEFAULT_WAREHOUSE,
      lines: [
        {
          externalLineId: `DZ-${stamp}-1002-1`,
          sellerSku: skus[1]!,
          sku: skus[1]!,
          title: '基础圆领短袖 T 恤 · 白色 L',
          qty: 1,
          unitPrice: 28,
          paidPrice: 28,
          binCode: 'A-01-02',
        },
      ],
    },
  ]
}

async function reserveOrderInternal(
  db: DbLike,
  organizationId: string,
  orderId: string,
  operator: string,
  throwIfAlready: boolean,
): Promise<OrderDto> {
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.organizationId, organizationId), eq(orders.id, orderId)))
    .limit(1)
  if (!order) throw new Error('订单不存在')
  if (['shipped', 'delivered', 'cancelled'].includes(order.status)) {
    throw new Error(`订单状态 ${order.status} 不可占库`)
  }

  const already = await orderHasActiveReservation(db, organizationId, order.id)
  if (already) {
    if (throwIfAlready) throw new Error('订单已占库')
    return (await getOrder(db, organizationId, order.id))!
  }

  const lines = await db
    .select()
    .from(orderLines)
    .where(and(eq(orderLines.organizationId, organizationId), eq(orderLines.orderId, order.id)))
  if (lines.length === 0) throw new Error('订单无明细，无法占库')
  if (lines.some((l) => !l.variantId)) throw new Error('存在未映射 SKU，请先修复映射再占库')

  const warehouse =
    (typeof rawMeta(order).warehouseCode === 'string' &&
      (rawMeta(order).warehouseCode as string)) ||
    lines[0]?.warehouseCode ||
    DEFAULT_WAREHOUSE
  const binByLine = (rawMeta(order).binByLine as Record<string, string> | undefined) || {}

  for (const line of lines) {
    const qty = line.qty
    if (qty <= 0) continue
    const preferredBin = binByLine[line.id] || DEFAULT_BIN
    const balance = await findBalanceForVariant(
      db,
      organizationId,
      warehouse,
      line.variantId!,
      preferredBin,
    )
    if (!balance) throw new Error(`SKU ${line.sku || line.sellerSku} 无库存余额，无法占库`)
    const available = balance.onHand - balance.reserved
    if (available < qty) {
      throw new Error(
        `SKU ${line.sku || line.sellerSku} 可用库存不足（可用 ${available}，需要 ${qty}）`,
      )
    }

    const idem = `ledger:order_reserve:${order.externalOrderId}:${line.id}`
    const [dup] = await db
      .select({ id: inventoryMovements.id })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.organizationId, organizationId),
          eq(inventoryMovements.idempotencyKey, idem),
        ),
      )
      .limit(1)

    const reservedAfter = balance.reserved + qty
    if (!dup) {
      await db
        .update(inventoryBalances)
        .set({
          reserved: reservedAfter,
          version: balance.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(inventoryBalances.id, balance.id))

      await db.insert(inventoryMovements).values({
        id: createId(),
        organizationId,
        shopId: order.shopId,
        variantId: line.variantId!,
        warehouseCode: balance.warehouseCode,
        binCode: balance.binCode,
        movementType: 'order_reserve',
        qtyDelta: 0,
        onHandAfter: balance.onHand,
        reservedAfter,
        qcHoldAfter: balance.qcHold,
        damagedAfter: balance.damaged,
        sourceType: 'order',
        sourceId: order.id,
        operator,
        idempotencyKey: idem,
        occurredAt: new Date(),
        raw: {
          externalOrderId: order.externalOrderId,
          orderLineId: line.id,
          reason: '订单锁定',
          qty,
        },
      })
    }

    const [existRes] = await db
      .select({ id: inventoryReservations.id })
      .from(inventoryReservations)
      .where(
        and(
          eq(inventoryReservations.shopId, order.shopId),
          eq(inventoryReservations.orderLineId, line.id),
        ),
      )
      .limit(1)
    if (!existRes) {
      await db.insert(inventoryReservations).values({
        id: createId(),
        organizationId,
        shopId: order.shopId,
        orderId: order.id,
        orderLineId: line.id,
        variantId: line.variantId!,
        warehouseCode: balance.warehouseCode,
        binCode: balance.binCode,
        qty,
        status: 'active',
        reservedAt: new Date(),
      })
    } else {
      await db
        .update(inventoryReservations)
        .set({
          status: 'active',
          qty,
          warehouseCode: balance.warehouseCode,
          binCode: balance.binCode,
          reservedAt: new Date(),
          releasedAt: null,
          committedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(inventoryReservations.id, existRes.id))
    }
  }

  const meta = await appendTimeline(rawMeta(order), {
    at: formatStamp(new Date()),
    status: '已占库',
    note: `占库操作人 ${operator}`,
  })
  const nextStatus = order.status === 'created' ? 'paid' : order.status
  await db
    .update(orders)
    .set({
      status: nextStatus === 'paid' ? 'ready_to_ship' : nextStatus,
      fulfillmentStatus: 'reserved',
      raw: meta,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id))

  return (await getOrder(db, organizationId, order.id))!
}

export async function confirmReserveOrder(
  db: AppDatabase,
  organizationId: string,
  orderId: string,
  operator?: string,
): Promise<OrderDto> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.organizationId, organizationId),
          or(eq(orders.id, orderId), eq(orders.externalOrderId, orderId)),
        ),
      )
      .limit(1)
    if (!row) throw new Error('订单不存在')
    return reserveOrderInternal(tx, organizationId, row.id, operator?.trim() || '当前用户', true)
  })
}

export async function releaseOrderReservations(
  db: AppDatabase,
  organizationId: string,
  orderId: string,
  operator?: string,
): Promise<OrderDto> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.organizationId, organizationId),
          or(eq(orders.id, orderId), eq(orders.externalOrderId, orderId)),
        ),
      )
      .limit(1)
    if (!order) throw new Error('订单不存在')
    const actor = operator?.trim() || '当前用户'
    const reservations = await tx
      .select()
      .from(inventoryReservations)
      .where(
        and(
          eq(inventoryReservations.organizationId, organizationId),
          eq(inventoryReservations.orderId, order.id),
          eq(inventoryReservations.status, 'active'),
        ),
      )
    for (const res of reservations) {
      const idem = `ledger:order_release:${order.externalOrderId}:${res.orderLineId}`
      const [dup] = await tx
        .select({ id: inventoryMovements.id })
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.organizationId, organizationId),
            eq(inventoryMovements.idempotencyKey, idem),
          ),
        )
        .limit(1)
      const [balance] = await tx
        .select()
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.organizationId, organizationId),
            eq(inventoryBalances.warehouseCode, res.warehouseCode),
            eq(inventoryBalances.variantId, res.variantId),
            res.binCode
              ? eq(inventoryBalances.binCode, res.binCode)
              : sql`${inventoryBalances.binCode} is not null`,
          ),
        )
        .limit(1)
      if (balance && !dup) {
        const reservedAfter = Math.max(0, balance.reserved - res.qty)
        await tx
          .update(inventoryBalances)
          .set({
            reserved: reservedAfter,
            version: balance.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(inventoryBalances.id, balance.id))
        await tx.insert(inventoryMovements).values({
          id: createId(),
          organizationId,
          shopId: order.shopId,
          variantId: res.variantId,
          warehouseCode: balance.warehouseCode,
          binCode: balance.binCode,
          movementType: 'order_release',
          qtyDelta: 0,
          onHandAfter: balance.onHand,
          reservedAfter,
          qcHoldAfter: balance.qcHold,
          damagedAfter: balance.damaged,
          sourceType: 'order',
          sourceId: order.id,
          operator: actor,
          idempotencyKey: idem,
          occurredAt: new Date(),
          raw: { reason: '订单释放占库', qty: res.qty, orderLineId: res.orderLineId },
        })
      }
      await tx
        .update(inventoryReservations)
        .set({ status: 'released', releasedAt: new Date(), updatedAt: new Date() })
        .where(eq(inventoryReservations.id, res.id))
    }
    const meta = await appendTimeline(rawMeta(order), {
      at: formatStamp(new Date()),
      status: '已释放占库',
      note: `操作人 ${actor}`,
    })
    await tx
      .update(orders)
      .set({ fulfillmentStatus: 'unfulfilled', raw: meta, updatedAt: new Date() })
      .where(eq(orders.id, order.id))
    return (await getOrder(tx, organizationId, order.id))!
  })
}

async function nextOutboundNo(db: DbLike, organizationId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `OB-${year}-`
  const [row] = await db
    .select({ outboundNo: stockOutbounds.outboundNo })
    .from(stockOutbounds)
    .where(
      and(
        eq(stockOutbounds.organizationId, organizationId),
        ilike(stockOutbounds.outboundNo, `${prefix}%`),
      ),
    )
    .orderBy(desc(stockOutbounds.outboundNo))
    .limit(1)
  const last = row?.outboundNo?.slice(prefix.length) || '0'
  const n = Number.parseInt(last, 10)
  const next = Number.isFinite(n) ? n + 1 : 1
  return `${prefix}${String(next).padStart(4, '0')}`
}

async function mapOutboundDto(
  db: DbLike,
  organizationId: string,
  row: typeof stockOutbounds.$inferSelect,
): Promise<OutboundDto> {
  const lines = await db
    .select()
    .from(stockOutboundLines)
    .where(
      and(
        eq(stockOutboundLines.organizationId, organizationId),
        eq(stockOutboundLines.stockOutboundId, row.id),
      ),
    )
    .orderBy(stockOutboundLines.lineNo)
  const lineDtos: OutboundLineDto[] = lines.map((l) => ({
    id: l.id,
    lineNo: l.lineNo,
    orderLineId: l.orderLineId || '',
    sku: l.skuCode,
    variantId: l.variantId,
    bin: l.binCode,
    qty: l.qty,
    note: l.note || '',
  }))
  return {
    id: row.id,
    outboundNo: row.outboundNo,
    outboundType: toUiOutboundType(row.outboundType),
    status: toUiOutboundStatus(row.status),
    warehouse: row.warehouseCode,
    shopId: row.shopId || '',
    orderId: row.orderId || '',
    externalOrderId: row.externalOrderId || '',
    packageId: row.packageId || row.outboundNo,
    picker: row.picker || '',
    reason: row.reason || '',
    remark: row.remark || '',
    idempotencyKey: row.idempotencyKey,
    createdAt: formatStamp(row.createdAt),
    pickedAt: formatStamp(row.pickedAt),
    reviewedAt: formatStamp(row.reviewedAt),
    postedAt: formatStamp(row.postedAt),
    lines: lineDtos,
    totalQty: lineDtos.reduce((s, l) => s + l.qty, 0),
  }
}

function toOutboundListRow(dto: OutboundDto): OutboundListRow {
  const { lines, ...rest } = dto
  return {
    ...rest,
    lineCount: lines.length,
    firstSku: lines[0]?.sku || '',
  }
}

export async function listOutbounds(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string } = {},
): Promise<PaginatedResult<OutboundListRow>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(stockOutbounds.organizationId, organizationId)]
  if (input.status && input.status !== 'all') {
    const dbStatus =
      input.status === '待拣货' ||
      input.status === '拣货中' ||
      input.status === '已复核' ||
      input.status === '已出库' ||
      input.status === '已取消'
        ? (
            {
              待拣货: 'pending_pick',
              拣货中: 'picking',
              已复核: 'reviewed',
              已出库: 'posted',
              已取消: 'cancelled',
            } as Record<string, string>
          )[input.status]
        : input.status
    if (dbStatus) filters.push(eq(stockOutbounds.status, dbStatus))
  }
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(stockOutbounds.outboundNo, q),
        ilike(stockOutbounds.externalOrderId, q),
        ilike(stockOutbounds.packageId, q),
      )!,
    )
  }
  const where = and(...filters)
  const [totalRow] = await db.select({ c: count() }).from(stockOutbounds).where(where)
  const rows = await db
    .select()
    .from(stockOutbounds)
    .where(where)
    .orderBy(desc(stockOutbounds.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const items: OutboundListRow[] = []
  for (const row of rows) {
    items.push(toOutboundListRow(await mapOutboundDto(db, organizationId, row)))
  }
  return { items, total: Number(totalRow?.c ?? 0), page, pageSize }
}

export async function outboundStats(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select({ status: stockOutbounds.status, c: count() })
    .from(stockOutbounds)
    .where(eq(stockOutbounds.organizationId, organizationId))
    .groupBy(stockOutbounds.status)
  const byStatus: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    byStatus[toUiOutboundStatus(row.status)] = Number(row.c)
    total += Number(row.c)
  }
  return { total, byStatus }
}

export async function getOutbound(
  db: AppDatabase | DbLike,
  organizationId: string,
  id: string,
): Promise<OutboundDto | null> {
  const [row] = await db
    .select()
    .from(stockOutbounds)
    .where(
      and(
        eq(stockOutbounds.organizationId, organizationId),
        or(
          eq(stockOutbounds.id, id),
          eq(stockOutbounds.outboundNo, id),
          eq(stockOutbounds.packageId, id),
        ),
      ),
    )
    .limit(1)
  if (!row) return null
  return mapOutboundDto(db, organizationId, row)
}

export async function createOutboundFromOrder(
  db: AppDatabase,
  organizationId: string,
  orderId: string,
  input: { picker?: string; remark?: string } = {},
): Promise<OutboundDto> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.organizationId, organizationId),
          or(eq(orders.id, orderId), eq(orders.externalOrderId, orderId)),
        ),
      )
      .limit(1)
    if (!order) throw new Error('订单不存在')
    const reserved = await orderHasActiveReservation(tx, organizationId, order.id)
    if (!reserved) throw new Error('请先确认占库再创建出库单')

    const [existing] = await tx
      .select()
      .from(stockOutbounds)
      .where(
        and(
          eq(stockOutbounds.organizationId, organizationId),
          eq(stockOutbounds.orderId, order.id),
          sql`${stockOutbounds.status} <> 'cancelled'`,
        ),
      )
      .limit(1)
    if (existing) return (await getOutbound(tx, organizationId, existing.id))!

    const lines = await tx
      .select()
      .from(orderLines)
      .where(and(eq(orderLines.organizationId, organizationId), eq(orderLines.orderId, order.id)))
    if (lines.length === 0) throw new Error('订单无明细')

    const reservations = await tx
      .select()
      .from(inventoryReservations)
      .where(
        and(
          eq(inventoryReservations.organizationId, organizationId),
          eq(inventoryReservations.orderId, order.id),
          eq(inventoryReservations.status, 'active'),
        ),
      )
    const resByLine = new Map(reservations.map((r) => [r.orderLineId, r]))
    const warehouse =
      (typeof rawMeta(order).warehouseCode === 'string' &&
        (rawMeta(order).warehouseCode as string)) ||
      lines[0]?.warehouseCode ||
      DEFAULT_WAREHOUSE

    const outboundNo = await nextOutboundNo(tx, organizationId)
    const packageId = `PKG-${order.externalOrderId}`
    const outboundId = createId()
    const idempotencyKey = `outbound:order:${order.externalOrderId}`

    await tx.insert(stockOutbounds).values({
      id: outboundId,
      organizationId,
      outboundNo,
      outboundType: 'order',
      warehouseCode: warehouse,
      shopId: order.shopId,
      orderId: order.id,
      externalOrderId: order.externalOrderId,
      packageId,
      picker: input.picker?.trim() || '',
      status: 'pending_pick',
      idempotencyKey,
      remark: input.remark || '',
    })

    let lineNo = 1
    for (const line of lines) {
      const res = resByLine.get(line.id)
      if (!line.variantId) continue
      await tx.insert(stockOutboundLines).values({
        id: createId(),
        organizationId,
        stockOutboundId: outboundId,
        lineNo: lineNo++,
        orderLineId: line.id,
        variantId: line.variantId,
        skuCode: line.sku || line.sellerSku || '',
        binCode: res?.binCode || DEFAULT_BIN,
        qty: line.qty,
      })
    }

    const meta = await appendTimeline(rawMeta(order), {
      at: formatStamp(new Date()),
      status: '待拣货',
      note: `已创建出库单 ${outboundNo}`,
    })
    await tx
      .update(orders)
      .set({ fulfillmentStatus: 'picking', raw: meta, updatedAt: new Date() })
      .where(eq(orders.id, order.id))

    return (await getOutbound(tx, organizationId, outboundId))!
  })
}

const ADVANCE: Record<string, string> = {
  pending_pick: 'picking',
  picking: 'reviewed',
  reviewed: 'posted',
}

export async function advanceOutbound(
  db: AppDatabase,
  organizationId: string,
  outboundId: string,
  operator?: string,
): Promise<OutboundDto> {
  const current = await getOutbound(db, organizationId, outboundId)
  if (!current) throw new Error('出库单不存在')
  const dbStatus = (
    {
      待拣货: 'pending_pick',
      拣货中: 'picking',
      已复核: 'reviewed',
      已出库: 'posted',
      已取消: 'cancelled',
    } as Record<string, string>
  )[current.status]
  if (!dbStatus || dbStatus === 'posted' || dbStatus === 'cancelled') {
    throw new Error(`出库单状态「${current.status}」不可推进`)
  }
  const next = ADVANCE[dbStatus]
  if (!next) throw new Error('无法推进状态')
  if (next === 'posted') {
    return postOutbound(db, organizationId, current.id, operator)
  }
  return db.transaction(async (tx) => {
    const patch: Record<string, unknown> = {
      status: next,
      updatedAt: new Date(),
    }
    if (operator?.trim()) patch.picker = operator.trim()
    if (next === 'picking') patch.pickedAt = new Date()
    if (next === 'reviewed') patch.reviewedAt = new Date()
    await tx.update(stockOutbounds).set(patch).where(eq(stockOutbounds.id, current.id))
    return (await getOutbound(tx, organizationId, current.id))!
  })
}

export async function postOutbound(
  db: AppDatabase,
  organizationId: string,
  outboundId: string,
  operator?: string,
): Promise<OutboundDto> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(stockOutbounds)
      .where(
        and(
          eq(stockOutbounds.organizationId, organizationId),
          or(
            eq(stockOutbounds.id, outboundId),
            eq(stockOutbounds.outboundNo, outboundId),
            eq(stockOutbounds.packageId, outboundId),
          ),
        ),
      )
      .limit(1)
    if (!row) throw new Error('出库单不存在')
    if (row.status === 'posted') return (await getOutbound(tx, organizationId, row.id))!
    if (row.status === 'cancelled') throw new Error('已取消出库单不可过账')
    if (row.status !== 'reviewed' && row.status !== 'picking' && row.status !== 'pending_pick') {
      // allow from reviewed primarily; also tolerate picking for demo advance
    }
    const actor = operator?.trim() || row.picker || '当前用户'
    const lines = await tx
      .select()
      .from(stockOutboundLines)
      .where(
        and(
          eq(stockOutboundLines.organizationId, organizationId),
          eq(stockOutboundLines.stockOutboundId, row.id),
        ),
      )
    if (lines.length === 0) throw new Error('出库单无明细')

    for (const line of lines) {
      const lineIdem = `${row.idempotencyKey}:${line.skuCode}:${line.lineNo}`
      const [dup] = await tx
        .select({ id: inventoryMovements.id })
        .from(inventoryMovements)
        .where(
          and(
            eq(inventoryMovements.organizationId, organizationId),
            eq(inventoryMovements.idempotencyKey, lineIdem),
          ),
        )
        .limit(1)
      if (dup) continue

      const [balance] = await tx
        .select()
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.organizationId, organizationId),
            eq(inventoryBalances.warehouseCode, row.warehouseCode),
            eq(inventoryBalances.binCode, line.binCode),
            eq(inventoryBalances.variantId, line.variantId),
          ),
        )
        .limit(1)
      if (!balance) throw new Error(`库位 ${line.binCode} / SKU ${line.skuCode} 无余额，无法出库`)
      if (balance.onHand < line.qty) {
        throw new Error(`SKU ${line.skuCode} 在手不足（${balance.onHand} < ${line.qty}）`)
      }
      const onHandAfter = balance.onHand - line.qty
      const reservedAfter = Math.max(0, balance.reserved - line.qty)
      await tx
        .update(inventoryBalances)
        .set({
          onHand: onHandAfter,
          reserved: reservedAfter,
          version: balance.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(inventoryBalances.id, balance.id))
      await tx.insert(inventoryMovements).values({
        id: createId(),
        organizationId,
        shopId: row.shopId,
        variantId: line.variantId,
        warehouseCode: row.warehouseCode,
        binCode: line.binCode,
        movementType: 'order_ship',
        qtyDelta: -line.qty,
        onHandAfter,
        reservedAfter,
        qcHoldAfter: balance.qcHold,
        damagedAfter: balance.damaged,
        sourceType: 'stock_outbound',
        sourceId: row.id,
        operator: actor,
        idempotencyKey: lineIdem,
        occurredAt: new Date(),
        raw: {
          outboundNo: row.outboundNo,
          externalOrderId: row.externalOrderId,
          reason: '订单出库',
        },
      })

      if (line.orderLineId) {
        await tx
          .update(inventoryReservations)
          .set({ status: 'committed', committedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(inventoryReservations.organizationId, organizationId),
              eq(inventoryReservations.orderLineId, line.orderLineId),
              eq(inventoryReservations.status, 'active'),
            ),
          )
      }
    }

    await tx
      .update(stockOutbounds)
      .set({
        status: 'posted',
        picker: actor,
        postedAt: new Date(),
        reviewedAt: row.reviewedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(stockOutbounds.id, row.id))

    if (row.orderId) {
      const [order] = await tx.select().from(orders).where(eq(orders.id, row.orderId)).limit(1)
      if (order) {
        const meta = await appendTimeline(rawMeta(order), {
          at: formatStamp(new Date()),
          status: '已发货',
          note: `出库过账 ${row.outboundNo}`,
        })
        await tx
          .update(orders)
          .set({
            status: 'shipped',
            fulfillmentStatus: 'shipped',
            raw: meta,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id))
      }
    }

    return (await getOutbound(tx, organizationId, row.id))!
  })
}

export async function cancelOutbound(
  db: AppDatabase,
  organizationId: string,
  outboundId: string,
  reason?: string,
): Promise<OutboundDto> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(stockOutbounds)
      .where(
        and(
          eq(stockOutbounds.organizationId, organizationId),
          or(
            eq(stockOutbounds.id, outboundId),
            eq(stockOutbounds.outboundNo, outboundId),
          ),
        ),
      )
      .limit(1)
    if (!row) throw new Error('出库单不存在')
    if (row.status === 'posted') throw new Error('已出库不可取消')
    if (row.status === 'cancelled') return (await getOutbound(tx, organizationId, row.id))!
    await tx
      .update(stockOutbounds)
      .set({
        status: 'cancelled',
        reason: reason?.trim() || row.reason,
        updatedAt: new Date(),
      })
      .where(eq(stockOutbounds.id, row.id))
    return (await getOutbound(tx, organizationId, row.id))!
  })
}

export async function importOrders(
  db: AppDatabase,
  organizationId: string,
  items: SyncOrderInput[],
): Promise<{ upserted: number; orders: OrderListRow[] }> {
  const out: OrderListRow[] = []
  for (const item of items) {
    const dto = await upsertOrderFromSync(db, organizationId, item)
    out.push(toListRow(dto))
  }
  return { upserted: out.length, orders: out }
}

void sql
