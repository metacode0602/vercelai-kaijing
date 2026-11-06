/**
 * Pure reservation helpers — no DB. Covered by unit tests.
 */

export type BalanceLike = {
  warehouseCode: string
  binCode?: string | null
  onHand: number
  reserved: number
  qcHold: number
  damaged: number
  version?: number
}

/** available = on_hand - reserved - qc_hold - damaged (schema invariant). */
export function computeAvailable(balance: BalanceLike): number {
  return Math.max(
    0,
    Number(balance.onHand) -
      Number(balance.reserved) -
      Number(balance.qcHold) -
      Number(balance.damaged)
  )
}

/**
 * Lazop unit lines use qty=1 integers; reject floats / zero / negative / NaN.
 */
export function parseReserveQty(
  raw: unknown
): { ok: true; qty: number } | { ok: false; reason: string } {
  if (raw == null || raw === "") {
    return { ok: false, reason: "数量缺失" }
  }
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(n)) {
    return { ok: false, reason: `数量非法：${String(raw)}` }
  }
  if (!Number.isInteger(n)) {
    return { ok: false, reason: `数量必须为整数（领域单位行）：${n}` }
  }
  if (n < 1) {
    return { ok: false, reason: `数量必须 ≥ 1：${n}` }
  }
  return { ok: true, qty: n }
}

export function pickFulfillmentWarehouse(input: {
  lineWarehouseCode?: string | null
  orderWarehouseCode?: string | null
  /** Candidate balances already filtered to the target variant. */
  balances: BalanceLike[]
  requiredQty: number
}):
  | { ok: true; warehouseCode: string; balance: BalanceLike }
  | { ok: false; reason: string } {
  const preferred = (
    input.lineWarehouseCode ||
    input.orderWarehouseCode ||
    ""
  ).trim()

  const scored = input.balances
    .map((b) => ({ balance: b, available: computeAvailable(b) }))
    .filter((row) => row.available > 0)
    .sort((a, b) => b.available - a.available)

  if (preferred) {
    const inWh = scored.filter(
      (row) => row.balance.warehouseCode === preferred
    )
    const fit = inWh.find((row) => row.available >= input.requiredQty)
    if (fit) {
      return {
        ok: true,
        warehouseCode: preferred,
        balance: fit.balance,
      }
    }
    if (inWh.length === 0) {
      return {
        ok: false,
        reason: `指定仓库 ${preferred} 无可用库存余额（已排除 qc_hold/damaged）`,
      }
    }
    return {
      ok: false,
      reason: `指定仓库 ${preferred} 可用不足（需要 ${input.requiredQty}）`,
    }
  }

  const fit = scored.find((row) => row.available >= input.requiredQty)
  if (!fit) {
    return {
      ok: false,
      reason: "无可用仓位/库存余额（已排除 qc_hold/damaged，未使用固定默认仓）",
    }
  }
  return {
    ok: true,
    warehouseCode: fit.balance.warehouseCode,
    balance: fit.balance,
  }
}

export function reservationIdempotencyKey(
  externalOrderId: string,
  orderLineId: string
): string {
  return `ledger:order_reserve:${externalOrderId}:${orderLineId}`
}
