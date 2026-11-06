/**
 * LGS / 物流履约 dataaccess（模块4）。
 * 包裹 + 轨迹 + LGS/JSB 交接批次；平台轨迹经 apps/api OpenAPI 同步；DB 真实。
 */
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  fulfillmentAttempts,
  fulfillmentBatchPackages,
  fulfillmentBatches,
  orderLines,
  orders,
  shipmentItems,
  shipments,
  shops,
  trackingEvents,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  defaultProviderTypeForPlatform,
  eventMeta,
  formatStamp,
  labelProviderType,
  parseEventTime,
  toUiBatchStatus,
  toUiProviderType,
  toUiShipmentStatus,
  toUiTrackingSource,
  type UiBatchStatus,
  type UiProviderType,
  type UiShipmentStatus,
  type UiTrackingSource,
} from '@/lib/server/mappers/logistics'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'
import * as syncDa from '@/lib/server/dataaccess/sync'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

const DEFAULT_WAREHOUSE = 'WH-CN-XMN-001'

export type TrackingEventDto = {
  id: string
  statusCode: string
  title: string
  description: string
  location: string
  eventTime: string
  source: string
  sourceLabel: UiTrackingSource
}

export type ShipmentItemDto = {
  id: string
  orderLineId: string
  qty: number
  sku: string
  title: string
}

export type ShipmentDto = {
  id: string
  externalPackageId: string
  packageId: string
  orderId: string
  order: string
  shopId: string
  shop: string
  platform: string
  site: string
  tracking: string
  trackingNumber: string
  carrier: string
  providerCode: string
  providerType: string
  providerLabel: UiProviderType
  mode: string
  warehouse: string
  status: string
  statusLabel: UiShipmentStatus
  platformStatus: string
  rtsAt: string
  shippedAt: string
  deliveredAt: string
  weight: string
  items: number
  skus: string
  picker: string
  remark: string
  lastSyncedAt: string
  integrationStatus: 'synced' | 'pending' | 'error'
  events: TrackingEventDto[]
  lines: ShipmentItemDto[]
  batchIds: string[]
}

export type ShipmentListRow = Omit<ShipmentDto, 'events' | 'lines' | 'batchIds' | 'remark' | 'picker'> & {
  eventCount: number
  lastEvent: string
}

export type BatchPackageDto = {
  shipmentId: string
  externalPackageId: string
  trackingNumber: string
  order: string
  status: string
  statusLabel: UiShipmentStatus
}

export type FulfillmentBatchDto = {
  id: string
  batchNo: string
  channel: string
  site: string
  country: string
  warehouseCode: string
  status: string
  statusLabel: UiBatchStatus
  carrier: string
  trackingSummary: string
  packageCount: number
  handedOverAt: string
  submittedAt: string
  createdAt: string
  packages: BatchPackageDto[]
  events: string[]
  /** 兼容旧 DEMO 字段 */
  departedAt?: string
  jsbHandover?: string
  customs?: string
  lastMile?: string
  signedAt?: string
  fee?: string
}

export type FulfillmentBatchListRow = Omit<FulfillmentBatchDto, 'packages' | 'events'> & {
  tracking: string
  packages: number
  handedOver: string
}

function rawMeta(row: { raw?: unknown }): Record<string, unknown> {
  const raw = row.raw
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  return {}
}

function stampOrEmpty(d: Date | string | null | undefined): string {
  return formatStamp(d) || ''
}

async function loadShopMap(db: DbLike, organizationId: string, shopIds: string[]) {
  if (shopIds.length === 0) return new Map<string, typeof shops.$inferSelect>()
  const rows = await db
    .select()
    .from(shops)
    .where(and(eq(shops.organizationId, organizationId), inArray(shops.id, shopIds)))
  return new Map(rows.map((r) => [r.id, r]))
}

async function loadOrderMap(db: DbLike, organizationId: string, orderIds: string[]) {
  if (orderIds.length === 0) return new Map<string, typeof orders.$inferSelect>()
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.organizationId, organizationId), inArray(orders.id, orderIds)))
  return new Map(rows.map((r) => [r.id, r]))
}

async function loadEventsByShipment(db: DbLike, organizationId: string, shipmentIds: string[]) {
  if (shipmentIds.length === 0) return new Map<string, TrackingEventDto[]>()
  const rows = await db
    .select()
    .from(trackingEvents)
    .where(
      and(
        eq(trackingEvents.organizationId, organizationId),
        inArray(trackingEvents.shipmentId, shipmentIds),
      ),
    )
    .orderBy(trackingEvents.eventTime)
  const map = new Map<string, TrackingEventDto[]>()
  for (const row of rows) {
    const list = map.get(row.shipmentId) ?? []
    list.push({
      id: row.id,
      statusCode: row.statusCode,
      title: row.title || row.statusCode,
      description: row.description || '',
      location: row.location || '',
      eventTime: stampOrEmpty(row.eventTime),
      source: row.source,
      sourceLabel: toUiTrackingSource(row.source),
    })
    map.set(row.shipmentId, list)
  }
  return map
}

async function loadItemsByShipment(db: DbLike, organizationId: string, shipmentIds: string[]) {
  if (shipmentIds.length === 0) return new Map<string, ShipmentItemDto[]>()
  const rows = await db
    .select({
      id: shipmentItems.id,
      shipmentId: shipmentItems.shipmentId,
      orderLineId: shipmentItems.orderLineId,
      qty: shipmentItems.qty,
      sellerSku: orderLines.sellerSku,
      title: orderLines.title,
      sku: orderLines.sku,
    })
    .from(shipmentItems)
    .leftJoin(orderLines, eq(shipmentItems.orderLineId, orderLines.id))
    .where(
      and(
        eq(shipmentItems.organizationId, organizationId),
        inArray(shipmentItems.shipmentId, shipmentIds),
      ),
    )
  const map = new Map<string, ShipmentItemDto[]>()
  for (const row of rows) {
    const list = map.get(row.shipmentId) ?? []
    list.push({
      id: row.id,
      orderLineId: row.orderLineId,
      qty: row.qty,
      sku: row.sellerSku || row.sku || '—',
      title: row.title || '',
    })
    map.set(row.shipmentId, list)
  }
  return map
}

async function loadBatchIdsByShipment(db: DbLike, organizationId: string, shipmentIds: string[]) {
  if (shipmentIds.length === 0) return new Map<string, string[]>()
  const rows = await db
    .select()
    .from(fulfillmentBatchPackages)
    .where(
      and(
        eq(fulfillmentBatchPackages.organizationId, organizationId),
        inArray(fulfillmentBatchPackages.shipmentId, shipmentIds),
      ),
    )
  const map = new Map<string, string[]>()
  for (const row of rows) {
    const list = map.get(row.shipmentId) ?? []
    list.push(row.batchId)
    map.set(row.shipmentId, list)
  }
  return map
}

function toShipmentDto(
  row: typeof shipments.$inferSelect,
  shop: typeof shops.$inferSelect | undefined,
  order: typeof orders.$inferSelect | undefined,
  events: TrackingEventDto[],
  lines: ShipmentItemDto[],
  batchIds: string[],
): ShipmentDto {
  const meta = rawMeta(row)
  const providerType = row.providerType || 'platform'
  const skus =
    (typeof meta.skus === 'string' && meta.skus) ||
    lines.map((l) => `${l.sku} ×${l.qty}`).join('、') ||
    '—'
  const weight = typeof meta.weight === 'string' ? meta.weight : '待称重'
  const picker = typeof meta.picker === 'string' ? meta.picker : '—'
  const remark = typeof meta.remark === 'string' ? meta.remark : ''
  const lastSyncedAt =
    typeof meta.lastSyncedAt === 'string' ? meta.lastSyncedAt : stampOrEmpty(row.updatedAt)
  const integrationStatus =
    meta.integrationStatus === 'synced' ||
    meta.integrationStatus === 'pending' ||
    meta.integrationStatus === 'error'
      ? meta.integrationStatus
      : 'pending'
  const site =
    (typeof meta.site === 'string' && meta.site) ||
    shop?.marketplaceCountry ||
    shop?.region ||
    ''
  const tracking = row.trackingNumber || '待生成'
  return {
    id: row.id,
    externalPackageId: row.externalPackageId,
    packageId: row.id,
    orderId: row.orderId,
    order: order?.externalOrderId || order?.orderNumber || row.orderId,
    shopId: row.shopId,
    shop: shop?.name || row.shopId,
    platform: shop?.platform || (typeof meta.platform === 'string' ? meta.platform : ''),
    site,
    tracking,
    trackingNumber: tracking,
    carrier: row.providerName || row.providerCode || labelProviderType(providerType),
    providerCode: row.providerCode || '',
    providerType,
    providerLabel: toUiProviderType(providerType),
    mode: labelProviderType(providerType),
    warehouse: row.warehouseCode || DEFAULT_WAREHOUSE,
    status: row.status,
    statusLabel: toUiShipmentStatus(row.status),
    platformStatus: row.platformStatus || '',
    rtsAt: stampOrEmpty(row.rtsAt),
    shippedAt: stampOrEmpty(row.shippedAt),
    deliveredAt: stampOrEmpty(row.deliveredAt),
    weight,
    items: lines.reduce((n, l) => n + l.qty, 0) || (typeof meta.items === 'number' ? meta.items : 0),
    skus,
    picker,
    remark,
    lastSyncedAt,
    integrationStatus,
    events,
    lines,
    batchIds,
  }
}

function toListRow(dto: ShipmentDto): ShipmentListRow {
  const { events, lines, batchIds, remark, picker, ...rest } = dto
  return {
    ...rest,
    eventCount: events.length,
    lastEvent: events.at(-1)?.title ?? '暂无轨迹',
  }
}

export async function shipmentStats(db: DbLike, organizationId: string) {
  const [totalRow] = await db
    .select({ n: count() })
    .from(shipments)
    .where(eq(shipments.organizationId, organizationId))
  const byStatus = await db
    .select({ status: shipments.status, n: count() })
    .from(shipments)
    .where(eq(shipments.organizationId, organizationId))
    .groupBy(shipments.status)
  const [batchRow] = await db
    .select({ n: count() })
    .from(fulfillmentBatches)
    .where(eq(fulfillmentBatches.organizationId, organizationId))
  return {
    total: Number(totalRow?.n ?? 0),
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.n)])),
    batchTotal: Number(batchRow?.n ?? 0),
  }
}

export async function listShipments(
  db: DbLike,
  organizationId: string,
  input: {
    page?: number
    pageSize?: number
    q?: string
    status?: string
    shopId?: string
    providerType?: string
    platform?: string
  } = {},
): Promise<PaginatedResult<ShipmentListRow>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(shipments.organizationId, organizationId)]
  if (input.status && input.status !== 'all') {
    filters.push(eq(shipments.status, input.status))
  }
  if (input.shopId) filters.push(eq(shipments.shopId, input.shopId))
  if (input.providerType && input.providerType !== 'all') {
    filters.push(eq(shipments.providerType, input.providerType))
  }
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(shipments.externalPackageId, q),
        ilike(shipments.trackingNumber, q),
        ilike(shipments.id, q),
      )!,
    )
  }

  const where = and(...filters)
  const [totalRow] = await db.select({ n: count() }).from(shipments).where(where)
  let rows = await db
    .select()
    .from(shipments)
    .where(where)
    .orderBy(desc(shipments.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  if (input.platform && input.platform !== 'all') {
    const shopMap = await loadShopMap(
      db,
      organizationId,
      [...new Set(rows.map((r) => r.shopId))],
    )
    rows = rows.filter((r) => (shopMap.get(r.shopId)?.platform || '').toLowerCase() === input.platform!.toLowerCase())
  }

  const shopMap = await loadShopMap(
    db,
    organizationId,
    [...new Set(rows.map((r) => r.shopId))],
  )
  const orderMap = await loadOrderMap(
    db,
    organizationId,
    [...new Set(rows.map((r) => r.orderId))],
  )
  const ids = rows.map((r) => r.id)
  const [eventsMap, itemsMap, batchMap] = await Promise.all([
    loadEventsByShipment(db, organizationId, ids),
    loadItemsByShipment(db, organizationId, ids),
    loadBatchIdsByShipment(db, organizationId, ids),
  ])

  const items = rows.map((row) =>
    toListRow(
      toShipmentDto(
        row,
        shopMap.get(row.shopId),
        orderMap.get(row.orderId),
        eventsMap.get(row.id) ?? [],
        itemsMap.get(row.id) ?? [],
        batchMap.get(row.id) ?? [],
      ),
    ),
  )

  return { items, total: Number(totalRow?.n ?? 0), page, pageSize }
}

export async function getShipment(db: DbLike, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(shipments)
    .where(
      and(
        eq(shipments.organizationId, organizationId),
        or(eq(shipments.id, id), eq(shipments.externalPackageId, id)),
      ),
    )
    .limit(1)
  if (!row) return null
  const [shopMap, orderMap, eventsMap, itemsMap, batchMap] = await Promise.all([
    loadShopMap(db, organizationId, [row.shopId]),
    loadOrderMap(db, organizationId, [row.orderId]),
    loadEventsByShipment(db, organizationId, [row.id]),
    loadItemsByShipment(db, organizationId, [row.id]),
    loadBatchIdsByShipment(db, organizationId, [row.id]),
  ])
  return toShipmentDto(
    row,
    shopMap.get(row.shopId),
    orderMap.get(row.orderId),
    eventsMap.get(row.id) ?? [],
    itemsMap.get(row.id) ?? [],
    batchMap.get(row.id) ?? [],
  )
}

export type CreateShipmentInput = {
  orderId: string
  externalPackageId?: string
  trackingNumber?: string
  providerType?: string
  providerCode?: string
  providerName?: string
  warehouseCode?: string
  orderLineIds?: string[]
  weight?: string
  picker?: string
  remark?: string
  itemsHint?: number
  skusHint?: string
}

export async function createShipmentFromOrder(
  db: AppDatabase,
  organizationId: string,
  input: CreateShipmentInput,
) {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.organizationId, organizationId), eq(orders.id, input.orderId)))
      .limit(1)
    if (!order) throw new Error(`订单不存在：${input.orderId}`)

    const [shop] = await tx
      .select()
      .from(shops)
      .where(and(eq(shops.organizationId, organizationId), eq(shops.id, order.shopId)))
      .limit(1)
    if (!shop) throw new Error('订单店铺不存在')

    const lines = await tx
      .select()
      .from(orderLines)
      .where(and(eq(orderLines.organizationId, organizationId), eq(orderLines.orderId, order.id)))
    const selected =
      input.orderLineIds && input.orderLineIds.length > 0
        ? lines.filter((l) => input.orderLineIds!.includes(l.id))
        : lines
    if (selected.length === 0) throw new Error('订单没有可装包的行')

    const site = shop.marketplaceCountry || shop.region || ''
    const providerType =
      input.providerType || defaultProviderTypeForPlatform(shop.platform, site)
    const externalPackageId =
      input.externalPackageId?.trim() ||
      `${(shop.platform || 'PKG').toUpperCase()}-PKG-${Date.now().toString(36).toUpperCase()}`

    const [existing] = await tx
      .select()
      .from(shipments)
      .where(
        and(eq(shipments.shopId, shop.id), eq(shipments.externalPackageId, externalPackageId)),
      )
      .limit(1)
    if (existing) {
      const dto = await getShipment(tx, organizationId, existing.id)
      if (!dto) throw new Error('包裹已存在但读取失败')
      return dto
    }

    const id = createId()
    const now = new Date()
    await tx.insert(shipments).values({
      id,
      organizationId,
      shopId: shop.id,
      orderId: order.id,
      externalPackageId,
      trackingNumber: input.trackingNumber?.trim() || null,
      providerCode: input.providerCode || providerType.toUpperCase(),
      providerName: input.providerName || labelProviderType(providerType),
      providerType,
      warehouseCode: input.warehouseCode || DEFAULT_WAREHOUSE,
      status: 'pending',
      platformStatus: 'PENDING',
      raw: {
        weight: input.weight || '待称重',
        picker: input.picker || '当前用户',
        remark: input.remark || '',
        items: input.itemsHint ?? selected.reduce((n, l) => n + (l.qty || 1), 0),
        skus:
          input.skusHint ||
          selected.map((l) => `${l.sellerSku || l.sku} ×${l.qty || 1}`).join('、'),
        site,
        platform: shop.platform,
        lastSyncedAt: formatStamp(now),
        integrationStatus: 'pending',
      },
    })

    for (const line of selected) {
      await tx.insert(shipmentItems).values({
        id: createId(),
        organizationId,
        shipmentId: id,
        orderLineId: line.id,
        qty: line.qty || 1,
      })
    }

    const dto = await getShipment(tx, organizationId, id)
    if (!dto) throw new Error('创建包裹后读取失败')
    return dto
  })
}

export async function updateShipmentStatus(
  db: AppDatabase,
  organizationId: string,
  id: string,
  status: string,
  patch?: { trackingNumber?: string; platformStatus?: string; providerCode?: string },
) {
  const [row] = await db
    .select()
    .from(shipments)
    .where(and(eq(shipments.organizationId, organizationId), eq(shipments.id, id)))
    .limit(1)
  if (!row) throw new Error(`包裹不存在：${id}`)
  if (row.status === 'cancelled') throw new Error('包裹已取消')

  const now = new Date()
  const updates: Partial<typeof shipments.$inferInsert> = {
    status,
    updatedAt: now,
  }
  if (patch?.trackingNumber) updates.trackingNumber = patch.trackingNumber
  if (patch?.platformStatus) updates.platformStatus = patch.platformStatus
  if (patch?.providerCode) updates.providerCode = patch.providerCode
  if (status === 'ready_to_ship' && !row.rtsAt) updates.rtsAt = now
  if ((status === 'shipped' || status === 'in_transit') && !row.shippedAt) updates.shippedAt = now
  if (status === 'delivered') updates.deliveredAt = now

  await db.update(shipments).set(updates).where(eq(shipments.id, id))
  const dto = await getShipment(db, organizationId, id)
  if (!dto) throw new Error('更新后读取失败')
  return dto
}

export type AppendTrackingInput = {
  shipmentId: string
  statusCode: string
  title?: string
  description?: string
  location?: string
  eventTime?: string
  /** api | manual | import — 强制 */
  source: 'api' | 'manual' | 'import'
  advanceStatus?: boolean
}

export async function appendTrackingEvent(
  db: AppDatabase,
  organizationId: string,
  input: AppendTrackingInput,
) {
  if (!input.source) throw new Error('轨迹必须指定 source（api / manual / import）')
  const [row] = await db
    .select()
    .from(shipments)
    .where(
      and(eq(shipments.organizationId, organizationId), eq(shipments.id, input.shipmentId)),
    )
    .limit(1)
  if (!row) throw new Error(`包裹不存在：${input.shipmentId}`)
  if (row.status === 'cancelled') throw new Error('包裹已取消，不能追加轨迹')

  const meta = eventMeta(input.statusCode)
  const eventTime = parseEventTime(input.eventTime)
  const title = input.title || meta?.label || input.statusCode

  // 幂等：同一 shipment + event_time + status_code
  const [dup] = await db
    .select()
    .from(trackingEvents)
    .where(
      and(
        eq(trackingEvents.shipmentId, row.id),
        eq(trackingEvents.eventTime, eventTime),
        eq(trackingEvents.statusCode, input.statusCode),
      ),
    )
    .limit(1)

  if (!dup) {
    await db.insert(trackingEvents).values({
      id: createId(),
      organizationId,
      shipmentId: row.id,
      statusCode: input.statusCode,
      title,
      description: input.description || '',
      location: input.location || row.warehouseCode || DEFAULT_WAREHOUSE,
      eventTime,
      source: input.source,
      raw: { source: input.source },
    })
  }

  const nextStatus = meta?.status
  if (input.advanceStatus !== false && nextStatus && nextStatus !== row.status) {
    await updateShipmentStatus(db, organizationId, row.id, nextStatus, {
      platformStatus: input.statusCode,
    })
  }

  const dto = await getShipment(db, organizationId, row.id)
  if (!dto) throw new Error('追加轨迹后读取失败')
  return { shipment: dto, duplicated: Boolean(dup) }
}

async function recordAttempt(
  db: DbLike,
  organizationId: string,
  args: {
    shopId: string
    shipmentId: string
    orderId: string
    externalPackageId: string
    action: string
    idempotencyKey: string
    result: string
    errorMessage?: string
    raw?: Record<string, unknown>
  },
) {
  const [existing] = await db
    .select()
    .from(fulfillmentAttempts)
    .where(
      and(
        eq(fulfillmentAttempts.organizationId, organizationId),
        eq(fulfillmentAttempts.action, args.action),
        eq(fulfillmentAttempts.idempotencyKey, args.idempotencyKey),
      ),
    )
    .limit(1)
  if (existing) return existing
  const id = createId()
  await db.insert(fulfillmentAttempts).values({
    id,
    organizationId,
    shopId: args.shopId,
    shipmentId: args.shipmentId,
    orderId: args.orderId,
    externalPackageId: args.externalPackageId,
    action: args.action,
    idempotencyKey: args.idempotencyKey,
    attemptNo: 1,
    result: args.result,
    errorMessage: args.errorMessage,
    retryable: false,
    respondedAt: new Date(),
    raw: args.raw || {},
  })
  const [row] = await db.select().from(fulfillmentAttempts).where(eq(fulfillmentAttempts.id, id)).limit(1)
  return row!
}

/**
 * 触发 apps/api 物流轨迹同步（Lazop /logistic/order/trace）。
 * 无凭证或 API 未配置时记失败 attempt，绝不本地造轨迹。
 */
export async function syncShipmentFromPlatformStub(
  db: AppDatabase,
  organizationId: string,
  shipmentId: string,
) {
  const [row] = await db
    .select()
    .from(shipments)
    .where(and(eq(shipments.organizationId, organizationId), eq(shipments.id, shipmentId)))
    .limit(1)
  if (!row) throw new Error(`包裹不存在：${shipmentId}`)

  const task = await syncDa.enqueueOrRetrySyncTask(db, organizationId, {
    type: '物流同步',
    target: `shipment:${row.externalPackageId}`,
    shopId: row.shopId || undefined,
    actor: 'console',
    note: '物流轨迹同步：apps/api → Lazop /logistic/order/trace',
  })

  const idempotencyKey = `sync-tracking:${row.id}:${task.id}`
  if (task.status !== '成功') {
    const attempt = await recordAttempt(db, organizationId, {
      shopId: row.shopId,
      shipmentId: row.id,
      orderId: row.orderId,
      externalPackageId: row.externalPackageId,
      action: 'sync_tracking',
      idempotencyKey,
      result: 'failed',
      raw: { error: task.error, syncTaskId: task.id },
    })
    throw new Error(
      task.error !== '—'
        ? task.error
        : `物流同步失败（attempt=${attempt.id}）。请检查店铺凭证与 API 配置。`,
    )
  }

  const attempt = await recordAttempt(db, organizationId, {
    shopId: row.shopId,
    shipmentId: row.id,
    orderId: row.orderId,
    externalPackageId: row.externalPackageId,
    action: 'sync_tracking',
    idempotencyKey,
    result: 'success',
    raw: { syncTaskId: task.id },
  })

  const dto = await getShipment(db, organizationId, row.id)
  if (!dto) throw new Error('同步后读取失败')
  return {
    shipment: dto,
    note: `已触发平台轨迹同步（task=${task.taskNo}，attempt=${attempt.id}）`,
    attemptId: attempt.id,
    syncTaskId: task.id,
  }
}

export async function importTrackingEvents(
  db: AppDatabase,
  organizationId: string,
  input: {
    shipmentId: string
    events: Array<{
      statusCode: string
      title?: string
      description?: string
      location?: string
      eventTime?: string
    }>
  },
) {
  const results = []
  for (const ev of input.events) {
    results.push(
      await appendTrackingEvent(db, organizationId, {
        shipmentId: input.shipmentId,
        statusCode: ev.statusCode,
        title: ev.title,
        description: ev.description,
        location: ev.location,
        eventTime: ev.eventTime,
        source: 'import',
      }),
    )
  }
  const dto = await getShipment(db, organizationId, input.shipmentId)
  if (!dto) throw new Error('导入后读取失败')
  return { shipment: dto, imported: results.length }
}

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

async function refreshBatchPackageCount(db: DbLike, batchId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(fulfillmentBatchPackages)
    .where(eq(fulfillmentBatchPackages.batchId, batchId))
  await db
    .update(fulfillmentBatches)
    .set({ packageCount: Number(row?.n ?? 0), updatedAt: new Date() })
    .where(eq(fulfillmentBatches.id, batchId))
}

async function toBatchDto(
  db: DbLike,
  organizationId: string,
  row: typeof fulfillmentBatches.$inferSelect,
): Promise<FulfillmentBatchDto> {
  const links = await db
    .select()
    .from(fulfillmentBatchPackages)
    .where(
      and(
        eq(fulfillmentBatchPackages.organizationId, organizationId),
        eq(fulfillmentBatchPackages.batchId, row.id),
      ),
    )
  const shipmentIds = links.map((l) => l.shipmentId)
  let packages: BatchPackageDto[] = []
  if (shipmentIds.length > 0) {
    const shipRows = await db
      .select()
      .from(shipments)
      .where(and(eq(shipments.organizationId, organizationId), inArray(shipments.id, shipmentIds)))
    const orderMap = await loadOrderMap(
      db,
      organizationId,
      [...new Set(shipRows.map((s) => s.orderId))],
    )
    packages = shipRows.map((s) => ({
      shipmentId: s.id,
      externalPackageId: s.externalPackageId,
      trackingNumber: s.trackingNumber || '待生成',
      order: orderMap.get(s.orderId)?.externalOrderId || s.orderId,
      status: s.status,
      statusLabel: toUiShipmentStatus(s.status),
    }))
  }

  const meta = rawMeta(row)
  const events =
    Array.isArray(meta.events) && meta.events.every((e) => typeof e === 'string')
      ? (meta.events as string[])
      : []

  return {
    id: row.id,
    batchNo: row.batchNo,
    channel: row.channel,
    site: row.site || '',
    country: row.country || '',
    warehouseCode: row.warehouseCode || DEFAULT_WAREHOUSE,
    status: row.status,
    statusLabel: toUiBatchStatus(row.status),
    carrier: row.carrier || '',
    trackingSummary: row.trackingSummary || '',
    packageCount: row.packageCount,
    handedOverAt: stampOrEmpty(row.handedOverAt),
    submittedAt: stampOrEmpty(row.submittedAt),
    createdAt: stampOrEmpty(row.createdAt),
    packages,
    events,
    departedAt: typeof meta.departedAt === 'string' ? meta.departedAt : stampOrEmpty(row.createdAt),
    jsbHandover:
      typeof meta.jsbHandover === 'string' ? meta.jsbHandover : stampOrEmpty(row.handedOverAt),
    customs: typeof meta.customs === 'string' ? meta.customs : '—',
    lastMile: typeof meta.lastMile === 'string' ? meta.lastMile : '—',
    signedAt: typeof meta.signedAt === 'string' ? meta.signedAt : '',
    fee: typeof meta.fee === 'string' ? meta.fee : '',
  }
}

export async function listBatches(
  db: DbLike,
  organizationId: string,
  input: {
    page?: number
    pageSize?: number
    q?: string
    status?: string
    channel?: string
    site?: string
  } = {},
): Promise<PaginatedResult<FulfillmentBatchListRow>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(fulfillmentBatches.organizationId, organizationId)]
  if (input.status && input.status !== 'all') filters.push(eq(fulfillmentBatches.status, input.status))
  if (input.channel && input.channel !== 'all') {
    if (input.channel === 'lgs') {
      filters.push(eq(fulfillmentBatches.channel, 'lgs'))
    } else if (input.channel === 'jsb') {
      filters.push(
        or(eq(fulfillmentBatches.channel, 'jsb'), eq(fulfillmentBatches.channel, 'jsb_th'))!,
      )
    } else {
      filters.push(eq(fulfillmentBatches.channel, input.channel))
    }
  }
  if (input.site && input.site !== 'all') filters.push(eq(fulfillmentBatches.site, input.site))
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(ilike(fulfillmentBatches.batchNo, q), ilike(fulfillmentBatches.trackingSummary, q))!,
    )
  }
  const where = and(...filters)
  const [totalRow] = await db.select({ n: count() }).from(fulfillmentBatches).where(where)
  const rows = await db
    .select()
    .from(fulfillmentBatches)
    .where(where)
    .orderBy(desc(fulfillmentBatches.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const items: FulfillmentBatchListRow[] = []
  for (const row of rows) {
    const dto = await toBatchDto(db, organizationId, row)
    const { packages: pkgList, events, ...rest } = dto
    items.push({
      ...rest,
      tracking: dto.trackingSummary || pkgList.map((p) => p.trackingNumber).join('、') || '—',
      packages: dto.packageCount,
      handedOver: dto.handedOverAt || '—',
    })
  }
  return { items, total: Number(totalRow?.n ?? 0), page, pageSize }
}

export async function getBatch(db: DbLike, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(fulfillmentBatches)
    .where(
      and(
        eq(fulfillmentBatches.organizationId, organizationId),
        or(eq(fulfillmentBatches.id, id), eq(fulfillmentBatches.batchNo, id)),
      ),
    )
    .limit(1)
  if (!row) return null
  return toBatchDto(db, organizationId, row)
}

export type CreateBatchInput = {
  batchNo?: string
  channel: string
  site?: string
  country?: string
  warehouseCode?: string
  carrier?: string
  trackingSummary?: string
  shipmentIds?: string[]
}

export async function createBatch(
  db: AppDatabase,
  organizationId: string,
  input: CreateBatchInput,
) {
  const channel = input.channel.trim()
  if (!channel) throw new Error('请指定 channel（lgs / jsb_th）')
  const batchNo =
    input.batchNo?.trim() ||
    `BATCH-${channel.toUpperCase()}-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`

  const [existing] = await db
    .select()
    .from(fulfillmentBatches)
    .where(
      and(
        eq(fulfillmentBatches.organizationId, organizationId),
        eq(fulfillmentBatches.batchNo, batchNo),
      ),
    )
    .limit(1)
  if (existing) {
    const dto = await getBatch(db, organizationId, existing.id)
    if (!dto) throw new Error('批次已存在但读取失败')
    return dto
  }

  const id = createId()
  await db.insert(fulfillmentBatches).values({
    id,
    organizationId,
    batchNo,
    channel,
    site: input.site || null,
    country: input.country || input.site || null,
    warehouseCode: input.warehouseCode || DEFAULT_WAREHOUSE,
    status: 'open',
    carrier: input.carrier || (channel.startsWith('jsb') ? 'JSB' : 'LGS'),
    trackingSummary: input.trackingSummary || '',
    packageCount: 0,
    raw: { events: [] },
  })

  if (input.shipmentIds?.length) {
    for (const sid of input.shipmentIds) {
      await addShipmentToBatch(db, organizationId, id, sid)
    }
  }

  const dto = await getBatch(db, organizationId, id)
  if (!dto) throw new Error('创建批次后读取失败')
  return dto
}

export async function addShipmentToBatch(
  db: AppDatabase,
  organizationId: string,
  batchId: string,
  shipmentId: string,
) {
  const [batch] = await db
    .select()
    .from(fulfillmentBatches)
    .where(
      and(eq(fulfillmentBatches.organizationId, organizationId), eq(fulfillmentBatches.id, batchId)),
    )
    .limit(1)
  if (!batch) throw new Error(`批次不存在：${batchId}`)
  if (batch.status === 'closed' || batch.status === 'rejected') {
    throw new Error(`批次状态为 ${batch.status}，不能再加入包裹`)
  }
  const [ship] = await db
    .select()
    .from(shipments)
    .where(and(eq(shipments.organizationId, organizationId), eq(shipments.id, shipmentId)))
    .limit(1)
  if (!ship) throw new Error(`包裹不存在：${shipmentId}`)

  const [dup] = await db
    .select()
    .from(fulfillmentBatchPackages)
    .where(
      and(
        eq(fulfillmentBatchPackages.batchId, batch.id),
        eq(fulfillmentBatchPackages.shipmentId, ship.id),
      ),
    )
    .limit(1)
  if (!dup) {
    await db.insert(fulfillmentBatchPackages).values({
      id: createId(),
      organizationId,
      batchId: batch.id,
      shipmentId: ship.id,
    })
    await refreshBatchPackageCount(db, batch.id)
  }
  const dto = await getBatch(db, organizationId, batch.id)
  if (!dto) throw new Error('加入包裹后读取失败')
  return dto
}

export async function submitBatch(
  db: AppDatabase,
  organizationId: string,
  batchId: string,
  operator?: string,
) {
  const [batch] = await db
    .select()
    .from(fulfillmentBatches)
    .where(
      and(eq(fulfillmentBatches.organizationId, organizationId), eq(fulfillmentBatches.id, batchId)),
    )
    .limit(1)
  if (!batch) throw new Error(`批次不存在：${batchId}`)
  if (batch.status !== 'open' && batch.status !== 'rejected') {
    throw new Error(`仅开放中/已驳回批次可提交，当前：${batch.status}`)
  }
  if (batch.packageCount <= 0) throw new Error('批次内没有包裹，不能提交')

  const now = new Date()
  const meta = rawMeta(batch)
  const events = Array.isArray(meta.events) ? [...(meta.events as string[])] : []
  events.push(`提交交接 · ${formatStamp(now)}${operator ? ` · ${operator}` : ''}（stub）`)

  await db
    .update(fulfillmentBatches)
    .set({
      status: 'submitted',
      submittedAt: now,
      handedOverAt: batch.handedOverAt || now,
      updatedAt: now,
      raw: { ...meta, events, lastOperator: operator || null, stubSubmit: true },
    })
    .where(eq(fulfillmentBatches.id, batch.id))

  // stub attempt on first package
  const [link] = await db
    .select()
    .from(fulfillmentBatchPackages)
    .where(eq(fulfillmentBatchPackages.batchId, batch.id))
    .limit(1)
  if (link) {
    const [ship] = await db.select().from(shipments).where(eq(shipments.id, link.shipmentId)).limit(1)
    if (ship) {
      await recordAttempt(db, organizationId, {
        shopId: ship.shopId,
        shipmentId: ship.id,
        orderId: ship.orderId,
        externalPackageId: ship.externalPackageId,
        action: 'submit_batch',
        idempotencyKey: `submit-batch:${batch.id}`,
        result: 'success',
        raw: { stub: true, batchNo: batch.batchNo },
      })
    }
  }

  const dto = await getBatch(db, organizationId, batch.id)
  if (!dto) throw new Error('提交后读取失败')
  return dto
}

export async function closeBatch(
  db: AppDatabase,
  organizationId: string,
  batchId: string,
  operator?: string,
) {
  const [batch] = await db
    .select()
    .from(fulfillmentBatches)
    .where(
      and(eq(fulfillmentBatches.organizationId, organizationId), eq(fulfillmentBatches.id, batchId)),
    )
    .limit(1)
  if (!batch) throw new Error(`批次不存在：${batchId}`)
  const now = new Date()
  const meta = rawMeta(batch)
  const events = Array.isArray(meta.events) ? [...(meta.events as string[])] : []
  events.push(`关闭批次 · ${formatStamp(now)}${operator ? ` · ${operator}` : ''}`)
  await db
    .update(fulfillmentBatches)
    .set({
      status: 'closed',
      updatedAt: now,
      raw: { ...meta, events, lastOperator: operator || null },
    })
    .where(eq(fulfillmentBatches.id, batch.id))
  const dto = await getBatch(db, organizationId, batch.id)
  if (!dto) throw new Error('关闭后读取失败')
  return dto
}

export async function appendBatchEvent(
  db: AppDatabase,
  organizationId: string,
  input: {
    batchId: string
    event: string
    eventAt?: string
    operator?: string
    tracking?: string
    carrier?: string
    exception?: string
    /** 可选：同步推进批次状态 */
    status?: string
  },
) {
  const [batch] = await db
    .select()
    .from(fulfillmentBatches)
    .where(
      and(
        eq(fulfillmentBatches.organizationId, organizationId),
        eq(fulfillmentBatches.id, input.batchId),
      ),
    )
    .limit(1)
  if (!batch) throw new Error(`批次不存在：${input.batchId}`)
  const at = input.eventAt || formatStamp(new Date())
  const meta = rawMeta(batch)
  const events = Array.isArray(meta.events) ? [...(meta.events as string[])] : []
  const line = `${input.event} · ${at}${input.operator ? ` · ${input.operator}` : ''}${
    input.exception ? ` · ${input.exception}` : ''
  }`
  events.push(line)

  const patch: Partial<typeof fulfillmentBatches.$inferInsert> = {
    updatedAt: new Date(),
    raw: {
      ...meta,
      events,
      lastOperator: input.operator || null,
    },
    trackingSummary: input.tracking || batch.trackingSummary,
    carrier: input.carrier || batch.carrier,
  }
  if (input.status) patch.status = input.status
  if (input.event.includes('交接') || input.event.includes('揽收')) {
    patch.handedOverAt = batch.handedOverAt || parseEventTime(at)
  }

  await db.update(fulfillmentBatches).set(patch).where(eq(fulfillmentBatches.id, batch.id))
  const dto = await getBatch(db, organizationId, batch.id)
  if (!dto) throw new Error('追加事件后读取失败')
  return dto
}
