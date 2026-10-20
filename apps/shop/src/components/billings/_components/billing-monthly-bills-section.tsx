"use client"

import { ChevronRight, Info } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"
import type { MonthlyBill, MonthlyBillStatusFilter } from "@/lib/billing-data"
import {
  formatBillingAmount,
  MONTHLY_BILL_STATUS_LABELS,
  MONTHLY_BILL_STATUS_OPTIONS,
} from "@/lib/billing-data"

interface BillingMonthlyBillsSectionProps {
  bills: MonthlyBill[]
  statusFilter: MonthlyBillStatusFilter
  onStatusFilterChange: (value: MonthlyBillStatusFilter) => void
  onUpdateBillingInfo: () => void
}

function BillStatusBadge({ status }: { status: MonthlyBill["status"] }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
      <span
        className={cn(
          "size-2 rounded-full",
          status === "paid" && "bg-emerald-500",
          status === "upcoming" && "bg-amber-400",
          status === "unpaid" && "bg-red-500",
        )}
      />
      {MONTHLY_BILL_STATUS_LABELS[status]}
    </span>
  )
}

export function BillingMonthlyBillsSection({
  bills,
  statusFilter,
  onStatusFilterChange,
  onUpdateBillingInfo,
}: BillingMonthlyBillsSectionProps) {
  return (
    <Card className="mt-3">
      <CardContent className="pt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-foreground">月度账单</div>
          <Button
            variant="link"
            size="sm"
            className="h-7 gap-1 px-2.5 text-sm"
            onClick={onUpdateBillingInfo}
          >
            更新账单信息
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <Alert className="mb-4">
          <Info />
          <AlertTitle>注意：</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
              <li>
                月度账单生成时间为 <strong>次月第 3 天 UTC 时间上午 10:00。</strong>
              </li>
              <li>
                当前账单数据为<strong>非实时</strong>并以 <strong>延迟一天（T-1）</strong>。
              </li>
              <li>
                账单更新自 11 月起生效。10 月之前的未结余额已{" "}
                <strong>合并为 10 月账单下的一条记录</strong>。
              </li>
            </ul>
          </AlertDescription>
        </Alert>

        <Select
          value={statusFilter}
          onValueChange={(value) =>
            onStatusFilterChange(value as MonthlyBillStatusFilter)
          }
        >
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue>
              <span className="text-muted-foreground">状态：</span>
              {
                MONTHLY_BILL_STATUS_OPTIONS.find(
                  (option) => option.value === statusFilter,
                )?.label
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {MONTHLY_BILL_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="mt-2 overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-0">账单周期</TableHead>
                <TableHead>使用量总计</TableHead>
                <TableHead>已应用优惠券</TableHead>
                <TableHead>已应用余额</TableHead>
                <TableHead>税额</TableHead>
                <TableHead>总金额</TableHead>
                <TableHead>应付金额</TableHead>
                <TableHead>已付金额</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="pr-0">发票</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map((bill) => (
                <TableRow key={bill.id}>
                  <TableCell className="pl-0">{bill.periodLabel}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatBillingAmount(bill.totalUsage)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatBillingAmount(bill.appliedCoupons)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatBillingAmount(bill.appliedBalance)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatBillingAmount(bill.tax)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatBillingAmount(bill.totalAmount)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatBillingAmount(bill.amountDue)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatBillingAmount(bill.amountPaid)}
                  </TableCell>
                  <TableCell>
                    <BillStatusBadge status={bill.status} />
                  </TableCell>
                  <TableCell className="pr-0 text-muted-foreground">
                    {bill.invoice ?? "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
