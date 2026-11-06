import { nanoid } from "nanoid"
import { and, desc, eq, or } from "drizzle-orm"
import {
  inventoryBalances,
  inventoryMovements,
  inventoryReservations,
  orderExceptionCases,
  orderLines,
  orders,
  productVariants,
  sellerSkuMappings,
} from "@workspace/db"
import { db } from "../db"
import {
  computeAvailable,
  parseReserveQty,
  pickFulfillmentWarehouse,
  reservationIdempotencyKey,
  type BalanceLike,
} from "./reserve-rules"

function shouldAutoReserve(status: string): boolean {
  const mode = (process.env.ORDER_RESERVE_MODE || "auto_on_paid").trim()
  if (mode === "manual_only") return false
  return ["paid", "ready_to_ship"].includes(status)
}

function nextCaseNo(): string {
  // Avoid max+1 races under concurrency; unique(org, caseNo) still applies.
  return `OE-${nanoid(12)}`
}

async function upsertReservationException(input: {
  organizationId: string
  shopId: string
  orderId: string
  orderLineId?: string | null
  externalOrderId: string
  sellerSku?: string | null
  title: string
  detail: string
  sourceId: string
}) {
  const [existing] = await db
    .select({ id: orderExceptionCases.id, status: orderExceptionCases.status })
    .from(orderExceptionCases)
    .where(
      and(
        eq(orderExceptionCases.organizationId, input.organizationId),
        eq(orderExceptionCases.kind, "reservation_failed"),
        eq(orderExceptionCases.sourceType, "order"),
        eq(orderExceptionCases.sourceId, input.sourceId)
      )
    )
    .limit(1)
  const now = new Date()
  if (existing) {
    if (existing.status === "resolved" || existing.status === "ignored") return
    await db
      .update(orderExceptionCases)
      .set({
        title: input.title,
        detail: input.detail,
        sellerSku: input.sellerSku ?? null,
        orderLineId: input.orderLineId ?? null,
        lastScannedAt: now,
        updatedAt: now,
      })
      .where(eq(orderExceptionCases.id, existing.id))
    return
  }
  await db.insert(orderExceptionCases).values({
    id: nanoid(),
    organizationId: input.organizationId,
    caseNo: nextCaseNo(),
    kind: "reservation_failed",
    status: "open",
    shopId: input.shopId,
    orderId: input.orderId,
    orderLineId: input.orderLineId ?? null,
    externalOrderId: input.externalOrderId,
    sourceType: "order",
    sourceId: input.sourceId,
    sellerSku: input.sellerSku ?? null,
    title: input.title,
    detail: input.detail,
    blocksFulfillment: true,
    lastScannedAt: now,
    raw: { source: "marketplace_sync_auto_reserve" },
  })
}

async function resolveActiveMapping(
  organizationId: string,
  shopId: string,
  sellerSku: string
): Promise<{ variantId: string | null; ok: boolean; reason?: string }> {
  const code = sellerSku.trim()
  if (!code) return { variantId: null, ok: false, reason: "缺少 SellerSKU" }
  const [mapping] = await db
    .select()
    .from(sellerSkuMappings)
    .where(
      and(
        eq(sellerSkuMappings.organizationId, organizationId),
        eq(sellerSkuMappings.shopId, shopId),
        eq(sellerSkuMappings.sellerSku, code)
      )
    )
    .limit(1)
  if (!mapping) return { variantId: null, ok: false, reason: "无 SellerSKU 映射" }
  if (mapping.status !== "active" || !mapping.variantId) {
    return {
      variantId: mapping.variantId ?? null,
      ok: false,
      reason: `映射未确认（status=${mapping.status}）`,
    }
  }
  return { variantId: mapping.variantId, ok: true }
}

function orderWarehouseFromRaw(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null
  const meta = raw as Record<string, unknown>
  const code = meta.warehouseCode
  return typeof code === "string" && code.trim() ? code.trim() : null
}

/**
 * After order upsert: reserve only when every line has a confirmed (active) SellerSKU mapping.
 * Failures go to order_exceptions; replay is idempotent via movement + reservation unique keys.
 * No hardcoded default warehouse/bin — unresolved stock becomes an exception.
 */
export async function maybeAutoReserveSyncedOrder(input: {
  organizationId: string
  shopId: string
  orderId: string
  externalOrderId: string
  status: string
}): Promise<{ reserved: boolean; reason?: string }> {
  if (!shouldAutoReserve(input.status)) {
    return { reserved: false, reason: `status=${input.status} 不自动占库` }
  }

  const [active] = await db
    .select({ id: inventoryReservations.id })
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.organizationId, input.organizationId),
        eq(inventoryReservations.orderId, input.orderId),
        eq(inventoryReservations.status, "active")
      )
    )
    .limit(1)
  if (active) return { reserved: true, reason: "already_reserved" }

  const [orderRow] = await db
    .select({ raw: orders.raw })
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .limit(1)
  const orderWarehouse = orderWarehouseFromRaw(orderRow?.raw)

  const lines = await db
    .select()
    .from(orderLines)
    .where(
      and(
        eq(orderLines.organizationId, input.organizationId),
        eq(orderLines.orderId, input.orderId)
      )
    )
  if (!lines.length) {
    await upsertReservationException({
      organizationId: input.organizationId,
      shopId: input.shopId,
      orderId: input.orderId,
      externalOrderId: input.externalOrderId,
      title: "占库失败：订单无明细",
      detail: "同步订单缺少 order_item 行，无法占库",
      sourceId: `${input.orderId}:no_lines`,
    })
    return { reserved: false, reason: "no_lines" }
  }

  const resolved: Array<{
    line: (typeof lines)[number]
    variantId: string
    qty: number
  }> = []

  for (const line of lines) {
    const sellerSku = line.sellerSku || line.sku || line.shopSku || ""
    const qtyParsed = parseReserveQty(line.qty)
    if (!qtyParsed.ok) {
      await upsertReservationException({
        organizationId: input.organizationId,
        shopId: input.shopId,
        orderId: input.orderId,
        orderLineId: line.id,
        externalOrderId: input.externalOrderId,
        sellerSku,
        title: "占库失败：数量非法",
        detail: `${qtyParsed.reason}; order_line=${line.externalLineId}`,
        sourceId: `${input.orderId}:${line.id}:bad_qty`,
      })
      return { reserved: false, reason: qtyParsed.reason }
    }
    const mapping = await resolveActiveMapping(
      input.organizationId,
      input.shopId,
      sellerSku
    )
    if (!mapping.ok || !mapping.variantId) {
      await upsertReservationException({
        organizationId: input.organizationId,
        shopId: input.shopId,
        orderId: input.orderId,
        orderLineId: line.id,
        externalOrderId: input.externalOrderId,
        sellerSku,
        title: "占库失败：映射未确认",
        detail: mapping.reason || "SellerSKU 映射未确认",
        sourceId: `${input.orderId}:${line.id}:mapping`,
      })
      return { reserved: false, reason: mapping.reason }
    }
    if (!line.variantId || line.variantId !== mapping.variantId) {
      await db
        .update(orderLines)
        .set({ variantId: mapping.variantId, sellerSku })
        .where(eq(orderLines.id, line.id))
    }
    resolved.push({ line, variantId: mapping.variantId, qty: qtyParsed.qty })
  }

  try {
    await db.transaction(async (tx) => {
      for (const item of resolved) {
        const idem = reservationIdempotencyKey(
          input.externalOrderId,
          item.line.id
        )
        const [dup] = await tx
          .select({ id: inventoryMovements.id })
          .from(inventoryMovements)
          .where(
            and(
              eq(inventoryMovements.organizationId, input.organizationId),
              eq(inventoryMovements.idempotencyKey, idem)
            )
          )
          .limit(1)

        const [existRes] = await tx
          .select({
            id: inventoryReservations.id,
            status: inventoryReservations.status,
          })
          .from(inventoryReservations)
          .where(
            and(
              eq(inventoryReservations.shopId, input.shopId),
              eq(inventoryReservations.orderLineId, item.line.id)
            )
          )
          .for("update")
          .limit(1)

        if (existRes?.status === "active" && dup) {
          continue
        }

        const lockedRows = await tx
          .select()
          .from(inventoryBalances)
          .where(
            and(
              eq(inventoryBalances.organizationId, input.organizationId),
              eq(inventoryBalances.variantId, item.variantId)
            )
          )
          .for("update")
          .orderBy(desc(inventoryBalances.onHand))

        const balances: BalanceLike[] = lockedRows.map((r) => ({
          warehouseCode: r.warehouseCode,
          binCode: r.binCode,
          onHand: r.onHand,
          reserved: r.reserved,
          qcHold: r.qcHold,
          damaged: r.damaged,
          version: r.version,
        }))

        const picked = pickFulfillmentWarehouse({
          lineWarehouseCode: item.line.warehouseCode,
          orderWarehouseCode: orderWarehouse,
          balances,
          requiredQty: item.qty,
        })
        if (!picked.ok) {
          throw new Error(picked.reason)
        }

        const balanceRow = lockedRows.find(
          (r) =>
            r.warehouseCode === picked.warehouseCode &&
            r.binCode === picked.balance.binCode &&
            computeAvailable(r) >= item.qty
        ) ?? lockedRows.find((r) => r.warehouseCode === picked.warehouseCode)

        if (!balanceRow) {
          throw new Error(
            `无库存余额可锁 warehouse=${picked.warehouseCode} variant=${item.variantId}`
          )
        }

        const available = computeAvailable(balanceRow)
        if (available < item.qty) {
          throw new Error(
            `可用库存不足（可用 ${available}，需要 ${item.qty}；已排除 qc_hold/damaged）`
          )
        }

        const reservedAfter = balanceRow.reserved + item.qty
        if (!dup) {
          const updated = await tx
            .update(inventoryBalances)
            .set({
              reserved: reservedAfter,
              version: balanceRow.version + 1,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(inventoryBalances.id, balanceRow.id),
                eq(inventoryBalances.version, balanceRow.version)
              )
            )
            .returning({ id: inventoryBalances.id })
          if (!updated.length) {
            throw new Error(
              `库存版本冲突，请重试（balance=${balanceRow.id} version=${balanceRow.version}）`
            )
          }
          // Keep in-tx snapshot current for same-SKU / multi-line / multi-bin repeats.
          balanceRow.reserved = reservedAfter
          balanceRow.version = balanceRow.version + 1

          try {
            await tx.insert(inventoryMovements).values({
              id: nanoid(),
              organizationId: input.organizationId,
              shopId: input.shopId,
              variantId: item.variantId,
              warehouseCode: balanceRow.warehouseCode,
              binCode: balanceRow.binCode,
              movementType: "order_reserve",
              qtyDelta: 0,
              onHandAfter: balanceRow.onHand,
              reservedAfter,
              qcHoldAfter: balanceRow.qcHold,
              damagedAfter: balanceRow.damaged,
              sourceType: "order",
              sourceId: input.orderId,
              operator: "marketplace-sync",
              idempotencyKey: idem,
              occurredAt: new Date(),
              raw: {
                externalOrderId: input.externalOrderId,
                orderLineId: item.line.id,
                qty: item.qty,
              },
            })
          } catch (error) {
            // Unique (org, idempotencyKey) — concurrent duplicate; treat as success path.
            const message =
              error instanceof Error ? error.message : String(error)
            if (!/unique|duplicate/i.test(message)) throw error
          }
        }

        if (!existRes) {
          await tx.insert(inventoryReservations).values({
            id: nanoid(),
            organizationId: input.organizationId,
            shopId: input.shopId,
            orderId: input.orderId,
            orderLineId: item.line.id,
            variantId: item.variantId,
            warehouseCode: balanceRow.warehouseCode,
            binCode: balanceRow.binCode,
            qty: item.qty,
            status: "active",
            reservedAt: new Date(),
          })
        } else if (existRes.status !== "active") {
          await tx
            .update(inventoryReservations)
            .set({
              status: "active",
              qty: item.qty,
              warehouseCode: balanceRow.warehouseCode,
              binCode: balanceRow.binCode,
              reservedAt: new Date(),
              releasedAt: null,
              committedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(inventoryReservations.id, existRes.id))
        }
      }

      await tx
        .update(orders)
        .set({
          fulfillmentStatus: "reserved",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, input.orderId))
    })
    return { reserved: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await upsertReservationException({
      organizationId: input.organizationId,
      shopId: input.shopId,
      orderId: input.orderId,
      externalOrderId: input.externalOrderId,
      title: "占库失败",
      detail: message,
      sourceId: `${input.orderId}:reserve`,
    })
    return { reserved: false, reason: message }
  }
}

export async function resolveVariantIdForLine(input: {
  organizationId: string
  shopId: string
  sellerSku?: string | null
}): Promise<string | null> {
  const mapping = await resolveActiveMapping(
    input.organizationId,
    input.shopId,
    input.sellerSku || ""
  )
  if (mapping.ok) return mapping.variantId
  if (!input.sellerSku) return null
  const [variant] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.organizationId, input.organizationId),
        or(
          eq(productVariants.skuCode, input.sellerSku),
          eq(productVariants.sku, input.sellerSku)
        )
      )
    )
    .limit(1)
  return variant?.id ?? null
}

