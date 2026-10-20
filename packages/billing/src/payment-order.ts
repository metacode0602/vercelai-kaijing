import { eq, and, desc, count, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { paymentOrder } from "@workspace/db"
import { ensureBillingTenant } from "./ensure-tenant"
import { generatePaymentOrderNo } from "./order-number"
import type {
  CreatePaymentOrderInput,
  ConfirmPaymentInput,
  PaymentOrder,
  PaginatedResult,
} from "./types"

// ---------------------------------------------------------------------------
// Create payment order
// ---------------------------------------------------------------------------

export async function createPaymentOrder(
  db: PostgresJsDatabase<Record<string, never>> | any,
  input: CreatePaymentOrderInput,
): Promise<PaymentOrder> {
  const id = crypto.randomUUID()
  const orderNo = generatePaymentOrderNo()

  // 付款方：租户充值需要计费租户存在；商户预付没有 tenant，直接写 merchant_id。
  const isTenantPayer = typeof input.tenantId === "string" && input.tenantId.length > 0
  const tenantId = isTenantPayer ? (input as { tenantId: string }).tenantId : null
  const merchantId = isTenantPayer
    ? null
    : ((input as { merchantId: string }).merchantId ?? null)

  if (!isTenantPayer && !merchantId) {
    throw new Error("createPaymentOrder: 必须提供 tenantId 或 merchantId 之一")
  }
  if (isTenantPayer) {
    await ensureBillingTenant(db, tenantId!)
  }

  const [row] = await db
    .insert(paymentOrder)
    .values({
      id,
      orderNo,
      tenantId,
      merchantId,
      scene: input.scene,
      sceneOrderId: input.sceneOrderId ?? null,
      amount: String(input.amount),
      currency: "CNY",
      paymentMethod: input.paymentMethod,
      status: "pending",
      expiredAt: input.expiredAt,
      createdBy: input.createdBy ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    })
    .returning()

  return row as PaymentOrder
}

// ---------------------------------------------------------------------------
// Get payment order by orderNo
// ---------------------------------------------------------------------------

export async function getPaymentOrderByNo(
  db: PostgresJsDatabase<Record<string, never>> | any,
  orderNo: string,
): Promise<PaymentOrder | undefined> {
  const [row] = await db
    .select()
    .from(paymentOrder)
    .where(eq(paymentOrder.orderNo, orderNo))
    .limit(1)

  return row as PaymentOrder | undefined
}

// ---------------------------------------------------------------------------
// Get payment order by id
// ---------------------------------------------------------------------------

export async function getPaymentOrderById(
  db: PostgresJsDatabase<Record<string, never>> | any,
  id: string,
): Promise<PaymentOrder | undefined> {
  const [row] = await db
    .select()
    .from(paymentOrder)
    .where(eq(paymentOrder.id, id))
    .limit(1)

  return row as PaymentOrder | undefined
}

// ---------------------------------------------------------------------------
// Confirm payment (mark as paid)
// ---------------------------------------------------------------------------

/**
 * `channel_order_no` 的语义是**渠道侧的单号**（微信 `transaction_id` / 支付宝 `trade_no`），
 * 只在渠道回调到达时才有值，由 {@link confirmPayment} 写入。
 *
 * 刻意**不**在建单时把我们的 `out_trade_no` 写进去：两者查单都用 `out_trade_no`
 * （即本表的 `order_no`，本来就有），写重复不仅冗余，还会把「渠道单号」这一列
 * 污染成一个恒等于 `order_no` 的值 —— 将来做渠道对账时它毫无信息量。
 */

/** 金额比较容差：numeric(15,4) 下 0.0001 以内视为相等 */
const MONEY_EPSILON = 0.0001

export class PaymentAmountMismatchError extends Error {
  constructor(
    public readonly orderNo: string,
    public readonly orderAmount: number,
    public readonly paidAmount: number,
  ) {
    super(
      `支付金额不一致：订单 ${orderNo} 应收 ¥${orderAmount.toFixed(4)}，渠道实付 ¥${paidAmount.toFixed(4)}`,
    )
    this.name = "PaymentAmountMismatchError"
  }
}

/**
 * 确认支付（pending → paid）。
 *
 * 幂等与并发安全要点：
 *   1. 先按 orderNo 取行做「已终态则直接返回」判断；
 *   2. 真正的状态跃迁用 `status = 'pending'` 作为 WHERE 条件 —— 支付网关
 *      重投/并发回调时只有一个 UPDATE 能命中，另一个回落到重读，
 *      不会产生两条「paidAt」。
 *   3. 金额校验放在状态跃迁**之前**：金额不符时订单必须保持 pending，
 *      否则钱没到账订单却已 paid，补救路径会复杂得多。
 */
export async function confirmPayment(
  db: PostgresJsDatabase<Record<string, never>> | any,
  input: ConfirmPaymentInput,
): Promise<PaymentOrder | null> {
  const existing = await getPaymentOrderByNo(db, input.orderNo)
  if (!existing) return null

  // Idempotent: already paid or refunded, skip
  if (existing.status === "paid" || existing.status === "refunded") {
    return existing
  }

  // 金额不符 → 拒绝到账，订单保持 pending 等待人工处理
  if (input.paidAmount !== undefined) {
    const orderAmount = Number(existing.amount)
    if (Math.abs(orderAmount - input.paidAmount) > MONEY_EPSILON) {
      throw new PaymentAmountMismatchError(existing.orderNo, orderAmount, input.paidAmount)
    }
  }

  // 条件更新：只有仍处于 pending 的行会被跃迁，并发回调只有一个赢家
  const [updated] = await db
    .update(paymentOrder)
    .set({
      status: "paid",
      channelOrderNo: input.channelOrderNo ?? existing.channelOrderNo,
      channelStatus: input.channelStatus ?? existing.channelStatus,
      channelResponse: input.channelResponse
        ? JSON.stringify(input.channelResponse)
        : existing.channelResponse,
      paidAt: input.paidAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paymentOrder.id, existing.id),
        eq(paymentOrder.status, "pending"),
      ),
    )
    .returning()

  if (updated) return updated as PaymentOrder

  // 条件未命中 = 已被并发回调抢先跃迁，重读返回最新态
  return (await getPaymentOrderByNo(db, input.orderNo)) ?? null
}

// ---------------------------------------------------------------------------
// Expire payment order
// ---------------------------------------------------------------------------

export async function expirePaymentOrder(
  db: PostgresJsDatabase<Record<string, never>> | any,
  id: string,
): Promise<PaymentOrder | null> {
  const [row] = await db
    .update(paymentOrder)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(paymentOrder.id, id), eq(paymentOrder.status, "pending")))
    .returning()

  return (row as PaymentOrder) ?? null
}

// ---------------------------------------------------------------------------
// List payment orders for a tenant (paginated)
// ---------------------------------------------------------------------------

export async function listPaymentOrders(
  db: PostgresJsDatabase<Record<string, never>> | any,
  params: {
    tenantId: string
    scene?: string
    status?: string
    page?: number
    pageSize?: number
  },
): Promise<PaginatedResult<PaymentOrder>> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
  const conditions = [eq(paymentOrder.tenantId, params.tenantId)]

  if (params.scene) {
    conditions.push(eq(paymentOrder.scene, params.scene))
  }
  if (params.status) {
    conditions.push(eq(paymentOrder.status, params.status))
  }

  const where = and(...conditions)

  const [totalRow] = await db
    .select({ total: count() })
    .from(paymentOrder)
    .where(where)

  const total = Number(totalRow?.total ?? 0)
  const offset = (page - 1) * pageSize

  const rows = await db
    .select()
    .from(paymentOrder)
    .where(where)
    .orderBy(desc(paymentOrder.createdAt))
    .limit(pageSize)
    .offset(offset)

  return {
    items: rows as PaymentOrder[],
    total,
    page,
    pageSize,
  }
}
