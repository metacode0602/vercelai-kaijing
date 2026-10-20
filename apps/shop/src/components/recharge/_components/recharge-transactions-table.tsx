"use client"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"
import type { RechargeTransaction } from "@/lib/recharge-shared"
import {
  formatRechargeDate,
  formatRechargeMoney,
  RECHARGE_PAYMENT_METHOD_LABELS,
  RECHARGE_STATUS_LABELS,
  RECHARGE_TRANSACTION_TYPE_LABELS,
} from "@/lib/recharge-shared"

interface RechargeTransactionsTableProps {
  transactions: RechargeTransaction[]
  onViewReceipt?: (transaction: RechargeTransaction) => void
}

function StatusBadge({ status }: { status: RechargeTransaction["status"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-normal",
        status === "completed" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        status === "pending" && "border-amber-200 bg-amber-50 text-amber-700",
        status === "failed" && "border-red-200 bg-red-50 text-red-700",
      )}
    >
      {RECHARGE_STATUS_LABELS[status]}
    </Badge>
  )
}

export function RechargeTransactionsTable({
  transactions,
  onViewReceipt,
}: RechargeTransactionsTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>交易 ID</TableHead>
            <TableHead>交易日期</TableHead>
            <TableHead>交易类型</TableHead>
            <TableHead>备注</TableHead>
            <TableHead>支付方式</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">金额</TableHead>
            <TableHead className="text-right">税额</TableHead>
            <TableHead className="text-right">总金额</TableHead>
            <TableHead>收据</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={10} className="h-[200px] p-0">
                <Empty className="min-h-[200px] border-0">
                  <EmptyHeader>
                    <EmptyTitle className="text-muted-foreground">
                      无数据
                    </EmptyTitle>
                    <EmptyDescription>
                      暂无符合条件的交易记录
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </TableCell>
            </TableRow>
          ) : (
            transactions.map((transaction) => (
              <TableRow key={transaction.id}>
                <TableCell className="font-mono text-xs">
                  {transaction.id}
                </TableCell>
                <TableCell>{formatRechargeDate(transaction.date)}</TableCell>
                <TableCell>
                  {RECHARGE_TRANSACTION_TYPE_LABELS[transaction.type]}
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {transaction.note || "—"}
                </TableCell>
                <TableCell>
                  {RECHARGE_PAYMENT_METHOD_LABELS[transaction.paymentMethod]}
                </TableCell>
                <TableCell>
                  <StatusBadge status={transaction.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatRechargeMoney(transaction.amount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatRechargeMoney(transaction.tax)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatRechargeMoney(transaction.totalAmount)}
                </TableCell>
                <TableCell>
                  {transaction.receipt ? (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => onViewReceipt?.(transaction)}
                    >
                      查看
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
