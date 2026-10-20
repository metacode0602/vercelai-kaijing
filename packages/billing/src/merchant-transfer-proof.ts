/**
 * 对公转账到账凭证 —— 商户提交 / 平台核销
 *
 * 复用既有表 `bank_transfer_verification`（此前零代码引用），不新建表。
 *
 * ## 为什么人工核销要走 `handleMerchantPrepayCallback`
 *
 * 入账只有一条路径：`pending → paid` 条件跃迁 + 按订单 id 幂等写 cash 池流水。
 * 人工核销与渠道回调共用它，是刻意的：两份实现迟早会在「过期单 / 金额不符 /
 * 重复入账」上分叉，而这类分叉表现为**平台凭空多钱或少钱**，最难事后追溯。
 *
 * ## 三个刻意的约束
 *
 * 1. **并发安全**：核销用 `where review_status='pending'` 的条件更新抢占。两个
 *    运营同时点「通过」时只有一个 UPDATE 影响 1 行；另一个人拿到
 *    `already_reviewed`，不会把「已被别人入账」误当成自己操作成功。
 * 2. **金额不一致绝不自动入账**。`confirmPayment` 会比对实付与订单金额，不一致
 *    直接拒绝到账 —— 钱到账金额与订单不符时，系统无权替人决定是收还是退，
 *    必须人工走补汇/退款。`amountOverride` 只用于修正「商户把凭证金额填错」。
 * 3. **凭证与订单状态都要看**。单已到账/已退款/已过期时拒绝核销，避免出现
 *    「凭证通过但钱没进」或「钱进了凭证还挂着待核销」。
 *
 * 先抢占凭证、再入账：反过来的话入账成功而凭证状态更新失败，运营会看到
 * 「还是待核销」再点一次。`handleMerchantPrepayCallback` 幂等不至于重复加钱，
 * 但运营对不上账时会失去对系统的信任。
 */

import { and, desc, eq, sql } from "drizzle-orm"
import {
  bankTransferVerification,
  merchant,
  paymentOrder,
} from "@workspace/db"
import { handleMerchantPrepayCallback } from "./merchant-prepay"
import type { PaginatedResult } from "./types"

type Db = any

const PROOF_REVIEW_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const
export type ProofReviewStatus = (typeof PROOF_REVIEW_STATUSES)[number]

// ---------------------------------------------------------------------------
// 错误
// ---------------------------------------------------------------------------

/** 凭证不存在，或不属于该商户（不区分，避免用单号探测他人订单） */
export class TransferProofOrderNotFoundError extends Error {
  readonly code = "TRANSFER_PROOF_ORDER_NOT_FOUND"
  constructor(orderNo: string) {
    super(`充值单不存在：${orderNo}`)
    this.name = "TransferProofOrderNotFoundError"
  }
}

/** 订单不是可提交凭证的状态（已到账 / 已过期 / scene 不符） */
export class TransferProofOrderNotPayableError extends Error {
  readonly code = "TRANSFER_PROOF_ORDER_NOT_PAYABLE"
  readonly status: string
  constructor(orderNo: string, status: string) {
    super(`充值单 ${orderNo} 当前状态为 ${status}，不能提交到账凭证`)
    this.name = "TransferProofOrderNotPayableError"
    this.status = status
  }
}

/** 并发下已被他人处理 */
export class TransferProofAlreadyReviewedError extends Error {
  readonly code = "TRANSFER_PROOF_ALREADY_REVIEWED"
  constructor() {
    super("该凭证已被处理，请刷新后查看最新状态")
    this.name = "TransferProofAlreadyReviewedError"
  }
}

/** 到账金额与订单金额不符：拒绝自动入账，需人工线下处理 */
export class TransferProofAmountMismatchError extends Error {
  readonly code = "TRANSFER_PROOF_AMOUNT_MISMATCH"
  readonly orderAmount: number
  readonly transferAmount: number
  constructor(orderAmount: number, transferAmount: number) {
    super(
      `到账金额 ¥${transferAmount.toFixed(2)} 与订单金额 ¥${orderAmount.toFixed(2)} 不一致，` +
        `系统不会自动入账。请核对银行流水后走补汇或退款流程处理`,
    )
    this.name = "TransferProofAmountMismatchError"
    this.orderAmount = orderAmount
    this.transferAmount = transferAmount
  }
}

export class TransferProofNotFoundError extends Error {
  readonly code = "TRANSFER_PROOF_NOT_FOUND"
  constructor(proofId: string) {
    super(`凭证不存在：${proofId}`)
    this.name = "TransferProofNotFoundError"
  }
}

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------

export interface TransferProofDto {
  id: string
  orderId: string
  orderNo: string
  merchantId: string
  merchantName: string | null
  remitterName: string
  remitterAccount: string | null
  /** 订单金额 */
  orderAmount: number
  /** 实际汇款金额 */
  transferAmount: number
  /** 两者是否一致（不一致需运营线下处理，系统不自动入账） */
  amountConsistent: boolean
  bankSerialNo: string | null
  voucherImageUrl: string | null
  remark: string | null
  reviewStatus: ProofReviewStatus
  reviewComment: string | null
  reviewedAt: Date | null
  orderStatus: string
  orderExpiresAt: Date
  createdAt: Date
}

export interface SubmitTransferProofInput {
  orderNo: string
  /** 提交方商户；与订单 merchant_id 不符即视为不存在 */
  merchantId: string
  remitterName: string
  remitterAccount?: string
  transferAmount: number
  transferTime?: Date
  bankSerialNo?: string
  voucherImageUrl?: string
  remark?: string
}

export interface ReviewTransferProofResult {
  orderNo: string
  /** 收款商户（payment_order.merchant_id），供调用方落站内信等副作用；历史数据可能为空 */
  merchantId: string | null
  /** 实际入账金额 */
  credited: number
  /** true = 命中幂等键，本次未重复入账 */
  replay: boolean
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const proofSelection = {
  proof: bankTransferVerification,
  orderNo: paymentOrder.orderNo,
  orderAmount: paymentOrder.amount,
  orderStatus: paymentOrder.status,
  orderExpiresAt: paymentOrder.expiredAt,
  merchantId: paymentOrder.merchantId,
  merchantName: merchant.name,
}

type ProofJoinRow = {
  proof: typeof bankTransferVerification.$inferSelect
  orderNo: string
  orderAmount: string
  orderStatus: string
  orderExpiresAt: Date
  merchantId: string | null
  merchantName: string | null
}

const mapRow = (r: ProofJoinRow): TransferProofDto => {
  const orderAmount = num(r.orderAmount)
  const transferAmount = num(r.proof.transferAmount)
  return {
    id: r.proof.id,
    orderId: r.proof.paymentOrderId,
    orderNo: r.orderNo,
    merchantId: r.merchantId ?? "",
    merchantName: r.merchantName,
    remitterName: r.proof.remitterName,
    remitterAccount: r.proof.remitterAccount,
    orderAmount,
    transferAmount,
    amountConsistent: orderAmount === transferAmount,
    bankSerialNo: r.proof.bankSerialNo,
    voucherImageUrl: r.proof.voucherImageUrl,
    remark: r.proof.remark,
    reviewStatus: r.proof.reviewStatus as ProofReviewStatus,
    reviewComment: r.proof.reviewComment,
    reviewedAt: r.proof.reviewedAt,
    orderStatus: r.orderStatus,
    orderExpiresAt: r.orderExpiresAt,
    createdAt: r.proof.createdAt,
  }
}

// ---------------------------------------------------------------------------
// 商户侧：提交凭证
// ---------------------------------------------------------------------------

/**
 * 商户提交到账凭证。
 *
 * 只落「待核销」记录，**绝不**碰 `merchant_account_ledger` —— 系统不会因为
 * 「商户说他转了」就加钱。
 *
 * 幂等：同单 + 同银行流水号已存在时直接返回原记录。商户网络重试/重复点击
 * 不该在运营队列里堆出多条一样的待核销。
 */
export async function submitTransferProof(
  db: Db,
  input: SubmitTransferProofInput,
): Promise<TransferProofDto> {
  const [order] = await db
    .select({
      id: paymentOrder.id,
      merchantId: paymentOrder.merchantId,
      amount: paymentOrder.amount,
      status: paymentOrder.status,
      scene: paymentOrder.scene,
    })
    .from(paymentOrder)
    .where(eq(paymentOrder.orderNo, input.orderNo))

  if (!order || order.merchantId !== input.merchantId) {
    // 不区分「不存在」与「不属于你」：避免用单号探测他人订单
    throw new TransferProofOrderNotFoundError(input.orderNo)
  }
  if (order.scene !== "merchant_prepay") {
    throw new TransferProofOrderNotPayableError(input.orderNo, `scene=${order.scene}`)
  }
  if (order.status !== "pending") {
    throw new TransferProofOrderNotPayableError(input.orderNo, order.status)
  }

  if (input.bankSerialNo) {
    const [existing] = await db
      .select(proofSelection)
      .from(bankTransferVerification)
      .innerJoin(paymentOrder, eq(paymentOrder.id, bankTransferVerification.paymentOrderId))
      .leftJoin(merchant, eq(merchant.id, paymentOrder.merchantId))
      .where(
        and(
          eq(bankTransferVerification.paymentOrderId, order.id),
          eq(bankTransferVerification.bankSerialNo, input.bankSerialNo),
        ),
      )
    if (existing) {
      return mapRow(existing as ProofJoinRow)
    }
  }

  const id = globalThis.crypto.randomUUID()
  await db.insert(bankTransferVerification).values({
    id,
    paymentOrderId: order.id,
    remitterName: input.remitterName,
    remitterAccount: input.remitterAccount ?? null,
    transferAmount: String(input.transferAmount),
    transferTime: input.transferTime ?? null,
    bankSerialNo: input.bankSerialNo ?? null,
    voucherImageUrl: input.voucherImageUrl ?? null,
    remark: input.remark ?? null,
    reviewStatus: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  const [row] = await db
    .select(proofSelection)
    .from(bankTransferVerification)
    .innerJoin(paymentOrder, eq(paymentOrder.id, bankTransferVerification.paymentOrderId))
    .leftJoin(merchant, eq(merchant.id, paymentOrder.merchantId))
    .where(eq(bankTransferVerification.id, id))
  if (!row) {
    throw new Error("提交凭证失败：写入后读不到记录")
  }
  return mapRow(row as ProofJoinRow)
}

/** 商户自查：某充值单下的凭证与核销状态 */
export async function listTransferProofsByOrder(
  db: Db,
  input: { orderNo: string; merchantId: string },
): Promise<TransferProofDto[]> {
  const rows = await db
    .select(proofSelection)
    .from(bankTransferVerification)
    .innerJoin(paymentOrder, eq(paymentOrder.id, bankTransferVerification.paymentOrderId))
    .leftJoin(merchant, eq(merchant.id, paymentOrder.merchantId))
    .where(
      and(
        eq(paymentOrder.orderNo, input.orderNo),
        eq(paymentOrder.merchantId, input.merchantId),
      ),
    )
    .orderBy(desc(bankTransferVerification.createdAt))
  return rows.map((r: ProofJoinRow) => mapRow(r))
}

// ---------------------------------------------------------------------------
// 平台侧：核销队列
// ---------------------------------------------------------------------------

/**
 * 核销队列（DB 级分页）。
 *
 * 默认只列 pending：运营的工作台是「现在要处理什么」。已处理记录用
 * `reviewStatus` 显式查询，避免把历史档案和待办混在一页。
 */
export async function listTransferProofsForOps(
  db: Db,
  input: {
    reviewStatus?: ProofReviewStatus
    merchantId?: string
    /** 只看金额对不上的：最容易出事故的一类，单独给个筛选项 */
    onlyMismatch?: boolean
    page: number
    pageSize: number
  },
): Promise<PaginatedResult<TransferProofDto>> {
  const page = Math.max(1, input.page)
  const pageSize = Math.min(100, Math.max(1, input.pageSize))

  const conditions: any[] = [
    sql`${bankTransferVerification.reviewStatus} = ${input.reviewStatus ?? "pending"}`,
  ]
  if (input.merchantId) {
    conditions.push(eq(paymentOrder.merchantId, input.merchantId))
  }
  if (input.onlyMismatch) {
    conditions.push(
      sql`${bankTransferVerification.transferAmount} <> ${paymentOrder.amount}`,
    )
  }
  const where = and(...conditions)

  const [totalRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(bankTransferVerification)
    .innerJoin(paymentOrder, eq(paymentOrder.id, bankTransferVerification.paymentOrderId))
    .where(where)
  const total = Number(totalRow?.total ?? 0)

  const rows = await db
    .select(proofSelection)
    .from(bankTransferVerification)
    .innerJoin(paymentOrder, eq(paymentOrder.id, bankTransferVerification.paymentOrderId))
    .leftJoin(merchant, eq(merchant.id, paymentOrder.merchantId))
    .where(where)
    .orderBy(desc(bankTransferVerification.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    items: rows.map((r: ProofJoinRow) => mapRow(r)),
    total,
    page,
    pageSize,
  }
}

/** 运营首页角标：待核销总数 / 其中金额不一致数 */
export async function getTransferProofSummary(
  db: Db,
): Promise<{ pending: number; mismatch: number }> {
  const rows = await db
    .select({
      total: sql<number>`count(*)`,
      mismatch: sql<number>`count(*) filter (where ${bankTransferVerification.transferAmount} <> ${paymentOrder.amount})`,
    })
    .from(bankTransferVerification)
    .innerJoin(paymentOrder, eq(paymentOrder.id, bankTransferVerification.paymentOrderId))
    .where(eq(bankTransferVerification.reviewStatus, "pending"))

  return {
    pending: Number(rows[0]?.total ?? 0),
    mismatch: Number(rows[0]?.mismatch ?? 0),
  }
}

// ---------------------------------------------------------------------------
// 平台侧：核销
// ---------------------------------------------------------------------------

async function loadProofForReview(
  db: Db,
  proofId: string,
): Promise<{
  proof: typeof bankTransferVerification.$inferSelect
  orderNo: string
  orderAmount: number
  orderStatus: string
  merchantId: string | null
}> {
  const [row] = await db
    .select({
      proof: bankTransferVerification,
      orderNo: paymentOrder.orderNo,
      orderAmount: paymentOrder.amount,
      orderStatus: paymentOrder.status,
      merchantId: paymentOrder.merchantId,
    })
    .from(bankTransferVerification)
    .innerJoin(paymentOrder, eq(paymentOrder.id, bankTransferVerification.paymentOrderId))
    .where(eq(bankTransferVerification.id, proofId))
  if (!row) {
    throw new TransferProofNotFoundError(proofId)
  }
  return { ...row, orderAmount: num(row.orderAmount) }
}

/** 抢占：条件更新保证并发下只有一个赢家 */
async function claimProof(
  db: Db,
  proofId: string,
  reviewStatus: "approved" | "rejected",
  input: { reviewerId: string; comment?: string },
): Promise<void> {
  const claimed = await db
    .update(bankTransferVerification)
    .set({
      reviewStatus,
      reviewerId: input.reviewerId,
      reviewedBy: input.reviewerId,
      reviewComment: input.comment ?? null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bankTransferVerification.id, proofId),
        eq(bankTransferVerification.reviewStatus, "pending"),
      ),
    )
    .returning({ id: bankTransferVerification.id })

  if (!claimed || claimed.length === 0) {
    throw new TransferProofAlreadyReviewedError()
  }
}

/**
 * 核销通过：入账到商户 cash 池。
 *
 * **抢占凭证与入账在同一事务内**。这不是洁癖：只成功一半会留下「凭证显示
 * 已入账、余额没动」的状态 —— 商户拿着截图来问时，运营既不能承认已入账，
 * 也不敢重试（怕真的重复入账），只能挂着。而 `handleMerchantPrepayCallback`
 * 的幂等键（订单 id）本就允许安全重试，事务把「重试」重新变成一个明确选项。
 *
 * `amountOverride` 只用于修正「商户把凭证金额填错」。它**不能**用来按订单金额
 * 硬入账 —— 金额与订单不符一律拒绝，要求人工走补汇/退款。
 */
export async function approveTransferProof(
  db: Db,
  input: {
    proofId: string
    reviewerId: string
    amountOverride?: number
    comment?: string
  },
): Promise<ReviewTransferProofResult> {
  const current = await loadProofForReview(db, input.proofId)
  if (current.orderStatus !== "pending") {
    throw new TransferProofOrderNotPayableError(current.orderNo, current.orderStatus)
  }

  // 真实到账金额：默认取凭证记载，运营可用 override 修正商户填错的数字
  const actualAmount = input.amountOverride ?? num(current.proof.transferAmount)
  if (actualAmount !== current.orderAmount) {
    throw new TransferProofAmountMismatchError(current.orderAmount, actualAmount)
  }

  return await db.transaction(async (tx: any) => {
    await claimProof(tx, input.proofId, "approved", input)

    const result = await handleMerchantPrepayCallback(
      tx,
      {
        orderNo: current.orderNo,
        merchantId: current.merchantId ?? undefined,
        paidAmount: actualAmount,
        paidAt: new Date(),
        channelStatus: "manual_review",
        channelResponse: {
          source: "bank_transfer_manual_review",
          proofId: input.proofId,
          reviewerId: input.reviewerId,
          bankSerialNo: current.proof.bankSerialNo,
          voucherImageUrl: current.proof.voucherImageUrl,
          amountOverride: input.amountOverride ?? null,
        },
      },
      tx,
    )

    return {
      orderNo: current.orderNo,
      merchantId: current.merchantId,
      credited: num(result.order.amount),
      replay: result.replay,
    }
  })
}

/**
 * 核销驳回：钱没到 / 凭证不实。
 *
 * 订单保持 pending（商户可能稍后提交正确凭证），这里只终结凭证。
 */
export async function rejectTransferProof(
  db: Db,
  input: { proofId: string; reviewerId: string; comment?: string },
): Promise<{ orderNo: string; merchantId: string | null }> {
  const current = await loadProofForReview(db, input.proofId)
  await claimProof(db, input.proofId, "rejected", input)
  return { orderNo: current.orderNo, merchantId: current.merchantId }
}
