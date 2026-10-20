/**
 * 商户预付（merchant prepay）— 设计依据
 * apps/merchant/content/design/merchant-module-review-and-design.md §3.4 / §5.1
 *
 * 资金流：商户现金 → 平台收款 → 商户 cash 池可用额度。
 *
 * 关键约束（预付模式下任何一条破了都是资金事故）：
 *   1. **付款方是商户不是租户**：到账必须落 `merchant_account_ledger` 的 cash 池，
 *      绝不能走 tenant 余额（`creditBalance`），否则商户额度和用户余额混在一起，
 *      对账口径永远对不上。
 *   2. **回调只入账一次**：网关重投/超时重试是常态。幂等键取订单 id，
 *      由 `merchant_account_ledger.idempotency_key` 唯一约束兜底。
 *   3. **金额不符不入账**：订单金额与渠道实付不一致时保持 pending，等人工处理。
 *   4. **实时的余额与流水同事务写入**：全部走 `postMerchantLedger`。
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { and, desc, eq, sql, type SQL } from "drizzle-orm"
import { merchantAccountLedger, paymentOrder } from "@workspace/db"
import {
  PaymentAmountMismatchError,
  confirmPayment,
  createPaymentOrder,
  getPaymentOrderByNo,
} from "./payment-order"
import {
  getMerchantAvailableTotal,
  getOrCreateMerchantAccount,
  postMerchantLedger,
  type MerchantAccountRow,
  type MerchantLedgerRow,
  type MerchantPoolBalanceRow,
} from "./merchant-account"
import type {
  ConfirmPaymentInput,
  CreatePaymentOrderInput,
  PaymentMethod,
  PaymentOrder,
  PaginatedResult,
} from "./types"

type Db = PostgresJsDatabase<Record<string, never>> | any

/** 预付单默认有效期 30 分钟 */
export const MERCHANT_PREPAY_TTL_MS = 30 * 60 * 1000

/** 预付最低金额（DEC-2 选①：最低额硬阻断）。低于此值直接拒绝下单。 */
export const MERCHANT_PREPAY_MIN_AMOUNT = 100

/**
 * 预付入账幂等键。
 *
 * 只用订单 id，不用 `channelOrderNo`：渠道单号可能为空、可能重复（同一渠道重试），
 * 用它做键会出现「两笔不同订单被并成一笔」。订单 id 由平台生成，唯一且稳定。
 */
export function merchantPrepayIdempotencyKey(orderId: string): string {
  return `merchant_prepay:${orderId}`
}

export interface CreateMerchantPrepayInput {
  merchantId: string
  amount: number
  paymentMethod: PaymentMethod
  /** 订单有效期，默认 30 分钟 */
  ttlMs?: number
  createdBy?: string
  ipAddress?: string
  userAgent?: string
}

export interface CreateMerchantPrepayResult {
  order: PaymentOrder
  /** 幂等键回显，便于调用方落库联调 */
  idempotencyKey: string
  expiresAt: Date
}

/**
 * 创建商户预付单（scene=merchant_prepay，付款方=merchant）。
 *
 * 只创建订单、**不入账**。到账只由 `handleMerchantPrepayCallback` 触发。
 */
export async function createMerchantPrepay(
  db: Db,
  input: CreateMerchantPrepayInput,
): Promise<CreateMerchantPrepayResult> {
  if (!(input.amount > 0)) {
    throw new Error(`预付金额必须为正数，收到 ${input.amount}`)
  }
  if (input.amount < MERCHANT_PREPAY_MIN_AMOUNT) {
    throw new Error(
      `预付金额 ¥${input.amount.toFixed(2)} 低于最低预付额 ¥${MERCHANT_PREPAY_MIN_AMOUNT.toFixed(2)}`,
    )
  }

  // 账户不存在时先建（含三池实时值行），否则回调时无处记账
  await getOrCreateMerchantAccount(db, input.merchantId)

  const expiresAt = new Date(Date.now() + (input.ttlMs ?? MERCHANT_PREPAY_TTL_MS))
  const orderInput: CreatePaymentOrderInput = {
    merchantId: input.merchantId,
    scene: "merchant_prepay",
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    expiredAt: expiresAt,
    createdBy: input.createdBy,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  }

  const order = await createPaymentOrder(db, orderInput)
  return {
    order,
    idempotencyKey: merchantPrepayIdempotencyKey(order.id),
    expiresAt,
  }
}

export interface HandleMerchantPrepayCallbackInput extends ConfirmPaymentInput {
  /** 期望的付款方商户；不传则以订单上的 merchant_id 为准 */
  merchantId?: string
}

export interface HandleMerchantPrepayCallbackResult {
  order: PaymentOrder
  account: MerchantAccountRow
  poolBalance: MerchantPoolBalanceRow
  ledger: MerchantLedgerRow
  /** true = 命中幂等键，本次未重复入账 */
  replay: boolean
  /** 订单当前可用于展示的状态说明 */
  outcome: "credited" | "already_credited" | "not_credited"
}

/**
 * 支付网关回调 → 商户 cash 池入账。
 *
 * 流程：
 *   1. 按 orderNo 取单，校验 scene/付款方（防止把租户充值单当成商户预付入账）
 *   2. `confirmPayment` 原子跃迁 pending→paid（金额不符在此抛错，订单保持 pending）
 *   3. `postMerchantLedger` 写 cash 池流水 + 实时值（幂等键 = 订单 id）
 *
 * 并发/重投安全性：第 2 步用条件更新，第 3 步用唯一幂等键，两道都失效才会重复入账。
 */
export async function handleMerchantPrepayCallback(
  db: Db,
  input: HandleMerchantPrepayCallbackInput,
  /**
   * 可选的外部事务句柄。
   *
   * 传入时本函数**加入该事务而不新开事务**——人工核销凭证需要「把凭证标记为
   * 已核销」与「给商户加钱」严格同生共死：只成功一半会出现「凭证显示已入账、
   * 余额没动」这种最伤信任的状态（商户来投诉时，运营也无从判断该不该重试）。
   * 不传时行为与原来完全一致（自己开事务）。
   */
  tx?: any,
): Promise<HandleMerchantPrepayCallbackResult> {
  const order = await getPaymentOrderByNo(db, input.orderNo)
  if (!order) {
    throw new Error(`支付单不存在：${input.orderNo}`)
  }
  if (order.scene !== "merchant_prepay") {
    throw new Error(
      `支付单 ${input.orderNo} 的 scene=${order.scene}，不是 merchant_prepay，拒绝入账`,
    )
  }
  if (!order.merchantId) {
    throw new Error(`支付单 ${input.orderNo} 缺少 merchant_id，无法确定入账商户`)
  }
  if (input.merchantId && input.merchantId !== order.merchantId) {
    throw new Error(
      `支付单 ${input.orderNo} 的付款商户不匹配：订单=${order.merchantId} 请求=${input.merchantId}`,
    )
  }
  // 过期单不允许到账：用户可能已关掉收银台，稍后额度又被商户花掉
  if (order.status === "expired" && order.expiredAt.getTime() < Date.now()) {
    throw new Error(`支付单 ${input.orderNo} 已过期，拒绝入账`)
  }

  const merchantId = order.merchantId
  const idempotencyKey = merchantPrepayIdempotencyKey(order.id)

  // 第 2 步：状态跃迁 + 金额校验（金额不符抛 PaymentAmountMismatchError）
  const paidOrder = await confirmPayment(db, input)
  if (!paidOrder) {
    throw new Error(`支付单不存在：${input.orderNo}`)
  }

  // 第 3 步：幂等入账。postMerchantLedger 命中幂等键时返回 replay=true 且不重复写。
  const result = await postMerchantLedger(
    db,
    {
      merchantId,
      pool: "cash",
      direction: "credit",
      amount: Number(paidOrder.amount),
      refType: "prepay",
      refId: paidOrder.id,
      idempotencyKey,
      description: `预付充值 ¥${Number(paidOrder.amount).toFixed(2)}（单号 ${paidOrder.orderNo}）`,
      metadata: {
        scene: paidOrder.scene,
        paymentMethod: paidOrder.paymentMethod,
        channelOrderNo: paidOrder.channelOrderNo,
        paidAt: paidOrder.paidAt?.toISOString() ?? null,
      },
      occurredAt: paidOrder.paidAt ?? new Date(),
    },
    tx,
  )

  return {
    order: paidOrder,
    account: result.account,
    poolBalance: result.poolBalance,
    ledger: result.ledger,
    replay: result.replay,
    outcome: result.replay ? "already_credited" : "credited",
  }
}

/**
 * 预付退款：冲回商户 cash 池。
 *
 * 幂等键加 `-refund` 后缀，与正向入账区分 —— 同一订单可以退多次（分次退款），
 * 每次需要调用方提供不同的业务键。
 */
export async function refundMerchantPrepay(
  db: Db,
  input: {
    orderNo: string
    amount: number
    /** 退款业务唯一键（分次退款时各不相同） */
    idempotencyKey: string
    reason?: string
  },
): Promise<{ order: PaymentOrder; replay: boolean; ledger: MerchantLedgerRow }> {
  if (!(input.amount > 0)) {
    throw new Error(`退款金额必须为正数，收到 ${input.amount}`)
  }

  const order = await getPaymentOrderByNo(db, input.orderNo)
  if (!order) throw new Error(`支付单不存在：${input.orderNo}`)
  if (order.scene !== "merchant_prepay") {
    throw new Error(`支付单 ${input.orderNo} 不是商户预付单，拒绝退款`)
  }
  if (!order.merchantId) {
    throw new Error(`支付单 ${input.orderNo} 缺少 merchant_id`)
  }
  if (order.status !== "paid" && order.status !== "partial_refunded") {
    throw new Error(`支付单 ${input.orderNo} 状态为 ${order.status}，不可退款`)
  }

  const paidAmount = Number(order.amount)
  // 累计已退金额必须查流水：只看订单原始金额的话，退 1000 后还能再退 4999，
  // 等于把没收到的钱也退了 —— 这是最典型的退款资金事故。
  // 注意：db 是 Drizzle 实例，select() 直接返回行数组（不是 pg 的 QueryResult）
  const refundedRows = await db
    .select({
      total: sql<string>`coalesce(sum(${merchantAccountLedger.amount}), 0)::text`,
    })
    .from(merchantAccountLedger)
    .where(
      and(
        eq(merchantAccountLedger.merchantId, order.merchantId),
        eq(merchantAccountLedger.refType, "prepay_refund"),
        eq(merchantAccountLedger.refId, order.id),
      ),
    )
  const refundedSoFar = Number(refundedRows[0]?.total ?? 0)
  const refundable = paidAmount - refundedSoFar

  if (input.amount > refundable + 0.0001) {
    throw new Error(
      `退款金额 ¥${input.amount.toFixed(2)} 超过可退余额 ¥${refundable.toFixed(2)}` +
        `（实付 ¥${paidAmount.toFixed(2)}，已退 ¥${refundedSoFar.toFixed(2)}）`,
    )
  }

  const result = await postMerchantLedger(db, {
    merchantId: order.merchantId,
    pool: "cash",
    direction: "debit",
    amount: input.amount,
    refType: "prepay_refund",
    refId: order.id,
    idempotencyKey: input.idempotencyKey,
    description: `预付退款 ¥${input.amount.toFixed(2)}${input.reason ? `（${input.reason}）` : ""}`,
    metadata: { orderNo: order.orderNo, paymentMethod: order.paymentMethod },
    // 退款允许把 cash 打成负数：钱已退给商户，额度必须同步收回
    allowNegative: true,
  })

  // 订单状态：累计退满 → refunded，部分退 → partial_refunded
  const nextStatus =
    refundedSoFar + input.amount >= paidAmount - 0.0001 ? "refunded" : "partial_refunded"
  await db
    .update(paymentOrder)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(paymentOrder.id, order.id))

  return { order, replay: result.replay, ledger: result.ledger }
}

// ---------------------------------------------------------------------------
// 预付单查询（DB 级分页）
// ---------------------------------------------------------------------------

export interface ListMerchantPrepayParams {
  merchantId: string
  status?: string
  page?: number
  pageSize?: number
}

export async function listMerchantPrepayOrders(
  db: Db,
  params: ListMerchantPrepayParams,
): Promise<PaginatedResult<PaymentOrder>> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))

  const conditions: SQL[] = [
    eq(paymentOrder.merchantId, params.merchantId),
    eq(paymentOrder.scene, "merchant_prepay"),
  ]
  if (params.status) conditions.push(eq(paymentOrder.status, params.status))

  const where = and(...conditions)

  const [totalRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(paymentOrder)
    .where(where)

  const rows = await db
    .select()
    .from(paymentOrder)
    .where(where)
    .orderBy(desc(paymentOrder.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    items: rows as PaymentOrder[],
    total: Number(totalRow?.total ?? 0),
    page,
    pageSize,
  }
}

/**
 * 预付到账后的账户概览（供 UED 展示）。
 * available = cash + voucher + (creditLimit − creditUsed)
 */
export async function getMerchantPrepayAccount(
  db: Db,
  merchantId: string,
): Promise<{
  account: MerchantAccountRow
  availableTotal: number
  lowBalanceThreshold: number
  autoRechargeEnabled: boolean
  autoRechargeAmount: number
  isLowBalance: boolean
}> {
  const account = await getOrCreateMerchantAccount(db, merchantId)
  const availableTotal = await getMerchantAvailableTotal(db, merchantId)
  const threshold = Number(account.lowBalanceThreshold ?? 0)

  return {
    account,
    availableTotal,
    lowBalanceThreshold: threshold,
    autoRechargeEnabled: account.autoRechargeEnabled,
    autoRechargeAmount: Number(account.autoRechargeAmount ?? 0),
    // threshold=0 表示未配置预警线，此时不应报低余额
    isLowBalance: threshold > 0 && availableTotal < threshold,
  }
}

export { PaymentAmountMismatchError }
