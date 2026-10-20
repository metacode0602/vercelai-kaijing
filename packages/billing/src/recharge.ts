/**
 * Recharge service — orchestrates the full recharge flow.
 *
 * Flow:
 *   1. createRechargeOrder() → creates payment_order + returns orderNo
 *   2. [User pays on gateway]
 *   3. handlePaymentCallback() → confirms payment + credits balance
 *   4. createRefund() → creates refund + debits balance
 *
 * This module is the primary entry point for the recharge feature.
 * It is consumed by apps/gpus, apps/api, and apps/merchant.
 */

import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { paymentOrder, paymentRefund } from "@workspace/db"
import {
  createPaymentOrder,
  confirmPayment,
  listPaymentOrders,
  getPaymentOrderById,
} from "./payment-order"
import {
  creditBalance,
  getTenantBalance,
  getOrCreateTenantBalance,
  listBalanceTransactions,
} from "./balance"
import { generateRefundOrderNo } from "./order-number"
import { assertMerchantRechargeAdmission } from "./merchant-account"
import type {
  CreatePaymentOrderInput,
  ConfirmPaymentInput,
  PaymentOrder,
  TenantBalance,
  BalanceTransaction,
  PaymentRefund,
} from "./types"

// ---------------------------------------------------------------------------
// Create recharge order
// ---------------------------------------------------------------------------

export interface CreateRechargeOrderResult {
  order: PaymentOrder
}

export async function createRechargeOrder(
  db: PostgresJsDatabase<Record<string, never>> | any,
  input: CreatePaymentOrderInput,
): Promise<CreateRechargeOrderResult> {
  if (input.amount <= 0) {
    throw new Error("Recharge amount must be positive")
  }

  // 充值准入收口（DEC-F4）：商户可用额低于阈值时，其终端用户不得再充值。
  // 必须在建单**之前**拦 —— 单据一旦落库就会进入支付网关流程，届时再撤单
  // 会留下「已支付但被拒绝」的脏单，且需要人工退款。放在这里同时保证
  // apps/gpus 与 apps/api 两个入口都过同一道闸。
  if (input.tenantId) {
    await assertMerchantRechargeAdmission(db, input.tenantId)
  }

  const order = await createPaymentOrder(db, {
    ...input,
    scene: "recharge",
  })

  return { order }
}

// ---------------------------------------------------------------------------
// Handle payment callback (gateway → our system)
// ---------------------------------------------------------------------------

export interface HandlePaymentCallbackResult {
  order: PaymentOrder
  balance: TenantBalance
  tx: BalanceTransaction
}

export async function handlePaymentCallback(
  db: PostgresJsDatabase<Record<string, never>> | any,
  input: ConfirmPaymentInput & { organizationId: string },
): Promise<HandlePaymentCallbackResult> {
  // 1. Confirm payment
  const order = await confirmPayment(db, input)
  if (!order) {
    throw new Error(`Payment order not found: ${input.orderNo}`)
  }

  // 付款方守卫：商户预付单的钱必须进 merchant 账户，混进 tenant 余额会让
  // 商户额度与用户余额的账本彻底对不上。这里必须硬失败而不是容错跳过。
  if (!order.tenantId) {
    throw new Error(
      `Payment order ${input.orderNo} has no tenant payer (merchant_id=${order.merchantId ?? "null"}, ` +
        `scene=${order.scene}); tenant balance credit is not applicable`,
    )
  }
  const payerTenantId = order.tenantId

  if (order.status !== "paid") {
    // Already processed or expired — return existing state
    const balance = await getTenantBalance(db, payerTenantId)
    return {
      order,
      balance: balance!,
      tx: null as any, // No new transaction
    }
  }

  // 2. Credit balance
  const amount = Number(order.amount)
  const { balance, tx } = await creditBalance(db, {
    tenantId: payerTenantId,
    organizationId: input.organizationId,
    amount,
    txType: "recharge",
    refType: "recharge",
    refId: order.id,
    description: `充值 ¥${amount.toFixed(2)}`,
  })

  return { order, balance, tx }
}

// ---------------------------------------------------------------------------
// Create refund
// ---------------------------------------------------------------------------

export interface CreateRefundResult {
  refund: PaymentRefund
  order: PaymentOrder
  balance: TenantBalance
  tx: BalanceTransaction
}

export async function createRefund(
  db: PostgresJsDatabase<Record<string, never>> | any,
  input: {
    paymentOrderId: string
    tenantId: string
    organizationId: string
    amount: number
    reason: string
    reviewerId?: string
  },
): Promise<CreateRefundResult> {
  if (input.amount <= 0) {
    throw new Error("Refund amount must be positive")
  }

  const order = await getPaymentOrderById(db, input.paymentOrderId)
  if (!order) {
    throw new Error(`Payment order not found: ${input.paymentOrderId}`)
  }
  if (order.status !== "paid") {
    throw new Error(`Cannot refund order in status: ${order.status}`)
  }

  const paidAmount = Number(order.amount)
  if (input.amount > paidAmount) {
    throw new Error(`Refund amount ${input.amount} exceeds paid amount ${paidAmount}`)
  }

  return db.transaction(async (tx: any) => {
    // 1. Create refund record
    const refundId = crypto.randomUUID()
    const refundOrderNo = generateRefundOrderNo()
    const [refundRow] = await tx
      .insert(paymentRefund)
      .values({
        id: refundId,
        paymentOrderId: order.id,
        refundOrderNo,
        tenantId: input.tenantId,
        amount: String(input.amount),
        reason: input.reason,
        status: "pending",
        reviewerId: input.reviewerId ?? null,
      })
      .returning()

    // 2. Update order status
    const newStatus =
      input.amount < paidAmount ? "partial_refunded" : "refunded"
    const [updatedOrder] = await tx
      .update(paymentOrder)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(paymentOrder.id, order.id))
      .returning()

    // 3. Debit balance
    const { balance, tx: balTx } = (await creditBalance(tx, {
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      amount: -input.amount,
      txType: "refund",
      refType: "recharge",
      refId: order.id,
      description: `退款 ¥${input.amount.toFixed(2)} (单号: ${refundOrderNo})`,
    })) as any

    return {
      refund: refundRow as PaymentRefund,
      order: updatedOrder as PaymentOrder,
      balance,
      tx: balTx,
    }
  })
}

// ---------------------------------------------------------------------------
// Query helpers (re-exported for convenience)
// ---------------------------------------------------------------------------

export { getTenantBalance, getOrCreateTenantBalance }
export { listPaymentOrders, listBalanceTransactions }
