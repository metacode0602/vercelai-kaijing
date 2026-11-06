/**
 * 订单履约异常案件 dataaccess（模块12）。
 * 规则扫描：超时未发货 / 占库失败 / 拣货异常 / 同步失败；处理写 audit_events。
 */
import { and, count, desc, eq, ilike, inArray, lt, ne, or, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  auditEvents,
  fulfillmentAttempts,
  inventoryReservations,
  mappingExceptions,
  orderExceptionCases,
  orderLines,
  orders,
  shipments,
  shops,
  stockOutbounds,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  formatStamp,
  toDbExceptionKind,
  toDbExceptionStatus,
  toUiExceptionKind,
  toUiExceptionStatus,
  type UiOrderExceptionKind,
  type UiOrderExceptionStatus,
} from '@/lib/server/mappers/order-exceptions'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'
import { ensureSystemNotification } from '@/lib/server/dataaccess/notifications'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

const TIMEOUT_HOURS = 48

export type OrderExceptionDto = {
  id: string
  caseNo: string
  kind: UiOrderExceptionKind
  status: UiOrderExceptionStatus
  shopId: string
  shop: string
  orderId: string
  order: string
  orderLineId: string
  sellerSku: string
  internalSku: string
  title: string
  detail: string
  blocksFulfillment: boolean
  sourceType: string
  sourceId: string
  assignedTo: string
  resolution: string
  resolvedAt: string
  updatedAt: string
  createdAt: string
}

export type OrderExceptionActionDto = {
  id: string
  action: string
  actor: string
  result: string
  detail: string
  createdAt: string
}

function mapCase(
  row: typeof orderExceptionCases.$inferSelect,
  shopName: string,
): OrderExceptionDto {
  return {
    id: row.id,
    caseNo: row.caseNo,
    kind: toUiExceptionKind(row.kind),
    status: toUiExceptionStatus(row.status),
    shopId: row.shopId ?? '',
    shop: shopName || '—',
    orderId: row.orderId ?? '',
    order: row.externalOrderId || row.orderId || '—',
    orderLineId: row.orderLineId ?? '',
    sellerSku: row.sellerSku ?? '',
    internalSku: row.internalSku ?? '',
    title: row.title || toUiExceptionKind(row.kind),
    detail: row.detail ?? '',
    blocksFulfillment: row.blocksFulfillment,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    assignedTo: row.assignedTo ?? '',
    resolution: row.resolution ?? '',
    resolvedAt: formatStamp(row.resolvedAt),
    updatedAt: formatStamp(row.updatedAt),
    createdAt: formatStamp(row.createdAt),
  }
}

async function nextCaseNo(db: DbLike, organizationId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `OEX-${year}-`
  const rows = await db
    .select({ caseNo: orderExceptionCases.caseNo })
    .from(orderExceptionCases)
    .where(eq(orderExceptionCases.organizationId, organizationId))
  let max = 0
  for (const r of rows) {
    if (!r.caseNo.startsWith(prefix)) continue
    const n = Number(r.caseNo.slice(prefix.length))
    if (Number.isFinite(n)) max = Math.max(max, n)
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

async function shopNameMap(db: DbLike, organizationId: string, shopIds: string[]) {
  const map = new Map<string, string>()
  const ids = [...new Set(shopIds.filter(Boolean))]
  if (!ids.length) return map
  const rows = await db
    .select({ id: shops.id, name: shops.name })
    .from(shops)
    .where(and(eq(shops.organizationId, organizationId), inArray(shops.id, ids)))
  for (const r of rows) map.set(r.id, r.name)
  return map
}

export async function listOrderExceptions(
  db: DbLike,
  organizationId: string,
  input: {
    page?: number
    pageSize?: number
    q?: string
    status?: string
    kind?: string
    shopId?: string
  } = {},
): Promise<PaginatedResult<OrderExceptionDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(orderExceptionCases.organizationId, organizationId)]
  const statusDb = toDbExceptionStatus(input.status)
  if (statusDb && input.status !== '全部') filters.push(eq(orderExceptionCases.status, statusDb))
  const kindDb = toDbExceptionKind(input.kind)
  if (kindDb && input.kind !== '全部') filters.push(eq(orderExceptionCases.kind, kindDb))
  if (input.shopId) filters.push(eq(orderExceptionCases.shopId, input.shopId))
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(orderExceptionCases.caseNo, q),
        ilike(orderExceptionCases.externalOrderId, q),
        ilike(orderExceptionCases.sellerSku, q),
        ilike(orderExceptionCases.internalSku, q),
        ilike(orderExceptionCases.title, q),
        ilike(orderExceptionCases.detail, q),
      )!,
    )
  }
  const where = and(...filters)
  const [totalRow] = await db.select({ c: count() }).from(orderExceptionCases).where(where)
  const rows = await db
    .select()
    .from(orderExceptionCases)
    .where(where)
    .orderBy(desc(orderExceptionCases.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const names = await shopNameMap(
    db,
    organizationId,
    rows.map((r) => r.shopId ?? ''),
  )
  return {
    items: rows.map((r) => mapCase(r, names.get(r.shopId ?? '') ?? '')),
    total: Number(totalRow?.c ?? 0),
    page,
    pageSize,
  }
}

export async function orderExceptionStats(db: DbLike, organizationId: string) {
  const rows = await db
    .select({
      status: orderExceptionCases.status,
      kind: orderExceptionCases.kind,
      c: count(),
    })
    .from(orderExceptionCases)
    .where(eq(orderExceptionCases.organizationId, organizationId))
    .groupBy(orderExceptionCases.status, orderExceptionCases.kind)

  let total = 0
  let open = 0
  let inProgress = 0
  let resolved = 0
  let ignored = 0
  const byKind: Record<string, number> = {
    timeout_unshipped: 0,
    reservation_failed: 0,
    picking_exception: 0,
    sync_failed: 0,
  }
  for (const r of rows) {
    const n = Number(r.c)
    total += n
    if (r.status === 'open') open += n
    if (r.status === 'in_progress') inProgress += n
    if (r.status === 'resolved') resolved += n
    if (r.status === 'ignored') ignored += n
    if (r.kind in byKind) byKind[r.kind] += n
  }
  return {
    total,
    open,
    inProgress,
    resolved,
    ignored,
    timeoutUnshipped: byKind.timeout_unshipped,
    reservationFailed: byKind.reservation_failed,
    pickingException: byKind.picking_exception,
    syncFailed: byKind.sync_failed,
  }
}

export async function getOrderException(
  db: DbLike,
  organizationId: string,
  idOrNo: string,
): Promise<(OrderExceptionDto & { actions: OrderExceptionActionDto[] }) | null> {
  const [row] = await db
    .select()
    .from(orderExceptionCases)
    .where(
      and(
        eq(orderExceptionCases.organizationId, organizationId),
        or(eq(orderExceptionCases.id, idOrNo), eq(orderExceptionCases.caseNo, idOrNo)),
      ),
    )
    .limit(1)
  if (!row) return null
  const names = await shopNameMap(db, organizationId, [row.shopId ?? ''])
  const actions = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, organizationId),
        eq(auditEvents.entityType, 'order_exception_case'),
        eq(auditEvents.entityId, row.id),
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(50)
  return {
    ...mapCase(row, names.get(row.shopId ?? '') ?? ''),
    actions: actions.map((a) => ({
      id: a.id,
      action: a.action,
      actor: a.actorLabel || a.actorUserId || '系统',
      result: a.result ?? '',
      detail: a.detail ?? '',
      createdAt: formatStamp(a.createdAt),
    })),
  }
}

async function writeAudit(
  db: DbLike,
  organizationId: string,
  input: {
    entityId: string
    action: string
    actor?: string
    before?: Record<string, unknown>
    after?: Record<string, unknown>
    result?: string
    detail?: string
  },
) {
  await db.insert(auditEvents).values({
    id: createId(),
    organizationId,
    actorLabel: input.actor || '运营',
    action: input.action,
    entityType: 'order_exception_case',
    entityId: input.entityId,
    before: input.before,
    after: input.after,
    result: input.result ?? 'ok',
    detail: input.detail,
  })
}

async function upsertCase(
  db: DbLike,
  organizationId: string,
  input: {
    kind: string
    sourceType: string
    sourceId: string
    shopId?: string | null
    orderId?: string | null
    orderLineId?: string | null
    externalOrderId?: string | null
    outboundId?: string | null
    reservationId?: string | null
    sellerSku?: string | null
    internalSku?: string | null
    title: string
    detail?: string
    blocksFulfillment?: boolean
    raw?: Record<string, unknown>
  },
): Promise<'created' | 'updated' | 'skipped'> {
  const [existing] = await db
    .select()
    .from(orderExceptionCases)
    .where(
      and(
        eq(orderExceptionCases.organizationId, organizationId),
        eq(orderExceptionCases.kind, input.kind),
        eq(orderExceptionCases.sourceType, input.sourceType),
        eq(orderExceptionCases.sourceId, input.sourceId),
      ),
    )
    .limit(1)

  const now = new Date()
  if (existing) {
    if (existing.status === 'resolved' || existing.status === 'ignored') {
      await db
        .update(orderExceptionCases)
        .set({ lastScannedAt: now, updatedAt: now })
        .where(eq(orderExceptionCases.id, existing.id))
      return 'skipped'
    }
    await db
      .update(orderExceptionCases)
      .set({
        shopId: input.shopId ?? existing.shopId,
        orderId: input.orderId ?? existing.orderId,
        orderLineId: input.orderLineId ?? existing.orderLineId,
        externalOrderId: input.externalOrderId ?? existing.externalOrderId,
        outboundId: input.outboundId ?? existing.outboundId,
        reservationId: input.reservationId ?? existing.reservationId,
        sellerSku: input.sellerSku ?? existing.sellerSku,
        internalSku: input.internalSku ?? existing.internalSku,
        title: input.title,
        detail: input.detail ?? existing.detail,
        blocksFulfillment: input.blocksFulfillment ?? existing.blocksFulfillment,
        lastScannedAt: now,
        raw: input.raw ?? existing.raw ?? {},
        updatedAt: now,
      })
      .where(eq(orderExceptionCases.id, existing.id))
    return 'updated'
  }

  const caseNo = await nextCaseNo(db, organizationId)
  await db.insert(orderExceptionCases).values({
    id: createId(),
    organizationId,
    caseNo,
    kind: input.kind,
    status: 'open',
    shopId: input.shopId ?? null,
    orderId: input.orderId ?? null,
    orderLineId: input.orderLineId ?? null,
    externalOrderId: input.externalOrderId ?? null,
    outboundId: input.outboundId ?? null,
    reservationId: input.reservationId ?? null,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sellerSku: input.sellerSku ?? null,
    internalSku: input.internalSku ?? null,
    title: input.title,
    detail: input.detail ?? null,
    blocksFulfillment: input.blocksFulfillment ?? true,
    lastScannedAt: now,
    raw: input.raw ?? {},
  })
  return 'created'
}

/**
 * 从真实订单/占库/拣货/履约尝试扫描异常并 upsert 案件（不造假店铺）。
 */
export async function scanOrderExceptions(
  db: DbLike,
  organizationId: string,
): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0
  let updated = 0
  let skipped = 0
  const bump = (r: 'created' | 'updated' | 'skipped') => {
    if (r === 'created') created += 1
    else if (r === 'updated') updated += 1
    else skipped += 1
  }

  const cutoff = new Date(Date.now() - TIMEOUT_HOURS * 3600 * 1000)

  // 1) 超时未发货：已支付且未发货/未送达，超过阈值
  const unpaidShipStatuses = ['shipped', 'delivered', 'cancelled', 'returned']
  const timeoutOrders = await db
    .select({
      order: orders,
      shopName: shops.name,
    })
    .from(orders)
    .innerJoin(shops, eq(orders.shopId, shops.id))
    .where(
      and(
        eq(orders.organizationId, organizationId),
        or(eq(orders.status, 'paid'), eq(orders.status, 'ready_to_ship'), eq(orders.status, 'created')),
        lt(orders.paidAt, cutoff),
      ),
    )
    .limit(200)

  for (const row of timeoutOrders) {
    if (row.order.paidAt == null) continue
    if (unpaidShipStatuses.includes(row.order.status)) continue
    const [ship] = await db
      .select({ id: shipments.id })
      .from(shipments)
      .where(
        and(
          eq(shipments.organizationId, organizationId),
          eq(shipments.orderId, row.order.id),
          ne(shipments.status, 'cancelled'),
        ),
      )
      .limit(1)
    if (ship) continue
    const [line] = await db
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, row.order.id))
      .limit(1)
    bump(
      await upsertCase(db, organizationId, {
        kind: 'timeout_unshipped',
        sourceType: 'order',
        sourceId: row.order.id,
        shopId: row.order.shopId,
        orderId: row.order.id,
        orderLineId: line?.id,
        externalOrderId: row.order.externalOrderId,
        sellerSku: line?.sellerSku,
        internalSku: line?.sku,
        title: `超时未发货 · ${row.order.externalOrderId}`,
        detail: `订单已支付超过 ${TIMEOUT_HOURS} 小时仍未发货（店铺 ${row.shopName}）`,
        blocksFulfillment: true,
        raw: { paidAt: row.order.paidAt?.toISOString(), status: row.order.status },
      }),
    )
  }

  // 2) 占库失败：开放且带外部订单号的 mapping_exceptions；或已支付无活跃占库
  const mapEx = await db
    .select()
    .from(mappingExceptions)
    .where(
      and(
        eq(mappingExceptions.organizationId, organizationId),
        eq(mappingExceptions.status, 'open'),
      ),
    )
    .limit(200)
  for (const ex of mapEx) {
    if (!ex.externalOrderId && !ex.shopId) continue
    let orderId: string | null = null
    if (ex.externalOrderId && ex.shopId) {
      const [ord] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.organizationId, organizationId),
            eq(orders.shopId, ex.shopId),
            eq(orders.externalOrderId, ex.externalOrderId),
          ),
        )
        .limit(1)
      orderId = ord?.id ?? null
    }
    bump(
      await upsertCase(db, organizationId, {
        kind: 'reservation_failed',
        sourceType: 'mapping_exception',
        sourceId: ex.id,
        shopId: ex.shopId,
        orderId,
        externalOrderId: ex.externalOrderId,
        sellerSku: ex.sellerSku,
        title: `占库失败 · 映射异常 ${ex.reason}`,
        detail: ex.detail || `mapping_exceptions#${ex.id} 阻断自动占库`,
        blocksFulfillment: true,
        raw: { reason: ex.reason, meta: ex.meta },
      }),
    )
  }

  const paidOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, organizationId),
        or(eq(orders.status, 'paid'), eq(orders.status, 'ready_to_ship')),
      ),
    )
    .limit(200)
  for (const ord of paidOrders) {
    const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, ord.id))
    for (const line of lines) {
      const [res] = await db
        .select({ id: inventoryReservations.id, status: inventoryReservations.status })
        .from(inventoryReservations)
        .where(
          and(
            eq(inventoryReservations.organizationId, organizationId),
            eq(inventoryReservations.orderLineId, line.id),
            eq(inventoryReservations.status, 'active'),
          ),
        )
        .limit(1)
      if (res) continue
      bump(
        await upsertCase(db, organizationId, {
          kind: 'reservation_failed',
          sourceType: 'order_line',
          sourceId: line.id,
          shopId: ord.shopId,
          orderId: ord.id,
          orderLineId: line.id,
          externalOrderId: ord.externalOrderId,
          sellerSku: line.sellerSku,
          internalSku: line.sku,
          title: `占库失败 · ${ord.externalOrderId}`,
          detail: `订单行 ${line.sellerSku || line.sku || line.id} 无活跃库存预留`,
          blocksFulfillment: true,
        }),
      )
    }
  }

  // 3) 拣货异常：出库单 picking 且有 reason，或状态异常备注
  const pickRows = await db
    .select()
    .from(stockOutbounds)
    .where(
      and(
        eq(stockOutbounds.organizationId, organizationId),
        eq(stockOutbounds.outboundType, 'order'),
        or(
          eq(stockOutbounds.status, 'picking'),
          eq(stockOutbounds.status, 'cancelled'),
        ),
      ),
    )
    .limit(200)
  for (const ob of pickRows) {
    const reason = (ob.reason || ob.remark || '').trim()
    const looksBad =
      /异常|缺货|短拣|失败|error|exception/i.test(reason) ||
      (ob.status === 'cancelled' && Boolean(ob.orderId))
    if (!looksBad && ob.status !== 'cancelled') continue
    if (!ob.orderId && !reason) continue
    bump(
      await upsertCase(db, organizationId, {
        kind: 'picking_exception',
        sourceType: 'outbound',
        sourceId: ob.id,
        shopId: ob.shopId,
        orderId: ob.orderId,
        outboundId: ob.id,
        externalOrderId: ob.externalOrderId,
        title: `拣货异常 · ${ob.outboundNo}`,
        detail: reason || `出库单 ${ob.outboundNo} 状态=${ob.status}`,
        blocksFulfillment: true,
        raw: { status: ob.status, outboundNo: ob.outboundNo },
      }),
    )
  }

  // 4) 同步失败：履约尝试失败（对齐 sync_tasks 视角的平台调用失败）
  const fails = await db
    .select()
    .from(fulfillmentAttempts)
    .where(
      and(
        eq(fulfillmentAttempts.organizationId, organizationId),
        or(
          eq(fulfillmentAttempts.result, 'failed'),
          eq(fulfillmentAttempts.result, 'error'),
        ),
      ),
    )
    .limit(200)
  for (const attempt of fails) {
    bump(
      await upsertCase(db, organizationId, {
        kind: 'sync_failed',
        sourceType: 'fulfillment_attempt',
        sourceId: attempt.id,
        shopId: attempt.shopId,
        orderId: attempt.orderId,
        externalOrderId: attempt.externalPackageId,
        title: `同步失败 · ${attempt.action}`,
        detail:
          attempt.errorMessage ||
          attempt.errorCode ||
          `fulfillment_attempts#${attempt.id} result=${attempt.result}`,
        blocksFulfillment: true,
        raw: {
          action: attempt.action,
          errorCode: attempt.errorCode,
          retryable: attempt.retryable,
        },
      }),
    )
  }

  if (created > 0) {
    await ensureSystemNotification(db, organizationId, {
      category: 'order',
      title: `订单异常扫描新增 ${created} 件`,
      summary: `更新 ${updated} · 跳过 ${skipped}（站内信，未外传）`,
      body: '由 orderExceptions.sync / scan 写入。请到订单异常页处理。',
      href: '/console/order-exceptions',
      sourceType: 'order_exception_scan',
      sourceId: `scan_${new Date().toISOString().slice(0, 13)}`,
    })
  }

  return { created, updated, skipped }
}

export async function startException(
  db: DbLike,
  organizationId: string,
  id: string,
  actor?: string,
): Promise<OrderExceptionDto> {
  const current = await getOrderException(db, organizationId, id)
  if (!current) throw new Error(`异常案件 ${id} 不存在`)
  if (current.status !== '开放') throw new Error(`仅开放状态可开始处理（当前 ${current.status}）`)
  await db
    .update(orderExceptionCases)
    .set({ status: 'in_progress', assignedTo: actor || '运营', updatedAt: new Date() })
    .where(and(eq(orderExceptionCases.organizationId, organizationId), eq(orderExceptionCases.id, current.id)))
  await writeAudit(db, organizationId, {
    entityId: current.id,
    action: 'exception.start',
    actor,
    before: { status: current.status },
    after: { status: 'in_progress' },
    detail: '开始处理异常',
  })
  const next = await getOrderException(db, organizationId, current.id)
  if (!next) throw new Error('更新失败')
  return next
}

export async function resolveException(
  db: DbLike,
  organizationId: string,
  id: string,
  resolution: string,
  actor?: string,
): Promise<OrderExceptionDto> {
  const current = await getOrderException(db, organizationId, id)
  if (!current) throw new Error(`异常案件 ${id} 不存在`)
  if (current.status === '已修复' || current.status === '已忽略') {
    throw new Error(`案件已结束（${current.status}）`)
  }
  const note = resolution.trim() || '已处理'
  const now = new Date()
  await db
    .update(orderExceptionCases)
    .set({
      status: 'resolved',
      resolution: note,
      resolvedAt: now,
      resolvedBy: actor || '运营',
      blocksFulfillment: false,
      updatedAt: now,
    })
    .where(and(eq(orderExceptionCases.organizationId, organizationId), eq(orderExceptionCases.id, current.id)))
  await writeAudit(db, organizationId, {
    entityId: current.id,
    action: 'exception.resolve',
    actor,
    before: { status: current.status, blocksFulfillment: current.blocksFulfillment },
    after: { status: 'resolved', blocksFulfillment: false },
    detail: note,
  })
  const next = await getOrderException(db, organizationId, current.id)
  if (!next) throw new Error('更新失败')
  return next
}

export async function ignoreException(
  db: DbLike,
  organizationId: string,
  id: string,
  reason: string,
  actor?: string,
): Promise<OrderExceptionDto> {
  const current = await getOrderException(db, organizationId, id)
  if (!current) throw new Error(`异常案件 ${id} 不存在`)
  if (current.status === '已修复' || current.status === '已忽略') {
    throw new Error(`案件已结束（${current.status}）`)
  }
  const note = reason.trim() || '忽略'
  const now = new Date()
  await db
    .update(orderExceptionCases)
    .set({
      status: 'ignored',
      resolution: note,
      resolvedAt: now,
      resolvedBy: actor || '运营',
      blocksFulfillment: false,
      updatedAt: now,
    })
    .where(and(eq(orderExceptionCases.organizationId, organizationId), eq(orderExceptionCases.id, current.id)))
  await writeAudit(db, organizationId, {
    entityId: current.id,
    action: 'exception.ignore',
    actor,
    before: { status: current.status },
    after: { status: 'ignored' },
    detail: note,
  })
  const next = await getOrderException(db, organizationId, current.id)
  if (!next) throw new Error('更新失败')
  return next
}
