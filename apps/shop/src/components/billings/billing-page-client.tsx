"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { trpc } from "@/trpc/client"
import type { MonthlyBillStatusFilter, CouponStatusFilter } from "@/lib/billing-data"
import {
  filterCoupons,
  filterMonthlyBills,
} from "@/lib/billing-data"
import { BillingCouponsSection } from "./_components/billing-coupons-section"
import { BillingMonthlyBillsSection } from "./_components/billing-monthly-bills-section"
import { BillingOverviewSection } from "./_components/billing-overview-section"

export function BillingPageClient() {
  const [topUpAmount, setTopUpAmount] = useState("10")
  const [autoTopUpEnabled, setAutoTopUpEnabled] = useState(false)
  const [couponStatusFilter, setCouponStatusFilter] = useState<CouponStatusFilter>("all")
  const [billStatusFilter, setBillStatusFilter] = useState<MonthlyBillStatusFilter>("all")

  const balanceQuery = trpc.billing.balanceGet.useQuery()
  const vouchersQuery = trpc.billing.vouchersList.useQuery()
  const monthlyBillsQuery = trpc.billing.monthlyBillsList.useQuery({ pageSize: 12 })

  const balance = balanceQuery.data ?? { availableBalance: 0, reservedBalance: 0, currency: "CNY" }
  const allVouchers = vouchersQuery.data ?? []
  const monthlyBills = monthlyBillsQuery.data?.items ?? []

  const vouchersForOverview = useMemo(
    () => allVouchers.map((v) => ({ id: v.id, name: v.name, balance: v.balance, expiresAt: v.expiresAt ?? "" })),
    [allVouchers],
  )

  const couponsForTable = useMemo(
    () => allVouchers.map((v) => ({
      id: v.id,
      name: v.name,
      effectiveDate: v.effectiveDate ?? "",
      expiryDate: v.expiresAt ?? "",
      balance: v.balance,
      total: v.total,
      products: v.products,
      status: v.status as "active" | "expired" | "used",
    })),
    [allVouchers],
  )

  const filteredCoupons = useMemo(
    () => filterCoupons(couponsForTable, couponStatusFilter),
    [couponsForTable, couponStatusFilter],
  )

  const filteredBills = useMemo(
    () => filterMonthlyBills(monthlyBills, billStatusFilter),
    [monthlyBills, billStatusFilter],
  )

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-6">
      <BillingOverviewSection
        credit={{
          availableCredit: balance.availableBalance,
          accountBalance: balance.availableBalance,
        }}
        vouchers={vouchersForOverview}
        autoTopUp={{
          enabled: autoTopUpEnabled,
          hasPaymentMethod: false,
        }}
        topUpAmount={topUpAmount}
        onTopUpAmountChange={setTopUpAmount}
        onRedeemVoucher={() => toast.info("代金券兑换功能即将上线")}
        onTopUp={() => toast.info(`充值 $${topUpAmount || "0"} 功能即将上线`)}
        onAutoTopUpChange={setAutoTopUpEnabled}
        onAutoTopUpSettings={() => toast.info("自动充值设置功能即将上线")}
        onAddPaymentMethod={() => toast.info("添加银行卡功能即将上线")}
      />

      <BillingCouponsSection
        coupons={filteredCoupons}
        statusFilter={couponStatusFilter}
        onStatusFilterChange={setCouponStatusFilter}
      />

      <BillingMonthlyBillsSection
        bills={filteredBills}
        statusFilter={billStatusFilter}
        onStatusFilterChange={setBillStatusFilter}
        onUpdateBillingInfo={() => toast.info("更新账单信息功能即将上线")}
      />
    </div>
  )
}
