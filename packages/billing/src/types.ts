import type { InferSelectModel } from "drizzle-orm"
import type {
  balanceTransaction,
  paymentOrder,
  paymentRefund,
  tenantBalance,
} from "@workspace/db"

// ---------------------------------------------------------------------------
// Re-export schema types for consumer convenience
// ---------------------------------------------------------------------------

export type PaymentOrder = InferSelectModel<typeof paymentOrder>
export type TenantBalance = InferSelectModel<typeof tenantBalance>
export type BalanceTransaction = InferSelectModel<typeof balanceTransaction>
export type PaymentRefund = InferSelectModel<typeof paymentRefund>

// ---------------------------------------------------------------------------
// Payment scenes
// ---------------------------------------------------------------------------

export const PAYMENT_SCENES = [
  "recharge",
  "bare_metal_order",
  "serverless",
  /** 商户向平台预付现金，到账落 merchant_account_ledger 的 cash 池 */
  "merchant_prepay",
  /** 商户采购算力券，现金池 → 券池 */
  "voucher_purchase",
] as const
export type PaymentScene = (typeof PAYMENT_SCENES)[number]

// ---------------------------------------------------------------------------
// Payment methods
// ---------------------------------------------------------------------------

export const PAYMENT_METHODS = ["wechat", "alipay", "bank_transfer"] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

// ---------------------------------------------------------------------------
// Payment order statuses
// ---------------------------------------------------------------------------

export const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "expired",
  "refunded",
  "partial_refunded",
] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

// ---------------------------------------------------------------------------
// Balance transaction types
// ---------------------------------------------------------------------------

export const BALANCE_TX_TYPES = [
  "recharge",
  "deduction",
  "auto_deduction",
  "refund",
  "freeze",
  "unfreeze",
  "adjustment",
  "bonus",
  "coupon_refund",
  // 券维度（商户发放的算力券，设计 §3.2② / §3.4）
  /** 商户发券给用户：券池实时值 + */
  "voucher_grant",
  /** 券消费核销：券池实时值 − */
  "voucher_consume",
  /** 券过期失效：券池实时值 − */
  "voucher_expire",
  /** 券返还：券池实时值 + */
  "voucher_refund",
] as const
export type BalanceTxType = (typeof BALANCE_TX_TYPES)[number]

// ---------------------------------------------------------------------------
// Balance transaction ref types
// ---------------------------------------------------------------------------

export const BALANCE_TX_REF_TYPES = [
  "bare_metal_order",
  "compute_base",
  "serve_endpoint",
  "recharge",
  "preload_task",
  "manual",
] as const
export type BalanceTxRefType = (typeof BALANCE_TX_REF_TYPES)[number]

// ---------------------------------------------------------------------------
// Refund statuses
// ---------------------------------------------------------------------------

export const REFUND_STATUSES = [
  "pending",
  "processing",
  "success",
  "failed",
] as const
export type RefundStatus = (typeof REFUND_STATUSES)[number]

// ---------------------------------------------------------------------------
// Input types for service functions
// ---------------------------------------------------------------------------

/**
 * 支付单创建入参。
 *
 * 付款方二选一：租户充值填 tenantId（到账落 tenant_balance），商户预付填
 * merchantId（到账落 merchant_account_ledger）。用联合类型而不是两个 optional，
 * 是为了让「付款方为空」在编译期就不可表达 —— DB 上还有一道 CHECK 兜底。
 */
export type CreatePaymentOrderInput = {
  scene: PaymentScene
  sceneOrderId?: string
  amount: number
  paymentMethod: PaymentMethod
  expiredAt: Date
  createdBy?: string
  ipAddress?: string
  userAgent?: string
} & (
  | { tenantId: string; merchantId?: never }
  | { merchantId: string; tenantId?: never }
)

export interface ConfirmPaymentInput {
  orderNo: string
  channelOrderNo?: string
  channelStatus?: string
  channelResponse?: Record<string, unknown>
  paidAt?: Date
  /**
   * 渠道回单里的实付金额。传入时会与订单金额比对，不一致直接拒绝到账 ——
   * 少付/多付都必须人工介入，不能按订单金额静默入账。
   */
  paidAmount?: number
}

export interface CreateRefundInput {
  paymentOrderId: string
  tenantId: string
  amount: number
  reason: string
  reviewerId?: string
}

export interface CreditBalanceInput {
  tenantId: string
  organizationId: string
  amount: number
  txType: BalanceTxType
  refType?: BalanceTxRefType
  refId?: string
  description?: string
  createdBy?: string
}

/** 冻结余额（提交任务时） */
export interface FreezeBalanceInput {
  tenantId: string
  organizationId: string
  amount: number
  refType?: BalanceTxRefType
  refId?: string
  description?: string
}

/** 解冻余额（任务结束时释放剩余冻结） */
export interface UnfreezeBalanceInput {
  tenantId: string
  organizationId: string
  amount: number
  refType?: BalanceTxRefType
  refId?: string
  description?: string
}

/** 消费冻结金额（周期扣费：从 reserved 转为实际消费） */
export interface ConsumeReservedInput {
  tenantId: string
  organizationId: string
  amount: number
  refType?: BalanceTxRefType
  refId?: string
  description?: string
  /**
   * 幂等键：同一结算窗/业务事件重试时必须传稳定 key（如 waverless window idempotency key）。
   * 命中已存在流水则回放首次结果，余额不再变动。
   */
  idempotencyKey?: string
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
