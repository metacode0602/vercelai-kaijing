"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { trpc } from "@/trpc/client"
import {
  filterRechargeTransactions,
  getDefaultRechargeFilters,
} from "@/lib/recharge-shared"
import { RechargeFiltersBar } from "./_components/recharge-filters"
import { RechargeForm } from "./_components/recharge-form"
import { RechargeTransactionsTable } from "./_components/recharge-transactions-table"

export function RechargePageClient() {
  const [filters, setFilters] = useState(getDefaultRechargeFilters)
  const utils = trpc.useUtils()

  const balanceQuery = trpc.billing.balanceGet.useQuery()
  const ordersQuery = trpc.payment.listOrders.useQuery({ scene: "recharge", pageSize: 50 })
  const rechargeRecordsQuery = trpc.payment.listRechargeRecords.useQuery({ pageSize: 50 })

  const createOrder = trpc.payment.createRechargeOrder.useMutation({
    onSuccess: (data) => {
      toast.success(`订单 ${data.orderNo} 已创建，请完成支付`)
      utils.payment.listOrders.invalidate({ scene: "recharge" })
      utils.payment.listRechargeRecords.invalidate()
    },
    onError: (err) => {
      toast.error(err.message || "创建订单失败，请重试")
    },
  })

  const balance = balanceQuery.data?.availableBalance ?? 0

  const transactions = useMemo(() => {
    const online = (ordersQuery.data?.items ?? []).map((order) => ({
      id: order.id,
      date: order.createdAt?.toISOString() ?? order.paidAt?.toISOString() ?? "",
      type: "top_up" as const,
      note: order.scene === "recharge" ? "账户充值" : order.scene,
      paymentMethod: order.paymentMethod as "wechat" | "alipay" | "bank_transfer",
      status: order.status === "paid" ? "completed" as const
        : order.status === "pending" ? "pending" as const
        : "failed" as const,
      amount: Number(order.amount),
      tax: 0,
      totalAmount: Number(order.amount),
      receipt: order.channelOrderNo ?? null,
    }))

    const offline = (rechargeRecordsQuery.data?.items ?? []).map((r) => ({
      id: r.id,
      date: r.date,
      type: r.type,
      note: r.note,
      paymentMethod: r.paymentMethod,
      status: r.status,
      amount: r.amount,
      tax: r.tax,
      totalAmount: r.totalAmount,
      receipt: r.receipt,
    }))

    const merged = [...online, ...offline]
    merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return merged
  }, [ordersQuery.data, rechargeRecordsQuery.data])

  const filteredTransactions = useMemo(
    () => filterRechargeTransactions(transactions, filters),
    [transactions, filters],
  )

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-6">
      <RechargeForm
        balance={balance}
        onRecharge={async ({ amount, paymentMethod }) => {
          if (paymentMethod === "bank_transfer") return
          await createOrder.mutateAsync({ amount, paymentMethod })
        }}
      />

      <div className="mb-3 text-sm font-medium text-foreground">充值记录</div>

      <RechargeFiltersBar
        filters={filters}
        onDateRangeChange={(range) =>
          setFilters((prev) => ({
            ...prev,
            startDate: range.startDate,
            endDate: range.endDate,
          }))
        }
        onTransactionTypeChange={(transactionType) =>
          setFilters((prev) => ({ ...prev, transactionType }))
        }
        onPaymentMethodChange={(paymentMethod) =>
          setFilters((prev) => ({ ...prev, paymentMethod }))
        }
        onStatusChange={(status) => setFilters((prev) => ({ ...prev, status }))}
      />

      <RechargeTransactionsTable
        transactions={filteredTransactions}
        onViewReceipt={() => toast.info("收据查看功能即将上线")}
      />
    </div>
  )
}
