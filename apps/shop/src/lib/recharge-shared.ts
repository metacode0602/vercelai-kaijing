/**
 * Shared types and utilities for the recharge feature.
 * This file is safe for both server and client imports.
 */

import { formatBillingAmount } from "@/lib/billing-data"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RechargeTransactionType = "top_up" | "refund" | "adjustment"
export type RechargePaymentMethod = "alipay" | "wechat" | "bank_transfer"
export type RechargeTransactionStatus = "completed" | "pending" | "failed"

export interface RechargeTransaction {
  id: string
  date: string
  type: RechargeTransactionType
  note: string
  paymentMethod: RechargePaymentMethod
  status: RechargeTransactionStatus
  amount: number
  tax: number
  totalAmount: number
  receipt: string | null
}

export interface RechargeFilters {
  startDate: Date | null
  endDate: Date | null
  transactionType: "all" | RechargeTransactionType
  paymentMethod: "all" | RechargePaymentMethod
  status: "all" | RechargeTransactionStatus
}

export interface RechargePageData {
  transactions: RechargeTransaction[]
  balance: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RECHARGE_TRANSACTION_TYPE_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "top_up", label: "充值" },
  { value: "refund", label: "退款" },
  { value: "adjustment", label: "调整" },
] as const

export const RECHARGE_PAYMENT_METHOD_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "alipay", label: "支付宝" },
  { value: "wechat", label: "微信支付" },
  { value: "bank_transfer", label: "对公转账" },
] as const

export const RECHARGE_PRESET_AMOUNTS = [1, 10, 50, 100, 1000] as const

export type RechargePresetAmount = (typeof RECHARGE_PRESET_AMOUNTS)[number]
export type RechargeAmountSelection = RechargePresetAmount | "custom"

export const RECHARGE_FORM_PAYMENT_METHODS = [
  { value: "wechat", label: "微信支付" },
  { value: "alipay", label: "支付宝" },
  { value: "bank_transfer", label: "对公转账" },
] as const satisfies ReadonlyArray<{
  value: RechargePaymentMethod
  label: string
}>

export const RECHARGE_STATUS_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "completed", label: "已完成" },
  { value: "pending", label: "处理中" },
  { value: "failed", label: "失败" },
] as const

export type RechargeTransactionTypeFilter =
  (typeof RECHARGE_TRANSACTION_TYPE_OPTIONS)[number]["value"]
export type RechargePaymentMethodFilter =
  (typeof RECHARGE_PAYMENT_METHOD_OPTIONS)[number]["value"]
export type RechargeStatusFilter = (typeof RECHARGE_STATUS_OPTIONS)[number]["value"]

export const RECHARGE_TRANSACTION_TYPE_LABELS: Record<
  RechargeTransactionType,
  string
> = {
  top_up: "充值",
  refund: "退款",
  adjustment: "调整",
}

export const RECHARGE_PAYMENT_METHOD_LABELS: Record<
  RechargePaymentMethod,
  string
> = {
  alipay: "支付宝",
  wechat: "微信支付",
  bank_transfer: "对公转账",
}

export const RECHARGE_STATUS_LABELS: Record<RechargeTransactionStatus, string> =
  {
    completed: "已完成",
    pending: "处理中",
    failed: "失败",
  }

export interface BankTransferInfo {
  accountName: string
  bankName: string
  accountNumber: string
  remittanceCode: string
}

/** Placeholder — in production, loaded from bank_account table via server component */
export const BANK_TRANSFER_INFO: BankTransferInfo = {
  accountName: "天津聚链科技有限公司",
  bankName: "中国农业银行股份有限公司津滨支行",
  accountNumber: "6228 4000 2701 2930 467",
  remittanceCode: "docsify@163.com",
}

// ---------------------------------------------------------------------------
// Formatting helpers (client-safe)
// ---------------------------------------------------------------------------

export function formatRechargeAmountCny(amount: number) {
  return `¥${amount.toLocaleString("zh-CN", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatRechargeMoney(amount: number) {
  return formatBillingAmount(amount)
}

export function formatBankTransferCopyText(info: BankTransferInfo = BANK_TRANSFER_INFO) {
  return [
    `户名：${info.accountName}`,
    `银行账号：${info.accountNumber}`,
    `开户行：${info.bankName}`,
    `汇款识别码：${info.remittanceCode}`,
  ].join("\n")
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function utcDayStartMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function utcDayEndMs(date: Date): number {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    23,
    59,
    59,
    999,
  )
}

export function isTransactionWithinUtcDateRange(
  iso: string,
  startDate: Date | null,
  endDate: Date | null,
): boolean {
  if (!startDate || !endDate) return true
  const timestamp = new Date(iso).getTime()
  return (
    timestamp >= utcDayStartMs(startDate) && timestamp <= utcDayEndMs(endDate)
  )
}

export function formatRechargeDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso))

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`
}

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

export function getDefaultRechargeFilters(): RechargeFilters {
  return {
    startDate: null,
    endDate: null,
    transactionType: "all",
    paymentMethod: "all",
    status: "all",
  }
}

export function filterRechargeTransactions(
  transactions: RechargeTransaction[],
  filters: RechargeFilters,
): RechargeTransaction[] {
  return transactions.filter((transaction) => {
    if (
      filters.transactionType !== "all" &&
      transaction.type !== filters.transactionType
    ) {
      return false
    }
    if (
      filters.paymentMethod !== "all" &&
      transaction.paymentMethod !== filters.paymentMethod
    ) {
      return false
    }
    if (filters.status !== "all" && transaction.status !== filters.status) {
      return false
    }
    if (
      !isTransactionWithinUtcDateRange(
        transaction.date,
        filters.startDate,
        filters.endDate,
      )
    ) {
      return false
    }
    return true
  })
}
