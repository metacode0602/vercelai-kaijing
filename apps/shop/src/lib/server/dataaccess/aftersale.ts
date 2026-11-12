/**
 * 售后 dataaccess（模块6）：取消释放占库 / 退货收货质检回库报损。
 * Q08：取消批准写 order_release 流水，禁止静默改余额。
 * Q18：质检完成写 aftersale_restock / aftersale_scrap 流水；不合格不入可用。
 */
import { and, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  inventoryBalances,
  inventoryMovements,
  inventoryReservations,
  orderLines,
  orders,
  productVariants,
  refunds,
  returnShipments,
  reverseOrderEvents,
  reverseOrderItems,
  reverseOrders,
  reverseQcRecords,
  shopAftersalePolicies,
  shops,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  formatStamp,
  isCancelLike,
  isReturnLike,
  money,
  REFUND_DECISION_LABELS,
  RELEASE_STATUS_LABELS,
  toDbCancelStatus,
  toDbRequestType,
  toDbReturnStatus,
  toDbTicketStatus,
  toUiCancelStatus,
  toUiRequestType,
  toUiReturnStatus,
  toUiTicketStatus,
  type RefundDecision,
  type ReleaseStatus,
  type UiCancelStatus,
  type UiReturnStatus,
  type UiTicketStatus,
  UI_CANCEL_STATUSES,
  UI_RETURN_STATUSES,
  UI_TICKET_STATUSES,
} from '@/lib/server/mappers/aftersale'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'
import { recomputeStockAlerts } from '@/lib/server/dataaccess/stock-alerts'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

const DEFAULT_WAREHOUSE = 'WH-CN-XMN-001'
const DEFAULT_BIN = 'A-01-01'

type RawMeta = Record<string, unknown>

function rawOf(row: { raw?: unknown } | null | undefined): RawMeta {
  if (!row?.raw || typeof row.raw !== 'object') return {}
  return row.raw as RawMeta
}

function str(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return fallback
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

async function appendEvent(
  db: DbLike,
  organizationId: string,
  reverseOrderId: string,
  eventType: string,
  content: string,
  reverseOrderLineId?: string | null,
  extra?: RawMeta,
) {
  await db.insert(reverseOrderEvents).values({
    id: createId(),
    organizationId,
    reverseOrderId,
    reverseOrderLineId: reverseOrderLineId || null,
    direction: 'outbound',
    eventType,
    content,
    eventTime: new Date(),
    raw: extra || {},
  })
}

async function resolveShop(
  db: DbLike,
  organizationId: string,
  input: { shopId?: string; shopName?: string },
) {
  if (input.shopId) {
    const [row] = await db
      .select()
      .from(shops)
      .where(and(eq(shops.organizationId, organizationId), eq(shops.id, input.shopId)))
      .limit(1)
    if (row) return row
  }
  if (input.shopName) {
    const [row] = await db
      .select()
      .from(shops)
      .where(
        and(
          eq(shops.organizationId, organizationId),
          or(eq(shops.name, input.shopName), ilike(shops.name, `%${input.shopName}%`)),
        ),
      )
      .limit(1)
    if (row) return row
  }
  const [any] = await db
    .select()
    .from(shops)
    .where(eq(shops.organizationId, organizationId))
    .limit(1)
  if (!any) throw new Error('无可用店铺，请先 seed 商品/订单')
  return any
}

async function resolveVariantBySku(db: DbLike, organizationId: string, sku: string) {
  const code = sku.trim()
  if (!code) return null
  const [row] = await db
    .select()
    .from(productVariants)
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        or(eq(productVariants.skuCode, code), eq(productVariants.sku, code)),
      ),
    )
    .limit(1)
  return row || null
}

async function findOrderByExternal(
  db: DbLike,
  organizationId: string,
  externalOrderId: string,
) {
  const [row] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, organizationId),
        or(eq(orders.externalOrderId, externalOrderId), eq(orders.orderNumber, externalOrderId)),
      ),
    )
    .limit(1)
  return row || null
}

export type AftersaleTicketDto = {
  id: string
  reverseOrderId: string
  externalReverseId: string
  order: string
  shop: string
  shopId: string
  warehouse: string
  sku: string
  type: string
  reason: string
  refund: number
  currency: string
  returned: number
  qc: string
  status: UiTicketStatus | string
  platformStatus: string
  platformUpdatedAt: string
  returnShipmentId: string
  returnTracking: string
  refundId: string
  refundStatus: string
  refundedAt: string
  refundMethod: string
  qcDecision: string
  isCancelPending: boolean
  requestType: string
  orderId: string
}

export type AftersaleReturnDto = {
  id: string
  reverseOrderId: string
  externalReturnId: string
  order: string
  shop: string
  shopId: string
  sku: string
  warehouse: string
  bin: string
  tracking: string
  returnShipmentId: string
  receivedAt: string
  qty: number
  qcPass: number
  qcDefect: number
  qc: string
  restock: number
  scrap: number
  status: UiReturnStatus | string
  platformStatus: string
  qcDecision: string
  inspectedAt: string
  refundId: string
  refundStatus: string
  packageCondition: string
  remark: string
  restockLedgerId: string
  scrapLedgerId: string
  orderId: string
  reverseOrderDbId: string
  lineId: string
  variantId: string
}

export type AftersaleCancelDto = {
  id: string
  reverseOrderId: string
  externalReverseId: string
  order: string
  shop: string
  shopId: string
  sku: string
  warehouse: string
  bin: string
  type: string
  platformSync: string
  platformStatus: string
  platformUpdatedAt: string
  refundId: string
  refundStatus: string
  refundedAt: string
  refund: number
  currency: string
  releaseReserved: number
  status: UiCancelStatus | string
  reason: string
  reasonCode: string
  remark: string
  releasedAt: string
  releaseLedgerId: string
  orderId: string
  reverseOrderDbId: string
  lineId: string
  variantId: string
  /** 占库释放策略快照 manual/auto */
  inventoryReleaseMode: string
  /** 占库释放状态 pending_manual/released/skipped/failed */
  inventoryReleaseStatus: string
  inventoryReleaseStatusLabel: string
  /** 退款策略快照 manual/auto */
  refundMode: string
  refundWaitDays: number
  /** 退款决定 pending_manual/scheduled/deciding/agreed/rejected/skipped/unsupported */
  refundDecision: string
  refundDecisionLabel: string
  refundDueAt: string
}

function pickUiId(ro: typeof reverseOrders.$inferSelect, fallbackExt: string): string {
  const raw = rawOf(ro)
  return str(raw.uiId) || fallbackExt || ro.id
}

async function loadRelated(
  db: DbLike,
  organizationId: string,
  ro: typeof reverseOrders.$inferSelect,
) {
  const [shop] = await db.select().from(shops).where(eq(shops.id, ro.shopId)).limit(1)
  const lines = await db
    .select()
    .from(reverseOrderItems)
    .where(
      and(
        eq(reverseOrderItems.organizationId, organizationId),
        eq(reverseOrderItems.reverseOrderId, ro.id),
      ),
    )
    .orderBy(desc(reverseOrderItems.createdAt))
  const line = lines[0] || null
  const [shipment] = await db
    .select()
    .from(returnShipments)
    .where(
      and(
        eq(returnShipments.organizationId, organizationId),
        eq(returnShipments.reverseOrderId, ro.id),
      ),
    )
    .orderBy(desc(returnShipments.createdAt))
    .limit(1)
  const [refund] = await db
    .select()
    .from(refunds)
    .where(
      and(eq(refunds.organizationId, organizationId), eq(refunds.reverseOrderId, ro.id)),
    )
    .orderBy(desc(refunds.createdAt))
    .limit(1)
  let orderExt = str(ro.externalTradeOrderId)
  if (!orderExt && ro.orderId) {
    const [ord] = await db.select().from(orders).where(eq(orders.id, ro.orderId)).limit(1)
    orderExt = ord?.externalOrderId || ord?.orderNumber || ''
  }
  let sku = str(rawOf(ro).sku) || str(rawOf(line).sku)
  let variantId = str(rawOf(ro).variantId) || str(rawOf(line).variantId)
  if (!sku && line?.orderLineId) {
    const [ol] = await db.select().from(orderLines).where(eq(orderLines.id, line.orderLineId)).limit(1)
    if (ol) {
      sku = ol.sku || ol.sellerSku || ''
      variantId = ol.variantId || variantId
    }
  }
  if (!sku && variantId) {
    const [v] = await db.select().from(productVariants).where(eq(productVariants.id, variantId)).limit(1)
    sku = v?.skuCode || v?.sku || ''
  }
  return { shop, line, shipment, refund, orderExt, sku, variantId, lines }
}

function toTicketDto(
  ro: typeof reverseOrders.$inferSelect,
  ctx: Awaited<ReturnType<typeof loadRelated>>,
): AftersaleTicketDto {
  const raw = rawOf(ro)
  const typeLabel = str(raw.typeLabel) || toUiRequestType(ro.requestType)
  const returned = num(raw.returned, num(raw.qty, ctx.line ? 1 : 0))
  const status = toUiTicketStatus(str(raw.uiStatus) || ro.fulfillmentStatus)
  return {
    id: pickUiId(ro, ro.externalReverseOrderId),
    reverseOrderId: ro.id,
    externalReverseId: ro.externalReverseOrderId,
    order: ctx.orderExt,
    shop: ctx.shop?.name || str(raw.shopName),
    shopId: ro.shopId,
    warehouse: str(raw.warehouse, DEFAULT_WAREHOUSE),
    sku: ctx.sku,
    type: typeLabel,
    reason: str(raw.reason) || str(ctx.line?.reasonText),
    refund: num(raw.refundAmount, money(ctx.line?.refundAmount) || money(ctx.refund?.amount)),
    currency: str(raw.currency) || ctx.line?.currency || ctx.refund?.currency || 'USD',
    returned: isReturnLike(ro.requestType, typeLabel) ? returned : num(raw.returned, 0),
    qc: str(raw.qc, returned > 0 ? '待质检' : '不适用'),
    status,
    platformStatus: ro.platformStatus || 'REVERSE_REQUESTED',
    platformUpdatedAt: formatStamp(ro.platformUpdatedAt) || formatStamp(ro.updatedAt),
    returnShipmentId: ctx.shipment?.id || str(raw.returnShipmentId),
    returnTracking: ctx.shipment?.trackingNumber || str(raw.returnTracking),
    refundId: ctx.refund?.id || str(raw.refundId),
    refundStatus: ctx.refund?.status || str(raw.refundStatus, 'pending'),
    refundedAt: formatStamp(ctx.refund?.refundedAt) || str(raw.refundedAt),
    refundMethod: str(raw.refundMethod, 'platform_original'),
    qcDecision: str(raw.qcDecision) || ctx.line?.qcDecision || (returned > 0 ? 'pending' : 'not_applicable'),
    isCancelPending: isCancelLike(ro.requestType, typeLabel) && status === '待确认',
    requestType: ro.requestType || toDbRequestType(typeLabel),
    orderId: ro.orderId || '',
  }
}

function toReturnDto(
  ro: typeof reverseOrders.$inferSelect,
  ctx: Awaited<ReturnType<typeof loadRelated>>,
): AftersaleReturnDto {
  const raw = rawOf(ro)
  const lineRaw = rawOf(ctx.line)
  const qty = num(raw.qty, num(lineRaw.qty, 1))
  const qcPass = num(raw.qcPass)
  const qcDefect = num(raw.qcDefect)
  const status = toUiReturnStatus(str(raw.returnStatus) || ro.fulfillmentStatus)
  return {
    id: pickUiId(ro, ro.externalReverseOrderId),
    reverseOrderId: ro.id,
    externalReturnId: ro.externalReverseOrderId,
    order: ctx.orderExt,
    shop: ctx.shop?.name || str(raw.shopName),
    shopId: ro.shopId,
    sku: ctx.sku,
    warehouse: str(raw.warehouse, DEFAULT_WAREHOUSE),
    bin: str(raw.bin, DEFAULT_BIN),
    tracking: ctx.shipment?.trackingNumber || str(raw.tracking),
    returnShipmentId: ctx.shipment?.id || str(raw.returnShipmentId),
    receivedAt:
      formatStamp(ctx.shipment?.receivedAt) || str(raw.receivedAt),
    qty,
    qcPass,
    qcDefect,
    qc: str(raw.qc, status === '待质检' || status === '质检中' ? '待质检' : `合格 ${qcPass} / 残次 ${qcDefect}`),
    restock: num(raw.restock, qcPass),
    scrap: num(raw.scrap, qcDefect),
    status,
    platformStatus: ro.platformStatus || 'RETURN_REQUESTED',
    qcDecision: str(raw.qcDecision) || ctx.line?.qcDecision || 'pending',
    inspectedAt: str(raw.inspectedAt),
    refundId: ctx.refund?.id || str(raw.refundId),
    refundStatus: ctx.refund?.status || str(raw.refundStatus, 'pending'),
    packageCondition: str(raw.packageCondition, '完好'),
    remark: str(raw.remark),
    restockLedgerId: str(raw.restockLedgerId),
    scrapLedgerId: str(raw.scrapLedgerId),
    orderId: ro.orderId || '',
    reverseOrderDbId: ro.id,
    lineId: ctx.line?.id || '',
    variantId: ctx.variantId,
  }
}

function toCancelDto(
  ro: typeof reverseOrders.$inferSelect,
  ctx: Awaited<ReturnType<typeof loadRelated>>,
): AftersaleCancelDto {
  const raw = rawOf(ro)
  const typeLabel =
    str(raw.typeLabel) ||
    (ro.requestType === 'ONLY_REFUND' ? '仅退款' : '取消订单')
  const releaseStatus = (ro.inventoryReleaseStatus || 'pending_manual') as ReleaseStatus
  const refundDecision = (ro.refundDecision || 'pending_manual') as RefundDecision
  return {
    id: pickUiId(ro, ro.externalReverseOrderId),
    reverseOrderId: ro.id,
    externalReverseId: ro.externalReverseOrderId,
    order: ctx.orderExt,
    shop: ctx.shop?.name || str(raw.shopName),
    shopId: ro.shopId,
    sku: ctx.sku,
    warehouse: str(raw.warehouse, DEFAULT_WAREHOUSE),
    bin: str(raw.bin, DEFAULT_BIN),
    type: typeLabel,
    platformSync: str(raw.platformSync, '等待平台确认'),
    platformStatus: ro.platformStatus || 'REVERSE_REQUESTED',
    platformUpdatedAt: formatStamp(ro.platformUpdatedAt) || formatStamp(ro.updatedAt),
    refundId: ctx.refund?.id || str(raw.refundId),
    refundStatus: ctx.refund?.status || str(raw.refundStatus, 'pending'),
    refundedAt: formatStamp(ctx.refund?.refundedAt) || str(raw.refundedAt),
    refund: num(raw.refundAmount, money(ctx.refund?.amount) || money(ctx.line?.refundAmount)),
    currency: str(raw.currency) || ctx.refund?.currency || ctx.line?.currency || 'USD',
    releaseReserved: num(raw.releaseReserved),
    status: toUiCancelStatus(str(raw.cancelStatus) || ro.fulfillmentStatus),
    reason: str(raw.reason) || str(ctx.line?.reasonText),
    reasonCode: str(raw.reasonCode) || str(ctx.line?.reasonCode),
    remark: str(raw.remark),
    releasedAt: formatStamp(ro.inventoryReleasedAt) || str(raw.releasedAt),
    releaseLedgerId: str(raw.releaseLedgerId),
    orderId: ro.orderId || '',
    reverseOrderDbId: ro.id,
    lineId: ctx.line?.id || '',
    variantId: ctx.variantId,
    inventoryReleaseMode: ro.inventoryReleaseMode || 'manual',
    inventoryReleaseStatus: releaseStatus,
    inventoryReleaseStatusLabel: RELEASE_STATUS_LABELS[releaseStatus] ?? releaseStatus,
    refundMode: ro.refundMode || 'manual',
    refundWaitDays: ro.refundWaitDays ?? 1,
    refundDecision,
    refundDecisionLabel: REFUND_DECISION_LABELS[refundDecision] ?? refundDecision,
    refundDueAt: formatStamp(ro.refundDueAt),
  }
}

async function findReverseByIdOrUi(
  db: DbLike,
  organizationId: string,
  id: string,
) {
  const [byPk] = await db
    .select()
    .from(reverseOrders)
    .where(and(eq(reverseOrders.organizationId, organizationId), eq(reverseOrders.id, id)))
    .limit(1)
  if (byPk) return byPk
  const [byExt] = await db
    .select()
    .from(reverseOrders)
    .where(
      and(
        eq(reverseOrders.organizationId, organizationId),
        eq(reverseOrders.externalReverseOrderId, id),
      ),
    )
    .limit(1)
  if (byExt) return byExt
  const rows = await db
    .select()
    .from(reverseOrders)
    .where(eq(reverseOrders.organizationId, organizationId))
    .orderBy(desc(reverseOrders.createdAt))
    .limit(500)
  return rows.find((r) => pickUiId(r, r.externalReverseOrderId) === id) || null
}

export async function listTickets(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string; type?: string } = {},
): Promise<PaginatedResult<AftersaleTicketDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const conditions: SQL[] = [eq(reverseOrders.organizationId, organizationId)]
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    conditions.push(
      or(
        ilike(reverseOrders.externalReverseOrderId, q),
        ilike(reverseOrders.externalTradeOrderId, q),
        sql`${reverseOrders.raw}::text ilike ${q}`,
      )!,
    )
  }
  if (input.status?.trim()) {
    conditions.push(sql`${reverseOrders.raw}->>'uiStatus' = ${input.status.trim()}`)
  }
  if (input.type?.trim()) {
    conditions.push(sql`${reverseOrders.raw}->>'typeLabel' = ${input.type.trim()}`)
  }
  const where = and(...conditions)
  const [totalRow] = await db.select({ c: count() }).from(reverseOrders).where(where)
  const rows = await db
    .select()
    .from(reverseOrders)
    .where(where)
    .orderBy(desc(reverseOrders.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const items: AftersaleTicketDto[] = []
  for (const ro of rows) {
    const ctx = await loadRelated(db, organizationId, ro)
    items.push(toTicketDto(ro, ctx))
  }
  return { items, total: Number(totalRow?.c || 0), page, pageSize }
}

export async function ticketStats(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select({
      status: sql<string>`coalesce(${reverseOrders.raw}->>'uiStatus', '待确认')`,
      c: count(),
    })
    .from(reverseOrders)
    .where(eq(reverseOrders.organizationId, organizationId))
    .groupBy(sql`coalesce(${reverseOrders.raw}->>'uiStatus', '待确认')`)
  const map = new Map(rows.map((r) => [r.status, Number(r.c)]))
  const total = rows.reduce((sum, r) => sum + Number(r.c), 0)
  return {
    total,
    pending: map.get('待确认') ?? 0,
    approved: (map.get('已审核') ?? 0) + (map.get('已入库') ?? 0),
    withReturn: 0,
  }
}

export async function getTicket(
  db: AppDatabase,
  organizationId: string,
  id: string,
): Promise<AftersaleTicketDto | null> {
  const ro = await findReverseByIdOrUi(db, organizationId, id)
  if (!ro) return null
  return toTicketDto(ro, await loadRelated(db, organizationId, ro))
}

export async function listReturns(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string } = {},
): Promise<PaginatedResult<AftersaleReturnDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const conditions: SQL[] = [
    eq(reverseOrders.organizationId, organizationId),
    or(
      eq(reverseOrders.requestType, 'RETURN'),
      sql`${reverseOrders.raw}->>'typeLabel' in ('退货退款','换货')`,
    )!,
  ]
  if (input.status?.trim()) {
    conditions.push(sql`${reverseOrders.raw}->>'returnStatus' = ${input.status.trim()}`)
  }
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    conditions.push(
      or(
        ilike(reverseOrders.externalReverseOrderId, q),
        ilike(reverseOrders.externalTradeOrderId, q),
        sql`${reverseOrders.raw}->>'uiId' ilike ${q}`,
        sql`${reverseOrders.raw}->>'sku' ilike ${q}`,
        sql`${reverseOrders.raw}->>'shopName' ilike ${q}`,
        sql`${reverseOrders.raw}->>'tracking' ilike ${q}`,
      )!,
    )
  }
  const where = and(...conditions)
  const [totalRow] = await db.select({ c: count() }).from(reverseOrders).where(where)
  const rows = await db
    .select()
    .from(reverseOrders)
    .where(where)
    .orderBy(desc(reverseOrders.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const items: AftersaleReturnDto[] = []
  for (const ro of rows) {
    const ctx = await loadRelated(db, organizationId, ro)
    items.push(toReturnDto(ro, ctx))
  }
  return { items, total: Number(totalRow?.c || 0), page, pageSize }
}

export async function returnStats(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select({
      status: sql<string>`coalesce(${reverseOrders.raw}->>'returnStatus', '待收货确认')`,
      c: count(),
    })
    .from(reverseOrders)
    .where(
      and(
        eq(reverseOrders.organizationId, organizationId),
        or(
          eq(reverseOrders.requestType, 'RETURN'),
          sql`${reverseOrders.raw}->>'typeLabel' in ('退货退款','换货')`,
        ),
      ),
    )
    .groupBy(sql`coalesce(${reverseOrders.raw}->>'returnStatus', '待收货确认')`)
  const map = new Map(rows.map((r) => [r.status, Number(r.c)]))
  const total = rows.reduce((sum, r) => sum + Number(r.c), 0)
  return {
    total,
    pendingReceive: map.get('待收货确认') ?? 0,
    pendingQc: (map.get('待质检') ?? 0) + (map.get('质检中') ?? 0),
    restocked: (map.get('已回库') ?? 0) + (map.get('部分回库') ?? 0),
    scrapped: map.get('已报损') ?? 0,
  }
}

export async function getReturn(
  db: AppDatabase,
  organizationId: string,
  id: string,
): Promise<AftersaleReturnDto | null> {
  const ro = await findReverseByIdOrUi(db, organizationId, id)
  if (!ro) return null
  if (!isReturnLike(ro.requestType, str(rawOf(ro).typeLabel))) {
    // still allow if explicitly opened
  }
  return toReturnDto(ro, await loadRelated(db, organizationId, ro))
}

export async function listCancels(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string } = {},
): Promise<PaginatedResult<AftersaleCancelDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const conditions: SQL[] = [
    eq(reverseOrders.organizationId, organizationId),
    or(
      eq(reverseOrders.requestType, 'CANCEL'),
      eq(reverseOrders.requestType, 'ONLY_REFUND'),
      sql`${reverseOrders.raw}->>'typeLabel' in ('取消','取消订单','仅退款')`,
    )!,
  ]
  if (input.status?.trim()) {
    conditions.push(sql`${reverseOrders.raw}->>'cancelStatus' = ${input.status.trim()}`)
  }
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    conditions.push(
      or(
        ilike(reverseOrders.externalReverseOrderId, q),
        ilike(reverseOrders.externalTradeOrderId, q),
        sql`${reverseOrders.raw}->>'uiId' ilike ${q}`,
        sql`${reverseOrders.raw}->>'sku' ilike ${q}`,
        sql`${reverseOrders.raw}->>'shopName' ilike ${q}`,
        sql`${reverseOrders.raw}->>'reason' ilike ${q}`,
      )!,
    )
  }
  const where = and(...conditions)
  const [totalRow] = await db.select({ c: count() }).from(reverseOrders).where(where)
  const rows = await db
    .select()
    .from(reverseOrders)
    .where(where)
    .orderBy(desc(reverseOrders.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const items: AftersaleCancelDto[] = []
  for (const ro of rows) {
    const ctx = await loadRelated(db, organizationId, ro)
    items.push(toCancelDto(ro, ctx))
  }
  return { items, total: Number(totalRow?.c || 0), page, pageSize }
}

export async function cancelStats(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select({
      status: sql<string>`coalesce(${reverseOrders.raw}->>'cancelStatus', '待确认')`,
      c: count(),
    })
    .from(reverseOrders)
    .where(
      and(
        eq(reverseOrders.organizationId, organizationId),
        or(
          eq(reverseOrders.requestType, 'CANCEL'),
          eq(reverseOrders.requestType, 'ONLY_REFUND'),
          sql`${reverseOrders.raw}->>'typeLabel' in ('取消','取消订单','仅退款')`,
        ),
      ),
    )
    .groupBy(sql`coalesce(${reverseOrders.raw}->>'cancelStatus', '待确认')`)
  const map = new Map(rows.map((r) => [r.status, Number(r.c)]))
  const total = rows.reduce((sum, r) => sum + Number(r.c), 0)
  return {
    total,
    pending: map.get('待确认') ?? 0,
    approved: map.get('已审核') ?? 0,
    rejected: map.get('已驳回') ?? 0,
  }
}

export async function getCancel(
  db: AppDatabase,
  organizationId: string,
  id: string,
): Promise<AftersaleCancelDto | null> {
  const ro = await findReverseByIdOrUi(db, organizationId, id)
  if (!ro) return null
  return toCancelDto(ro, await loadRelated(db, organizationId, ro))
}

export function aftersaleMeta() {
  return {
    ticketStatuses: [...UI_TICKET_STATUSES],
    returnStatuses: [...UI_RETURN_STATUSES],
    cancelStatuses: [...UI_CANCEL_STATUSES],
    types: ['取消', '仅退款', '退货退款', '换货'],
    cancelTypes: ['取消订单', '仅退款', '退货退款'],
    warehouses: [DEFAULT_WAREHOUSE],
    bins: ['A-01-01', 'A-01-02', 'B-02-01-01', 'A-01-01-01', 'A-01-01-02'],
    skus: ['HSY000001001', 'HSY000001002', 'HSY000002001'],
  }
}

export type UpsertAftersaleInput = {
  shopId?: string
  shopName?: string
  externalReverseOrderId: string
  externalTradeOrderId?: string
  orderId?: string
  requestType?: string
  typeLabel?: string
  platformStatus?: string
  fulfillmentStatus?: string
  uiId?: string
  reason?: string
  reasonCode?: string
  refundAmount?: number
  currency?: string
  sku?: string
  warehouse?: string
  bin?: string
  qty?: number
  returned?: number
  releaseReserved?: number
  packageCondition?: string
  remark?: string
  tracking?: string
  status?: string
  lines?: Array<{
    externalReverseLineId: string
    externalOrderLineId?: string
    orderLineId?: string
    reasonCode?: string
    reasonText?: string
    refundAmount?: number
    currency?: string
    qty?: number
    sku?: string
  }>
}

export async function upsertAftersale(
  db: AppDatabase,
  organizationId: string,
  input: UpsertAftersaleInput,
): Promise<AftersaleTicketDto> {
  return db.transaction(async (tx) => {
    const shop = await resolveShop(tx, organizationId, {
      shopId: input.shopId,
      shopName: input.shopName,
    })
    const typeLabel = input.typeLabel || toUiRequestType(input.requestType)
    const requestType = toDbRequestType(input.requestType || typeLabel)
    let orderId = input.orderId || null
    if (!orderId && input.externalTradeOrderId) {
      const ord = await findOrderByExternal(tx, organizationId, input.externalTradeOrderId)
      orderId = ord?.id || null
    }
    const variant = input.sku
      ? await resolveVariantBySku(tx, organizationId, input.sku)
      : null
    const uiId = input.uiId || `AS-${input.externalReverseOrderId}`
    const isReturn = requestType === 'RETURN'
    const isCancel = requestType === 'CANCEL' || requestType === 'ONLY_REFUND'
    const fulfillmentStatus = input.fulfillmentStatus
      ? input.fulfillmentStatus
      : isReturn
        ? toDbReturnStatus(input.status || '待收货确认')
        : toDbCancelStatus(input.status || '待确认')

    const [existing] = await tx
      .select()
      .from(reverseOrders)
      .where(
        and(
          eq(reverseOrders.shopId, shop.id),
          eq(reverseOrders.externalReverseOrderId, input.externalReverseOrderId),
        ),
      )
      .limit(1)

    const rawBase: RawMeta = {
      uiId,
      typeLabel: typeLabel === '取消' && requestType === 'CANCEL' ? '取消订单' : typeLabel,
      reason: input.reason || '',
      reasonCode: input.reasonCode || '',
      refundAmount: input.refundAmount ?? 0,
      currency: input.currency || 'USD',
      sku: input.sku || '',
      variantId: variant?.id || '',
      warehouse: input.warehouse || DEFAULT_WAREHOUSE,
      bin: input.bin || DEFAULT_BIN,
      qty: input.qty ?? input.returned ?? (isReturn ? 1 : 0),
      returned: input.returned ?? input.qty ?? (isReturn ? 1 : 0),
      releaseReserved: input.releaseReserved ?? (requestType === 'CANCEL' ? 1 : 0),
      packageCondition: input.packageCondition || '完好',
      remark: input.remark || '',
      tracking: input.tracking || '',
      shopName: shop.name,
      qc: isReturn ? '待质检' : '不适用',
      qcDecision: isReturn ? 'pending' : 'not_applicable',
      refundStatus: 'pending',
      platformSync: '等待平台确认',
      refundMethod: 'platform_original',
      uiStatus: isCancel
        ? toUiCancelStatus(fulfillmentStatus)
        : isReturn
          ? toUiTicketStatus(input.status || '待确认')
          : toUiTicketStatus(input.status || '待确认'),
      returnStatus: isReturn ? toUiReturnStatus(fulfillmentStatus) : '',
      cancelStatus: isCancel ? toUiCancelStatus(fulfillmentStatus) : '',
    }

    let reverseId: string
    if (existing) {
      reverseId = existing.id
      const merged = { ...rawOf(existing), ...rawBase }
      await tx
        .update(reverseOrders)
        .set({
          orderId,
          externalTradeOrderId: input.externalTradeOrderId || existing.externalTradeOrderId,
          requestType,
          platformStatus: input.platformStatus || existing.platformStatus || 'REVERSE_REQUESTED',
          fulfillmentStatus,
          platformUpdatedAt: new Date(),
          raw: merged,
          updatedAt: new Date(),
        })
        .where(eq(reverseOrders.id, existing.id))
    } else {
      reverseId = createId()
      await tx.insert(reverseOrders).values({
        id: reverseId,
        organizationId,
        shopId: shop.id,
        externalReverseOrderId: input.externalReverseOrderId,
        orderId,
        externalTradeOrderId: input.externalTradeOrderId || null,
        requestType,
        platformStatus: input.platformStatus || 'REVERSE_REQUESTED',
        fulfillmentStatus,
        platformCreatedAt: new Date(),
        platformUpdatedAt: new Date(),
        raw: rawBase,
      })
    }

    const lines =
      input.lines && input.lines.length > 0
        ? input.lines
        : [
            {
              externalReverseLineId: `${input.externalReverseOrderId}-L1`,
              reasonCode: input.reasonCode,
              reasonText: input.reason,
              refundAmount: input.refundAmount,
              currency: input.currency,
              qty: input.qty ?? input.returned ?? 1,
              sku: input.sku,
            },
          ]

    for (const line of lines) {
      const [existLine] = await tx
        .select()
        .from(reverseOrderItems)
        .where(
          and(
            eq(reverseOrderItems.shopId, shop.id),
            eq(reverseOrderItems.externalReverseLineId, line.externalReverseLineId),
          ),
        )
        .limit(1)
      const lineRaw: RawMeta = {
        qty: line.qty ?? 1,
        sku: line.sku || input.sku || '',
        variantId: variant?.id || '',
      }
      if (existLine) {
        await tx
          .update(reverseOrderItems)
          .set({
            reverseStatus: fulfillmentStatus,
            reasonCode: line.reasonCode || null,
            reasonText: line.reasonText || null,
            refundAmount:
              line.refundAmount != null ? String(line.refundAmount) : existLine.refundAmount,
            currency: line.currency || existLine.currency,
            raw: { ...rawOf(existLine), ...lineRaw },
            updatedAt: new Date(),
          })
          .where(eq(reverseOrderItems.id, existLine.id))
      } else {
        await tx.insert(reverseOrderItems).values({
          id: createId(),
          organizationId,
          shopId: shop.id,
          reverseOrderId: reverseId,
          externalReverseLineId: line.externalReverseLineId,
          orderLineId: line.orderLineId || null,
          externalOrderLineId: line.externalOrderLineId || null,
          reverseStatus: fulfillmentStatus,
          reasonCode: line.reasonCode || null,
          reasonText: line.reasonText || null,
          refundAmount: line.refundAmount != null ? String(line.refundAmount) : null,
          currency: line.currency || input.currency || 'USD',
          isNeedRefund: (line.refundAmount ?? input.refundAmount ?? 0) > 0,
          raw: lineRaw,
        })
      }
    }

    if ((input.refundAmount ?? 0) > 0) {
      const [existRefund] = await tx
        .select()
        .from(refunds)
        .where(and(eq(refunds.organizationId, organizationId), eq(refunds.reverseOrderId, reverseId)))
        .limit(1)
      if (!existRefund) {
        await tx.insert(refunds).values({
          id: createId(),
          organizationId,
          shopId: shop.id,
          reverseOrderId: reverseId,
          externalRefundId: `RF-${input.externalReverseOrderId}`,
          amount: String(input.refundAmount ?? 0),
          currency: input.currency || 'USD',
          status: 'pending',
        })
      }
    }

    if (isReturn) {
      const [existShip] = await tx
        .select()
        .from(returnShipments)
        .where(
          and(
            eq(returnShipments.organizationId, organizationId),
            eq(returnShipments.reverseOrderId, reverseId),
          ),
        )
        .limit(1)
      if (!existShip) {
        await tx.insert(returnShipments).values({
          id: createId(),
          organizationId,
          shopId: shop.id,
          reverseOrderId: reverseId,
          trackingNumber: input.tracking || null,
          status: fulfillmentStatus === 'pending_receive' ? 'pending' : 'in_transit',
          raw: { warehouse: input.warehouse || DEFAULT_WAREHOUSE, bin: input.bin || DEFAULT_BIN },
        })
      }
    }

    await appendEvent(
      tx,
      organizationId,
      reverseId,
      existing ? 'upsert' : 'create',
      existing ? `同步更新 ${input.externalReverseOrderId}` : `创建售后 ${uiId}`,
    )

    const [fresh] = await tx.select().from(reverseOrders).where(eq(reverseOrders.id, reverseId)).limit(1)
    return toTicketDto(fresh!, await loadRelated(tx, organizationId, fresh!))
  })
}

/**
 * 平台售后列表 OpenAPI 尚未接线（marketplace 仅有 reverse cancel validate/create）。
 * 由 apps/api cron 调用 connector.listReverseOrders 后映射为 UpsertAftersaleInput，
 * 再经 ingestReverse 落库并按店铺策略释放占库 / 排期退款。
 * 控制台手工登记请用 createTicket / createCancel。
 */
export async function syncAftersaleFromPlatform(
  _db: AppDatabase,
  _organizationId: string,
  _input: { shopId?: string; limit?: number } = {},
): Promise<never> {
  throw new Error(
    '平台售后列表 OpenAPI 未接线（仅有取消校验/创建写接口）。本轮只读同步不含售后拉取；禁止写入演示逆向单。请手工登记或等待售后读同步落地。',
  )
}

/** @deprecated 使用 syncAftersaleFromPlatform；保留别名避免旧调用静默写假数据。 */
export async function syncAftersaleStub(
  db: AppDatabase,
  organizationId: string,
  input: { shopId?: string; limit?: number } = {},
) {
  return syncAftersaleFromPlatform(db, organizationId, input)
}

export async function createTicket(
  db: AppDatabase,
  organizationId: string,
  input: {
    order: string
    sku: string
    type: string
    reason: string
    refund: number
    currency: string
    returned?: number
    qc?: string
    status?: string
    shop?: string
  },
): Promise<AftersaleTicketDto> {
  if (!input.order.trim()) throw new Error('平台订单号不能为空')
  if (!input.sku.trim()) throw new Error('内部 SKU 不能为空')
  if (!input.reason.trim()) throw new Error('售后原因不能为空')
  const ext = `MANUAL-${Date.now()}`
  const uiId = `AS-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
  return upsertAftersale(db, organizationId, {
    shopName: input.shop,
    externalReverseOrderId: ext,
    externalTradeOrderId: input.order.trim(),
    typeLabel: input.type,
    uiId,
    reason: input.reason.trim(),
    refundAmount: input.refund,
    currency: input.currency,
    sku: input.sku.trim(),
    qty: input.returned ?? 0,
    returned: input.returned ?? 0,
    status: input.status || '待确认',
  })
}

export async function createCancel(
  db: AppDatabase,
  organizationId: string,
  input: {
    order: string
    shop: string
    sku: string
    type: string
    reason: string
    refund: number
    currency: string
    releaseReserved?: number
    warehouse?: string
    bin?: string
    remark?: string
  },
): Promise<AftersaleCancelDto> {
  if (!input.order.trim()) throw new Error('平台订单号不能为空')
  if (!input.sku.trim()) throw new Error('SKU 不能为空')
  if (!input.reason.trim()) throw new Error('原因不能为空')
  const ext = `REV-MANUAL-${Date.now()}`
  const uiId = `AS-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`
  const ticket = await upsertAftersale(db, organizationId, {
    shopName: input.shop,
    externalReverseOrderId: ext,
    externalTradeOrderId: input.order.trim(),
    typeLabel: input.type,
    uiId,
    reason: input.reason.trim(),
    reasonCode: input.type === '取消订单' ? 'BUYER_CANCEL' : 'REFUND_ONLY',
    refundAmount: input.refund,
    currency: input.currency,
    sku: input.sku.trim(),
    warehouse: input.warehouse,
    bin: input.bin,
    releaseReserved: input.releaseReserved ?? 0,
    remark: input.remark,
    status: '待确认',
  })
  const cancel = await getCancel(db, organizationId, ticket.reverseOrderId)
  if (!cancel) throw new Error('创建取消单失败')
  return cancel
}

export async function registerReturnReceive(
  db: AppDatabase,
  organizationId: string,
  input: {
    id: string
    order?: string
    shop?: string
    sku?: string
    warehouse?: string
    bin: string
    tracking: string
    qty: number
    packageCondition?: string
    remark?: string
  },
): Promise<AftersaleReturnDto> {
  const tracking = input.tracking.trim()
  const qty = Number(input.qty)
  if (!tracking) throw new Error('寄回运单号不能为空')
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('实收数量必须为正整数')
  if (!input.bin.trim()) throw new Error('收货库位不能为空')

  let ro = await findReverseByIdOrUi(db, organizationId, input.id.trim())
  if (!ro) {
    const ticket = await upsertAftersale(db, organizationId, {
      shopName: input.shop,
      externalReverseOrderId: `RETURN-${input.id.trim()}`,
      externalTradeOrderId: input.order,
      typeLabel: '退货退款',
      uiId: input.id.trim(),
      sku: input.sku,
      warehouse: input.warehouse,
      bin: input.bin,
      qty,
      tracking,
      status: '待收货确认',
    })
    ro = (await findReverseByIdOrUi(db, organizationId, ticket.reverseOrderId))!
  }

  return db.transaction(async (tx) => {
    // re-read inside txn
    ro = (await findReverseByIdOrUi(tx, organizationId, ro!.id))!
    const raw = rawOf(ro)
    const currentStatus = toUiReturnStatus(str(raw.returnStatus) || ro.fulfillmentStatus)
    if (currentStatus !== '待收货确认' && str(raw.receivedAt)) {
      throw new Error(`${pickUiId(ro, ro.externalReverseOrderId)} 已收货，请勿重复登记`)
    }

    const [shipment] = await tx
      .select()
      .from(returnShipments)
      .where(
        and(
          eq(returnShipments.organizationId, organizationId),
          eq(returnShipments.reverseOrderId, ro.id),
        ),
      )
      .limit(1)
    const now = new Date()
    if (shipment) {
      await tx
        .update(returnShipments)
        .set({
          trackingNumber: tracking,
          status: 'received',
          receivedAt: now,
          raw: {
            ...rawOf(shipment),
            warehouse: input.warehouse || str(raw.warehouse, DEFAULT_WAREHOUSE),
            bin: input.bin.trim(),
            packageCondition: input.packageCondition || '完好',
          },
          updatedAt: now,
        })
        .where(eq(returnShipments.id, shipment.id))
    } else {
      await tx.insert(returnShipments).values({
        id: createId(),
        organizationId,
        shopId: ro.shopId,
        reverseOrderId: ro.id,
        trackingNumber: tracking,
        status: 'received',
        receivedAt: now,
        raw: {
          warehouse: input.warehouse || DEFAULT_WAREHOUSE,
          bin: input.bin.trim(),
          packageCondition: input.packageCondition || '完好',
        },
      })
    }

    const nextRaw: RawMeta = {
      ...raw,
      warehouse: input.warehouse || str(raw.warehouse, DEFAULT_WAREHOUSE),
      bin: input.bin.trim(),
      tracking,
      qty,
      returned: qty,
      sku: input.sku || str(raw.sku),
      packageCondition: input.packageCondition || '完好',
      remark: input.remark || str(raw.remark),
      receivedAt: formatStamp(now),
      returnStatus: '待质检',
      uiStatus: '待确认',
      qc: '待质检',
      qcDecision: 'pending',
      platformStatus: 'RETURN_RECEIVED',
    }
    await tx
      .update(reverseOrders)
      .set({
        fulfillmentStatus: 'pending_qc',
        platformStatus: 'RETURN_RECEIVED',
        platformUpdatedAt: now,
        raw: nextRaw,
        updatedAt: now,
      })
      .where(eq(reverseOrders.id, ro.id))

    await appendEvent(tx, organizationId, ro.id, 'receive', `登记收货 ${tracking} × ${qty}`)
    const fresh = (await findReverseByIdOrUi(tx, organizationId, ro.id))!
    return toReturnDto(fresh, await loadRelated(tx, organizationId, fresh))
  })
}

async function ensureBalance(
  db: DbLike,
  organizationId: string,
  warehouseCode: string,
  binCode: string,
  variantId: string,
) {
  const [balance] = await db
    .select()
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.organizationId, organizationId),
        eq(inventoryBalances.warehouseCode, warehouseCode),
        eq(inventoryBalances.binCode, binCode),
        eq(inventoryBalances.variantId, variantId),
      ),
    )
    .limit(1)
  if (balance) return balance
  const id = createId()
  await db.insert(inventoryBalances).values({
    id,
    organizationId,
    warehouseCode,
    binCode,
    variantId,
    onHand: 0,
    reserved: 0,
    damaged: 0,
  })
  const [created] = await db.select().from(inventoryBalances).where(eq(inventoryBalances.id, id)).limit(1)
  return created!
}

export async function completeReturnQc(
  db: AppDatabase,
  organizationId: string,
  input: { id: string; qcPass: number; qcDefect: number; actor?: string },
): Promise<{ row: AftersaleReturnDto; note: string }> {
  return db.transaction(async (tx) => {
    const ro = await findReverseByIdOrUi(tx, organizationId, input.id)
    if (!ro) throw new Error('退货单不存在')
    const raw = rawOf(ro)
    const status = toUiReturnStatus(str(raw.returnStatus) || ro.fulfillmentStatus)
    if (status !== '待质检' && status !== '质检中') {
      throw new Error(`当前状态「${status}」不可质检过账`)
    }
    const pass = Number(input.qcPass)
    const defect = Number(input.qcDefect)
    const qty = num(raw.qty, 1)
    if (!Number.isFinite(pass) || pass < 0 || !Number.isFinite(defect) || defect < 0) {
      throw new Error('合格 / 残次数量无效')
    }
    if (pass + defect !== qty) throw new Error(`合格+残次必须等于实收数量 ${qty}`)

    const actor = input.actor?.trim() || '当前用户'
    const warehouse = str(raw.warehouse, DEFAULT_WAREHOUSE)
    const bin = str(raw.bin, DEFAULT_BIN)
    let variantId = str(raw.variantId)
    const sku = str(raw.sku)
    if (!variantId && sku) {
      const v = await resolveVariantBySku(tx, organizationId, sku)
      variantId = v?.id || ''
    }
    if (!variantId) throw new Error('无法解析 SKU 变体，无法过账')

    const notes: string[] = []
    let restockLedgerId = str(raw.restockLedgerId)
    let scrapLedgerId = str(raw.scrapLedgerId)
    const ext = ro.externalReverseOrderId
    const lineId = (
      await tx
        .select({ id: reverseOrderItems.id })
        .from(reverseOrderItems)
        .where(eq(reverseOrderItems.reverseOrderId, ro.id))
        .limit(1)
    )[0]?.id

    if (pass > 0) {
      const idem = `ledger:aftersale_restock:${ext}`
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
      const balance = await ensureBalance(tx, organizationId, warehouse, bin, variantId)
      if (!dup) {
        const onHandAfter = balance.onHand + pass
        await tx
          .update(inventoryBalances)
          .set({
            onHand: onHandAfter,
            version: balance.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(inventoryBalances.id, balance.id))
        await tx.insert(inventoryMovements).values({
          id: createId(),
          organizationId,
          shopId: ro.shopId,
          variantId,
          warehouseCode: warehouse,
          binCode: bin,
          movementType: 'aftersale_restock',
          qtyDelta: pass,
          onHandAfter,
          reservedAfter: balance.reserved,
          qcHoldAfter: balance.qcHold,
          damagedAfter: balance.damaged,
          sourceType: 'aftersale_return',
          sourceId: ro.id,
          operator: actor,
          idempotencyKey: idem,
          occurredAt: new Date(),
          raw: { reason: `售后回库 ${pickUiId(ro, ext)}`, sku, qty: pass, lineId },
        })
        notes.push(`回库流水 ${idem}`)
        // 回库写 on_hand，available 变化：重算该 variant 预警。
        await recomputeStockAlerts(tx, organizationId, [variantId])
      } else {
        notes.push(`回库幂等命中 ${dup.id}`)
      }
      restockLedgerId = idem
    }

    if (defect > 0) {
      const idem = `ledger:aftersale_scrap:${ext}`
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
      // re-read after possible restock in same txn
      const balance = await ensureBalance(tx, organizationId, warehouse, bin, variantId)
      if (!dup) {
        const damagedAfter = balance.damaged + defect
        await tx
          .update(inventoryBalances)
          .set({
            damaged: damagedAfter,
            version: balance.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(inventoryBalances.id, balance.id))
        await tx.insert(inventoryMovements).values({
          id: createId(),
          organizationId,
          shopId: ro.shopId,
          variantId,
          warehouseCode: warehouse,
          binCode: bin,
          movementType: 'aftersale_scrap',
          qtyDelta: 0,
          onHandAfter: balance.onHand,
          reservedAfter: balance.reserved,
          qcHoldAfter: balance.qcHold,
          damagedAfter,
          sourceType: 'aftersale_return',
          sourceId: ro.id,
          operator: actor,
          idempotencyKey: idem,
          occurredAt: new Date(),
          raw: { reason: `售后报损 ${pickUiId(ro, ext)}`, sku, qty: defect, lineId },
        })
        notes.push(`报损流水 ${idem}`)
        // 报损写 damaged，available 变化：重算该 variant 预警。
        await recomputeStockAlerts(tx, organizationId, [variantId])
      } else {
        notes.push(`报损幂等命中 ${dup.id}`)
      }
      scrapLedgerId = idem
    }

    const qcDecision =
      pass > 0 && defect > 0 ? 'partial_restock' : pass > 0 ? 'restock' : 'scrap'
    const returnStatus: UiReturnStatus =
      pass > 0 && defect > 0 ? '部分回库' : pass > 0 ? '已回库' : '已报损'
    const now = new Date()

    if (lineId) {
      await tx.insert(reverseQcRecords).values({
        id: createId(),
        organizationId,
        reverseOrderLineId: lineId,
        qcDecision,
        qcAt: now,
        warehouseCode: warehouse,
        raw: { qcPass: pass, qcDefect: defect, actor },
      })
      await tx
        .update(reverseOrderItems)
        .set({
          qcDecision,
          reverseStatus: toDbReturnStatus(returnStatus),
          updatedAt: now,
        })
        .where(eq(reverseOrderItems.id, lineId))
    }

    const nextRaw: RawMeta = {
      ...raw,
      qcPass: pass,
      qcDefect: defect,
      restock: pass,
      scrap: defect,
      qc: `合格 ${pass} / 残次 ${defect}`,
      qcDecision,
      inspectedAt: formatStamp(now),
      returnStatus,
      uiStatus: '已入库',
      restockLedgerId,
      scrapLedgerId,
      refundStatus: 'processing',
    }
    await tx
      .update(reverseOrders)
      .set({
        fulfillmentStatus: toDbReturnStatus(returnStatus),
        raw: nextRaw,
        platformUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(reverseOrders.id, ro.id))

    await appendEvent(
      tx,
      organizationId,
      ro.id,
      'qc_complete',
      `质检完成 合格 ${pass} / 残次 ${defect}`,
      lineId,
    )

    const fresh = (await findReverseByIdOrUi(tx, organizationId, ro.id))!
    return {
      row: toReturnDto(fresh, await loadRelated(tx, organizationId, fresh)),
      note: notes.join('；') || '质检完成',
    }
  })
}

/**
 * 取消审核通过：对关联订单未发货占库写 order_release（幂等键 aftersale_cancel_release）。
 * 已出库订单取消不在本迭代做冲销出库。
 */
export async function approveCancel(
  db: AppDatabase,
  organizationId: string,
  id: string,
  actor?: string,
): Promise<{ row: AftersaleCancelDto; note: string }> {
  return db.transaction(async (tx) => {
    const ro = await findReverseByIdOrUi(tx, organizationId, id)
    if (!ro) throw new Error('取消/退款单不存在')
    const raw = rawOf(ro)
    const status = toUiCancelStatus(str(raw.cancelStatus) || ro.fulfillmentStatus)
    if (status !== '待确认') throw new Error(`当前状态「${status}」不可审核`)

    const operator = actor?.trim() || '当前用户'
    const notes: string[] = []
    let releaseLedgerId = str(raw.releaseLedgerId)
    let releasedAt = str(raw.releasedAt)
    const typeLabel = str(raw.typeLabel) || (ro.requestType === 'ONLY_REFUND' ? '仅退款' : '取消订单')
    const releaseReserved = num(raw.releaseReserved)
    const shouldRelease = typeLabel === '取消订单' && releaseReserved > 0

    if (shouldRelease) {
      if (!ro.orderId) {
        notes.push('无关联订单，跳过释放占库（可手工补关联后重试）')
      } else {
        const [order] = await tx.select().from(orders).where(eq(orders.id, ro.orderId)).limit(1)
        if (!order) {
          notes.push('关联订单不存在，跳过释放')
        } else if (order.fulfillmentStatus === 'shipped' || order.status === 'shipped') {
          notes.push('订单已出库：本迭代不做冲销出库，仅标记审核通过')
        } else {
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
          if (reservations.length === 0) {
            notes.push('无 active 占库记录可释放')
          }
          for (const res of reservations) {
            const idem = `ledger:aftersale_cancel_release:${ro.externalReverseOrderId}:${res.orderLineId}`
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
                shopId: ro.shopId,
                variantId: res.variantId,
                warehouseCode: balance.warehouseCode,
                binCode: balance.binCode,
                movementType: 'order_release',
                qtyDelta: 0,
                onHandAfter: balance.onHand,
                reservedAfter,
                qcHoldAfter: balance.qcHold,
                damagedAfter: balance.damaged,
                sourceType: 'aftersale_cancel',
                sourceId: ro.id,
                operator,
                idempotencyKey: idem,
                occurredAt: new Date(),
                raw: {
                  reason: `取消释放占库 ${order.externalOrderId}`,
                  qty: res.qty,
                  orderLineId: res.orderLineId,
                  externalReverseId: ro.externalReverseOrderId,
                },
              })
              releaseLedgerId = idem
              notes.push(`释放锁定 ${res.qty} · 流水 ${idem}`)
              // 释放占库改 reserved，available 变化：重算该 variant 预警。
              await recomputeStockAlerts(tx, organizationId, [res.variantId])
            } else if (dup) {
              releaseLedgerId = idem
              notes.push(`释放幂等命中 ${dup.id}`)
            }
            await tx
              .update(inventoryReservations)
              .set({ status: 'released', releasedAt: new Date(), updatedAt: new Date() })
              .where(eq(inventoryReservations.id, res.id))
          }
          releasedAt = formatStamp(new Date())
          await tx
            .update(orders)
            .set({
              fulfillmentStatus: 'unfulfilled',
              status: order.status === 'cancelled' ? order.status : 'cancelled',
              updatedAt: new Date(),
            })
            .where(eq(orders.id, order.id))
        }
      }
    } else {
      notes.push('仅退款不释放锁定、不虚增库存')
    }

    const now = new Date()
    const refundAmount = num(raw.refundAmount)
    const [refund] = await tx
      .select()
      .from(refunds)
      .where(and(eq(refunds.organizationId, organizationId), eq(refunds.reverseOrderId, ro.id)))
      .limit(1)
    if (refund && refundAmount > 0) {
      await tx
        .update(refunds)
        .set({ status: 'refunded', refundedAt: now, updatedAt: now })
        .where(eq(refunds.id, refund.id))
      notes.unshift(`退款 ${refundAmount} ${str(raw.currency, 'USD')} 已记账`)
    } else if (refundAmount > 0) {
      notes.unshift(`退款 ${refundAmount} ${str(raw.currency, 'USD')} 已记账（无独立 refund 行）`)
    }

    const nextRaw: RawMeta = {
      ...raw,
      cancelStatus: '已审核',
      uiStatus: '已审核',
      platformSync: '待回传平台',
      refundStatus: refundAmount > 0 ? 'refunded' : 'not_applicable',
      refundedAt: refundAmount > 0 ? formatStamp(now) : '',
      releaseLedgerId,
      releasedAt,
    }
    await tx
      .update(reverseOrders)
      .set({
        fulfillmentStatus: 'approved',
        platformStatus: 'REVERSE_APPROVED',
        platformUpdatedAt: now,
        raw: nextRaw,
        updatedAt: now,
      })
      .where(eq(reverseOrders.id, ro.id))

    await appendEvent(tx, organizationId, ro.id, 'approve_cancel', notes.join('；') || '审核通过')

    const fresh = (await findReverseByIdOrUi(tx, organizationId, ro.id))!
    return {
      row: toCancelDto(fresh, await loadRelated(tx, organizationId, fresh)),
      note: notes.join('；'),
    }
  })
}

export async function rejectCancel(
  db: AppDatabase,
  organizationId: string,
  id: string,
  reason?: string,
  actor?: string,
): Promise<AftersaleCancelDto> {
  return db.transaction(async (tx) => {
    const ro = await findReverseByIdOrUi(tx, organizationId, id)
    if (!ro) throw new Error('取消/退款单不存在')
    const raw = rawOf(ro)
    const status = toUiCancelStatus(str(raw.cancelStatus) || ro.fulfillmentStatus)
    if (status !== '待确认') throw new Error(`当前状态「${status}」不可驳回`)
    const now = new Date()
    const nextRaw: RawMeta = {
      ...raw,
      cancelStatus: '已驳回',
      uiStatus: '已驳回',
      remark: reason || str(raw.remark),
      platformSync: '待回传平台',
    }
    await tx
      .update(reverseOrders)
      .set({
        fulfillmentStatus: 'rejected',
        platformStatus: 'REVERSE_REJECTED',
        platformUpdatedAt: now,
        raw: nextRaw,
        updatedAt: now,
      })
      .where(eq(reverseOrders.id, ro.id))
    await appendEvent(
      tx,
      organizationId,
      ro.id,
      'reject_cancel',
      reason || `驳回 by ${actor || '当前用户'}`,
    )
    const fresh = (await findReverseByIdOrUi(tx, organizationId, ro.id))!
    return toCancelDto(fresh, await loadRelated(tx, organizationId, fresh))
  })
}

export async function updateRefundStatus(
  db: AppDatabase,
  organizationId: string,
  input: { id: string; status: string; refundedAt?: string },
): Promise<AftersaleTicketDto> {
  const ro = await findReverseByIdOrUi(db, organizationId, input.id)
  if (!ro) throw new Error('售后单不存在')
  const [refund] = await db
    .select()
    .from(refunds)
    .where(and(eq(refunds.organizationId, organizationId), eq(refunds.reverseOrderId, ro.id)))
    .limit(1)
  if (refund) {
    await db
      .update(refunds)
      .set({
        status: input.status,
        refundedAt: input.status === 'refunded' ? new Date() : refund.refundedAt,
        updatedAt: new Date(),
      })
      .where(eq(refunds.id, refund.id))
  }
  const raw = { ...rawOf(ro), refundStatus: input.status }
  await db
    .update(reverseOrders)
    .set({ raw, updatedAt: new Date() })
    .where(eq(reverseOrders.id, ro.id))
  return (await getTicket(db, organizationId, ro.id))!
}

// silence
void toDbTicketStatus

// ---------------------------------------------------------------------------
// 店铺策略（售后 + 库存推送 / 改价回写开关）+ 取消占库释放 + 退款决定
// @see docs/design/aftersale-cancel-ingest-and-policy.md
// ---------------------------------------------------------------------------

export type AftersalePolicyDto = {
  shopId: string
  shopName: string
  platform: string
  inventoryReleaseMode: string
  refundMode: string
  refundWaitDays: number
  /** 平台是否提供 seller decide 接口（决定自动退款是否可选）。 */
  refundAutoSupported: boolean
  inventoryPushEnabled: boolean
  priceWritebackEnabled: boolean
  updatedAt: string
}

const REFUND_AUTO_PLATFORMS = new Set(['lazada'])

function platformSupportsAutoRefund(platform: string | null | undefined): boolean {
  return Boolean(platform && REFUND_AUTO_PLATFORMS.has(platform))
}

export async function listAftersalePolicies(
  db: AppDatabase,
  organizationId: string,
): Promise<AftersalePolicyDto[]> {
  const shopRows = await db
    .select()
    .from(shops)
    .where(and(eq(shops.organizationId, organizationId), isNull(shops.deletedAt)))
    .orderBy(desc(shops.updatedAt))
  if (shopRows.length === 0) return []
  const shopIds = shopRows.map((s) => s.id)
  const policyRows = await db
    .select()
    .from(shopAftersalePolicies)
    .where(inArray(shopAftersalePolicies.shopId, shopIds))
  const byShop = new Map(policyRows.map((p) => [p.shopId, p]))
  return shopRows.map((s) => {
    const p = byShop.get(s.id)
    return {
      shopId: s.id,
      shopName: s.name,
      platform: s.platform,
      inventoryReleaseMode: p?.inventoryReleaseMode ?? 'manual',
      refundMode: p?.refundMode ?? 'manual',
      refundWaitDays: p?.refundWaitDays ?? 1,
      refundAutoSupported: platformSupportsAutoRefund(s.platform),
      inventoryPushEnabled: s.inventoryPushEnabled !== false,
      priceWritebackEnabled: s.priceWritebackEnabled !== false,
      updatedAt: formatStamp(p?.updatedAt ?? s.updatedAt),
    }
  })
}

export async function getAftersalePolicy(
  db: AppDatabase,
  organizationId: string,
  shopId: string,
): Promise<AftersalePolicyDto | null> {
  const [shop] = await db
    .select()
    .from(shops)
    .where(and(eq(shops.organizationId, organizationId), eq(shops.id, shopId)))
    .limit(1)
  if (!shop) return null
  const [p] = await db
    .select()
    .from(shopAftersalePolicies)
    .where(eq(shopAftersalePolicies.shopId, shopId))
    .limit(1)
  return {
    shopId: shop.id,
    shopName: shop.name,
    platform: shop.platform,
    inventoryReleaseMode: p?.inventoryReleaseMode ?? 'manual',
    refundMode: p?.refundMode ?? 'manual',
    refundWaitDays: p?.refundWaitDays ?? 1,
    refundAutoSupported: platformSupportsAutoRefund(shop.platform),
    inventoryPushEnabled: shop.inventoryPushEnabled !== false,
    priceWritebackEnabled: shop.priceWritebackEnabled !== false,
    updatedAt: formatStamp(p?.updatedAt ?? shop.updatedAt),
  }
}

export async function upsertAftersalePolicy(
  db: AppDatabase,
  organizationId: string,
  input: {
    shopId: string
    inventoryReleaseMode: 'manual' | 'auto'
    refundMode: 'manual' | 'auto'
    refundWaitDays?: number
    inventoryPushEnabled?: boolean
    priceWritebackEnabled?: boolean
  },
): Promise<AftersalePolicyDto> {
  const [shop] = await db
    .select()
    .from(shops)
    .where(and(eq(shops.organizationId, organizationId), eq(shops.id, input.shopId)))
    .limit(1)
  if (!shop) throw new Error('店铺不存在')
  const refundWaitDays =
    Number.isFinite(input.refundWaitDays) && (input.refundWaitDays ?? 1) >= 0
      ? Math.floor(input.refundWaitDays as number)
      : 1
  if (input.refundMode === 'auto' && !platformSupportsAutoRefund(shop.platform)) {
    throw new Error(`${shop.platform} 平台未提供同意退款接口，自动退款不可选`)
  }
  const shopPatch: { inventoryPushEnabled?: boolean; priceWritebackEnabled?: boolean; updatedAt: Date } = {
    updatedAt: new Date(),
  }
  if (input.inventoryPushEnabled != null) shopPatch.inventoryPushEnabled = input.inventoryPushEnabled
  if (input.priceWritebackEnabled != null) shopPatch.priceWritebackEnabled = input.priceWritebackEnabled
  if (input.inventoryPushEnabled != null || input.priceWritebackEnabled != null) {
    await db.update(shops).set(shopPatch).where(eq(shops.id, input.shopId))
  }
  const [existing] = await db
    .select()
    .from(shopAftersalePolicies)
    .where(eq(shopAftersalePolicies.shopId, input.shopId))
    .limit(1)
  const now = new Date()
  if (existing) {
    await db
      .update(shopAftersalePolicies)
      .set({
        inventoryReleaseMode: input.inventoryReleaseMode,
        refundMode: input.refundMode,
        refundWaitDays,
        updatedAt: now,
      })
      .where(eq(shopAftersalePolicies.id, existing.id))
  } else {
    await db.insert(shopAftersalePolicies).values({
      id: createId(),
      organizationId,
      shopId: input.shopId,
      inventoryReleaseMode: input.inventoryReleaseMode,
      refundMode: input.refundMode,
      refundWaitDays,
    })
  }
  const fresh = await getAftersalePolicy(db, organizationId, input.shopId)
  if (!fresh) throw new Error('策略保存失败')
  return fresh
}

// ---------------------------------------------------------------------------
// ingestReverse：从平台同步建档并按策略释放占库 / 排期退款
// ---------------------------------------------------------------------------

export type IngestReverseInput = UpsertAftersaleInput & {
  platformCreatedAt?: string | Date | null
  slaAt?: string | Date | null
  disputeInProgress?: boolean
}

async function resolvePolicy(
  db: DbLike,
  organizationId: string,
  shopId: string,
): Promise<{
  inventoryReleaseMode: 'manual' | 'auto'
  refundMode: 'manual' | 'auto'
  refundWaitDays: number
}> {
  const [p] = await db
    .select()
    .from(shopAftersalePolicies)
    .where(eq(shopAftersalePolicies.shopId, shopId))
    .limit(1)
  return {
    inventoryReleaseMode: (p?.inventoryReleaseMode as 'manual' | 'auto') ?? 'manual',
    refundMode: (p?.refundMode as 'manual' | 'auto') ?? 'manual',
    refundWaitDays: p?.refundWaitDays ?? 1,
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

function computeRefundDueAt(
  platformCreatedAt: Date | null,
  slaAt: Date | null,
  waitDays: number,
  now: Date,
): Date | null {
  if (!platformCreatedAt) return null
  const base = new Date(platformCreatedAt.getTime() + waitDays * DAY_MS)
  if (slaAt) {
    const slaFloor = new Date(slaAt.getTime() - 2 * 60 * 60 * 1000)
    if (base > slaFloor) return slaFloor
  }
  if (base < now) return now
  return base
}

/**
 * 从平台同步建档。CANCEL / ONLY_REFUND：
 * - 占库策略 auto 且为未发货 CANCEL → 同事务写 order_release
 * - 退款策略 auto 且平台支持 → 计算 refund_due_at，置 scheduled
 * - 否则保持 pending_manual
 * 退货（RETURN）按原 upsertAftersale 路径，不在此处理策略。
 */
export async function ingestReverse(
  db: AppDatabase,
  organizationId: string,
  input: IngestReverseInput,
): Promise<AftersaleCancelDto> {
  const ticket = await upsertAftersale(db, organizationId, input)
  const ro = await findReverseByIdOrUi(db, organizationId, ticket.reverseOrderId)
  if (!ro) throw new Error('建档失败：未找到逆向单')

  const requestType = (ro.requestType || '').toUpperCase()
  if (requestType !== 'CANCEL' && requestType !== 'ONLY_REFUND') {
    return (await getCancel(db, organizationId, ro.id))!
  }

  const policy = await resolvePolicy(db, organizationId, ro.shopId)
  const platformCreatedAt = input.platformCreatedAt
    ? input.platformCreatedAt instanceof Date
      ? input.platformCreatedAt
      : new Date(input.platformCreatedAt)
    : ro.platformCreatedAt ?? ro.createdAt
  const slaAt = input.slaAt
    ? input.slaAt instanceof Date
      ? input.slaAt
      : new Date(input.slaAt)
    : null
  const now = new Date()

  let releaseStatus = ro.inventoryReleaseStatus as ReleaseStatus
  let releasedAt = ro.inventoryReleasedAt
  if (
    requestType === 'CANCEL' &&
    policy.inventoryReleaseMode === 'auto' &&
    releaseStatus !== 'released'
  ) {
    const result = await releaseReservedInternal(db, organizationId, ro.id, 'system.sync')
    releaseStatus = result.status
    releasedAt = result.releasedAt
  }

  let refundDecision = ro.refundDecision as RefundDecision
  let refundDueAt = ro.refundDueAt
  const [shop] = await db.select().from(shops).where(eq(shops.id, ro.shopId)).limit(1)
  const autoSupported = platformSupportsAutoRefund(shop?.platform)
  if (policy.refundMode === 'auto' && autoSupported) {
    const due = computeRefundDueAt(platformCreatedAt, slaAt, policy.refundWaitDays, now)
    refundDueAt = due
    refundDecision = 'scheduled'
  } else if (!autoSupported) {
    refundDecision = 'unsupported'
  } else {
    refundDecision = 'pending_manual'
  }

  await db
    .update(reverseOrders)
    .set({
      inventoryReleaseMode: policy.inventoryReleaseMode,
      inventoryReleaseStatus: releaseStatus,
      inventoryReleasedAt: releasedAt,
      refundMode: policy.refundMode,
      refundWaitDays: policy.refundWaitDays,
      refundDecision,
      refundDueAt,
      updatedAt: now,
    })
    .where(eq(reverseOrders.id, ro.id))

  return (await getCancel(db, organizationId, ro.id))!
}

// ---------------------------------------------------------------------------
// releaseReserved：手动或自动释放未发货占库
// ---------------------------------------------------------------------------

async function releaseReservedInternal(
  db: AppDatabase,
  organizationId: string,
  id: string,
  actor: string,
): Promise<{ status: ReleaseStatus; releasedAt: Date | null; note: string }> {
  return db.transaction(async (tx) => {
    const ro = await findReverseByIdOrUi(tx, organizationId, id)
    if (!ro) throw new Error('取消/退款单不存在')
    const requestType = (ro.requestType || '').toUpperCase()
    if (requestType !== 'CANCEL') {
      await markReleaseSkipped(tx, ro, 'skipped', '仅退款/退货不释放占库')
      return { status: 'skipped', releasedAt: null, note: '仅退款/退货不释放占库' }
    }
    if (!ro.orderId) {
      await markReleaseSkipped(tx, ro, 'skipped', '无关联订单')
      return { status: 'skipped', releasedAt: null, note: '无关联订单' }
    }
    const [order] = await tx.select().from(orders).where(eq(orders.id, ro.orderId)).limit(1)
    if (!order) {
      await markReleaseSkipped(tx, ro, 'skipped', '关联订单不存在')
      return { status: 'skipped', releasedAt: null, note: '关联订单不存在' }
    }
    if (order.fulfillmentStatus === 'shipped' || order.status === 'shipped') {
      await markReleaseSkipped(tx, ro, 'skipped', '订单已出库，本迭代不冲销')
      return { status: 'skipped', releasedAt: null, note: '订单已出库，本迭代不冲销' }
    }
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
    if (reservations.length === 0) {
      await markReleaseSkipped(tx, ro, 'skipped', '无 active 占库')
      return { status: 'skipped', releasedAt: null, note: '无 active 占库' }
    }
    const notes: string[] = []
    const now = new Date()
    for (const res of reservations) {
      const idem = `ledger:aftersale_cancel_release:${ro.externalReverseOrderId}:${res.orderLineId}`
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
            updatedAt: now,
          })
          .where(eq(inventoryBalances.id, balance.id))
        await tx.insert(inventoryMovements).values({
          id: createId(),
          organizationId,
          shopId: ro.shopId,
          variantId: res.variantId,
          warehouseCode: balance.warehouseCode,
          binCode: balance.binCode,
          movementType: 'order_release',
          qtyDelta: 0,
          onHandAfter: balance.onHand,
          reservedAfter,
          qcHoldAfter: balance.qcHold,
          damagedAfter: balance.damaged,
          sourceType: 'aftersale_cancel',
          sourceId: ro.id,
          operator: actor,
          idempotencyKey: idem,
          occurredAt: now,
          raw: {
            reason: `取消释放占库 ${order.externalOrderId}`,
            qty: res.qty,
            orderLineId: res.orderLineId,
            externalReverseId: ro.externalReverseOrderId,
          },
        })
        notes.push(`释放 ${res.qty} · ${idem}`)
        await recomputeStockAlerts(tx, organizationId, [res.variantId])
      } else if (dup) {
        notes.push(`幂等命中 ${dup.id}`)
      }
      await tx
        .update(inventoryReservations)
        .set({ status: 'released', releasedAt: now, updatedAt: now })
        .where(eq(inventoryReservations.id, res.id))
    }
    await tx
      .update(orders)
      .set({
        fulfillmentStatus: 'unfulfilled',
        status: order.status === 'cancelled' ? order.status : 'cancelled',
        updatedAt: now,
      })
      .where(eq(orders.id, order.id))
    await tx
      .update(reverseOrders)
      .set({
        inventoryReleaseStatus: 'released',
        inventoryReleasedAt: now,
        updatedAt: now,
      })
      .where(eq(reverseOrders.id, ro.id))
    await appendEvent(
      tx,
      organizationId,
      ro.id,
      'release_reserved',
      notes.join('；') || '释放占库',
    )
    return { status: 'released', releasedAt: now, note: notes.join('；') || '释放占库' }
  })
}

async function markReleaseSkipped(
  tx: Parameters<Parameters<AppDatabase['transaction']>[0]>[0],
  ro: typeof reverseOrders.$inferSelect,
  status: ReleaseStatus,
  reason: string,
) {
  await tx
    .update(reverseOrders)
    .set({
      inventoryReleaseStatus: status,
      updatedAt: new Date(),
    })
    .where(eq(reverseOrders.id, ro.id))
  await appendEvent(tx, ro.organizationId, ro.id, 'release_skip', reason)
}

export async function releaseReserved(
  db: AppDatabase,
  organizationId: string,
  id: string,
  actor?: string,
): Promise<{ row: AftersaleCancelDto; note: string }> {
  const result = await releaseReservedInternal(
    db,
    organizationId,
    id,
    actor?.trim() || '当前用户',
  )
  const row = await getCancel(db, organizationId, id)
  if (!row) throw new Error('取消单不存在')
  return { row, note: result.note }
}

// ---------------------------------------------------------------------------
// decideRefund：人工同意 / 拒绝；或取消已排期改为人工
// ---------------------------------------------------------------------------

export async function decideRefund(
  db: AppDatabase,
  organizationId: string,
  input: { id: string; action: 'agree' | 'reject'; reason?: string; actor?: string },
): Promise<AftersaleCancelDto> {
  return db.transaction(async (tx) => {
    const ro = await findReverseByIdOrUi(tx, organizationId, input.id)
    if (!ro) throw new Error('取消/退款单不存在')
    const decision = ro.refundDecision as RefundDecision
    if (decision === 'agreed' || decision === 'rejected') {
      throw new Error(`已${decision === 'agreed' ? '同意' : '拒绝'}，不可重复操作`)
    }
    const now = new Date()
    const next: RefundDecision = input.action === 'agree' ? 'agreed' : 'rejected'
    await tx
      .update(reverseOrders)
      .set({
        refundDecision: next,
        updatedAt: now,
      })
      .where(eq(reverseOrders.id, ro.id))
    // 平台 decide 接口由 apps/api 侧调用；此处只记录本地决定。
    // 退款完成（refunds.status=refunded）由后续同步回拉详情时更新。
    await appendEvent(
      tx,
      organizationId,
      ro.id,
      input.action === 'agree' ? 'refund_agree' : 'refund_reject',
      input.reason || `by ${input.actor?.trim() || '当前用户'}`,
    )
    const fresh = (await findReverseByIdOrUi(tx, organizationId, ro.id))!
    return toCancelDto(fresh, await loadRelated(tx, organizationId, fresh))
  })
}

export async function cancelScheduledRefund(
  db: AppDatabase,
  organizationId: string,
  id: string,
): Promise<AftersaleCancelDto> {
  return db.transaction(async (tx) => {
    const ro = await findReverseByIdOrUi(tx, organizationId, id)
    if (!ro) throw new Error('取消/退款单不存在')
    if (ro.refundDecision !== 'scheduled') {
      throw new Error('仅已排期单可改为人工')
    }
    await tx
      .update(reverseOrders)
      .set({ refundDecision: 'pending_manual', updatedAt: new Date() })
      .where(eq(reverseOrders.id, ro.id))
    await appendEvent(tx, organizationId, ro.id, 'refund_to_manual', '改为人工处理')
    const fresh = (await findReverseByIdOrUi(tx, organizationId, ro.id))!
    return toCancelDto(fresh, await loadRelated(tx, organizationId, fresh))
  })
}

// 到期退款决定的扫描与执行由 apps/api cron 负责：
// @see apps/api/src/lib/marketplace/aftersale-cron.ts runDueRefundDecisions
// apps/shop 不直接持有 db 客户端的 cron 调度，避免与 apps/api 双写。
