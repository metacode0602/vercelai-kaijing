/**
 * 订单履约异常扫描（cron 后台路径）。
 * 与 apps/shop 的 dataaccess/order-exceptions 规则保持一致；
 * 此处为 apps/api 直接读写 DB 的后台扫描，不写 console_notifications（由 shop 侧手动扫描时写）。
 */
import { and, eq, lt, ne, or, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import {
  fulfillmentAttempts,
  mappingExceptions,
  orderExceptionCases,
  orderLines,
  orders,
  shipments,
  shops,
  stockOutbounds,
} from "@workspace/db"
import { db } from "./db"

const TIMEOUT_HOURS = 48
const BATCH_SIZE = 200
const MAX_ORDERS_TO_SCAN = 5000

async function nextCaseNo(organizationId: string): Promise<string> {
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
  return `${prefix}${String(max + 1).padStart(4, "0")}`
}

async function upsertCase(input: {
  organizationId: string
  kind: string
  sourceType: string
  sourceId: string
  shopId?: string | null
  orderId?: string | null
  orderLineId?: string | null
  externalOrderId?: string | null
  outboundId?: string | null
  sellerSku?: string | null
  internalSku?: string | null
  title: string
  detail?: string
  blocksFulfillment?: boolean
  raw?: Record<string, unknown>
}): Promise<"created" | "updated" | "skipped"> {
  const [existing] = await db
    .select()
    .from(orderExceptionCases)
    .where(
      and(
        eq(orderExceptionCases.organizationId, input.organizationId),
        eq(orderExceptionCases.kind, input.kind),
        eq(orderExceptionCases.sourceType, input.sourceType),
        eq(orderExceptionCases.sourceId, input.sourceId),
      ),
    )
    .limit(1)

  const now = new Date()
  if (existing) {
    if (existing.status === "resolved" || existing.status === "ignored") {
      await db
        .update(orderExceptionCases)
        .set({ lastScannedAt: now, updatedAt: now })
        .where(eq(orderExceptionCases.id, existing.id))
      return "skipped"
    }
    await db
      .update(orderExceptionCases)
      .set({
        shopId: input.shopId ?? existing.shopId,
        orderId: input.orderId ?? existing.orderId,
        orderLineId: input.orderLineId ?? existing.orderLineId,
        externalOrderId: input.externalOrderId ?? existing.externalOrderId,
        outboundId: input.outboundId ?? existing.outboundId,
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
    return "updated"
  }

  const caseNo = await nextCaseNo(input.organizationId)
  await db.insert(orderExceptionCases).values({
    id: randomUUID(),
    organizationId: input.organizationId,
    caseNo,
    kind: input.kind,
    status: "open",
    shopId: input.shopId ?? null,
    orderId: input.orderId ?? null,
    orderLineId: input.orderLineId ?? null,
    externalOrderId: input.externalOrderId ?? null,
    outboundId: input.outboundId ?? null,
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
  return "created"
}

export interface OrderExceptionScanResult {
  scannedOrganizations: number
  created: number
  updated: number
  skipped: number
  errors: string[]
}

/**
 * 扫描所有 approved 组织的订单履约异常。分页处理，避免大租户超时。
 */
export async function scanOrderExceptionsForAllOrganizations(
  now: Date = new Date(),
): Promise<OrderExceptionScanResult> {
  const result: OrderExceptionScanResult = {
    scannedOrganizations: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  }

  // 找出所有有订单的组织
  const orgRows = await db
    .select({ organizationId: orders.organizationId })
    .from(orders)
    .groupBy(orders.organizationId)

  for (const org of orgRows) {
    const organizationId = org.organizationId
    result.scannedOrganizations += 1
    try {
      const r = await scanOneOrganization(organizationId, now)
      result.created += r.created
      result.updated += r.updated
      result.skipped += r.skipped
    } catch (error) {
      result.errors.push(
        `${organizationId}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  return result
}

async function scanOneOrganization(
  organizationId: string,
  now: Date,
): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0
  let updated = 0
  let skipped = 0
  const bump = (r: "created" | "updated" | "skipped") => {
    if (r === "created") created += 1
    else if (r === "updated") updated += 1
    else skipped += 1
  }

  const cutoff = new Date(now.getTime() - TIMEOUT_HOURS * 3600 * 1000)
  const unpaidShipStatuses = ["shipped", "delivered", "cancelled", "returned"]

  // 1) 超时未发货 — 分页扫描
  let scanned = 0
  let lastId = ""
  while (scanned < MAX_ORDERS_TO_SCAN) {
    const timeoutOrders = await db
      .select({ order: orders, shopName: shops.name })
      .from(orders)
      .innerJoin(shops, eq(orders.shopId, shops.id))
      .where(
        and(
          eq(orders.organizationId, organizationId),
          or(
            eq(orders.status, "paid"),
            eq(orders.status, "ready_to_ship"),
            eq(orders.status, "created"),
          ),
          lt(orders.paidAt, cutoff),
          sql`${orders.id} > ${lastId}`,
        ),
      )
      .orderBy(orders.id)
      .limit(BATCH_SIZE)

    if (timeoutOrders.length === 0) break
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
            ne(shipments.status, "cancelled"),
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
        await upsertCase({
          organizationId,
          kind: "timeout_unshipped",
          sourceType: "order",
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
    lastId = timeoutOrders[timeoutOrders.length - 1]!.order.id
    scanned += timeoutOrders.length
    if (timeoutOrders.length < BATCH_SIZE) break
  }

  // 2) 占库失败 — 开放 mapping_exceptions
  const mapEx = await db
    .select()
    .from(mappingExceptions)
    .where(
      and(
        eq(mappingExceptions.organizationId, organizationId),
        eq(mappingExceptions.status, "open"),
      ),
    )
    .limit(BATCH_SIZE)
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
      await upsertCase({
        organizationId,
        kind: "reservation_failed",
        sourceType: "mapping_exception",
        sourceId: ex.id,
        shopId: ex.shopId,
        orderId,
        externalOrderId: ex.externalOrderId,
        sellerSku: ex.sellerSku,
        title: `占库失败 · 映射异常 ${ex.reason}`,
        detail: ex.detail || `mapping_exceptions#${ex.id} 阻断自动占库`,
        blocksFulfillment: true,
        raw: { reason: ex.reason },
      }),
    )
  }

  // 3) 拣货异常
  const pickRows = await db
    .select()
    .from(stockOutbounds)
    .where(
      and(
        eq(stockOutbounds.organizationId, organizationId),
        eq(stockOutbounds.outboundType, "order"),
        or(
          eq(stockOutbounds.status, "picking"),
          eq(stockOutbounds.status, "cancelled"),
        ),
      ),
    )
    .limit(BATCH_SIZE)
  for (const ob of pickRows) {
    const reason = (ob.reason || ob.remark || "").trim()
    const looksBad =
      /异常|缺货|短拣|失败|error|exception/i.test(reason) ||
      (ob.status === "cancelled" && Boolean(ob.orderId))
    if (!looksBad && ob.status !== "cancelled") continue
    if (!ob.orderId && !reason) continue
    bump(
      await upsertCase({
        organizationId,
        kind: "picking_exception",
        sourceType: "outbound",
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

  // 4) 同步失败
  const fails = await db
    .select()
    .from(fulfillmentAttempts)
    .where(
      and(
        eq(fulfillmentAttempts.organizationId, organizationId),
        or(
          eq(fulfillmentAttempts.result, "failed"),
          eq(fulfillmentAttempts.result, "error"),
        ),
      ),
    )
    .limit(BATCH_SIZE)
  for (const attempt of fails) {
    bump(
      await upsertCase({
        organizationId,
        kind: "sync_failed",
        sourceType: "fulfillment_attempt",
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

  return { created, updated, skipped }
}
