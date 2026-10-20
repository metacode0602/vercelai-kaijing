import { formatUSDDetail } from "@/lib/gpu-data"

export type CouponStatus = "active" | "expired" | "used"
export type MonthlyBillStatus = "upcoming" | "paid" | "unpaid"

export interface BillingCreditSummary {
  availableCredit: number
  accountBalance: number
}

export interface BillingVoucher {
  id: string
  name: string
  balance: number
  expiresAt: string
}

export interface BillingCoupon {
  id: string
  name: string
  effectiveDate: string
  expiryDate: string
  balance: number
  total: number
  products: string
  status: CouponStatus
}

export interface MonthlyBill {
  id: string
  periodLabel: string
  totalUsage: number
  appliedCoupons: number
  appliedBalance: number
  tax: number
  totalAmount: number
  amountDue: number
  amountPaid: number
  status: MonthlyBillStatus
  invoice: string | null
}

export interface BillingAutoTopUp {
  enabled: boolean
  hasPaymentMethod: boolean
}

export interface BillingPageData {
  credit: BillingCreditSummary
  vouchers: BillingVoucher[]
  coupons: BillingCoupon[]
  monthlyBills: MonthlyBill[]
  autoTopUp: BillingAutoTopUp
}

export const COUPON_STATUS_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "active", label: "有效" },
  { value: "expired", label: "已过期" },
  { value: "used", label: "已用完" },
] as const

export const MONTHLY_BILL_STATUS_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "upcoming", label: "Upcoming" },
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
] as const

export type CouponStatusFilter = (typeof COUPON_STATUS_OPTIONS)[number]["value"]
export type MonthlyBillStatusFilter =
  (typeof MONTHLY_BILL_STATUS_OPTIONS)[number]["value"]

export const MONTHLY_BILL_STATUS_LABELS: Record<MonthlyBillStatus, string> = {
  upcoming: "Upcoming",
  paid: "Paid",
  unpaid: "Unpaid",
}

export const COUPON_STATUS_LABELS: Record<CouponStatus, string> = {
  active: "有效",
  expired: "已过期",
  used: "已用完",
}

/** 演示数据；接入 API 后替换为真实数据源 */
const MOCK_BILLING_DATA: BillingPageData = {
  credit: {
    availableCredit: 0,
    accountBalance: 0,
  },
  vouchers: [],
  coupons: [],
  monthlyBills: [
    {
      id: "2026-06",
      periodLabel: "01 Jun 2026",
      totalUsage: 0,
      appliedCoupons: 0,
      appliedBalance: 0,
      tax: 0,
      totalAmount: 0,
      amountDue: 0,
      amountPaid: 0,
      status: "upcoming",
      invoice: null,
    },
    {
      id: "2026-05",
      periodLabel: "01 May 2026",
      totalUsage: 0,
      appliedCoupons: 0,
      appliedBalance: 0,
      tax: 0,
      totalAmount: 0,
      amountDue: 0,
      amountPaid: 0,
      status: "paid",
      invoice: null,
    },
    {
      id: "2026-04",
      periodLabel: "01 Apr 2026",
      totalUsage: 0,
      appliedCoupons: 0,
      appliedBalance: 0,
      tax: 0,
      totalAmount: 0,
      amountDue: 0,
      amountPaid: 0,
      status: "paid",
      invoice: null,
    },
  ],
  autoTopUp: {
    enabled: false,
    hasPaymentMethod: false,
  },
}

export async function getBillingPageData(): Promise<BillingPageData> {
  return MOCK_BILLING_DATA
}

export function formatBillingAmount(amount: number, detailed = false) {
  if (detailed) {
    return formatUSDDetail(amount)
  }
  if (amount === 0) return "$0"
  return formatUSDDetail(amount)
}

export function formatAvailableCredit(amount: number) {
  return `$ ${formatUSDDetail(amount).replace("$", "")}`
}

export function filterCoupons(
  coupons: BillingCoupon[],
  status: CouponStatusFilter,
) {
  if (status === "all") return coupons
  return coupons.filter((coupon) => coupon.status === status)
}

export function filterMonthlyBills(
  bills: MonthlyBill[],
  status: MonthlyBillStatusFilter,
) {
  if (status === "all") return bills
  return bills.filter((bill) => bill.status === status)
}
