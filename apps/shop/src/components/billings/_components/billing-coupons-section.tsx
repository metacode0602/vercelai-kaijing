"use client"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
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
import { Card, CardContent } from "@workspace/ui/components/card"
import type { BillingCoupon, CouponStatusFilter } from "@/lib/billing-data"
import {
  COUPON_STATUS_LABELS,
  COUPON_STATUS_OPTIONS,
  formatBillingAmount,
} from "@/lib/billing-data"

interface BillingCouponsSectionProps {
  coupons: BillingCoupon[]
  statusFilter: CouponStatusFilter
  onStatusFilterChange: (value: CouponStatusFilter) => void
}

export function BillingCouponsSection({
  coupons,
  statusFilter,
  onStatusFilterChange,
}: BillingCouponsSectionProps) {
  return (
    <Card className="mt-3">
      <CardContent>
        <div className="mb-3 text-sm font-medium text-foreground">优惠券详情</div>

        <Select
          value={statusFilter}
          onValueChange={(value) => onStatusFilterChange(value as CouponStatusFilter)}
        >
          <SelectTrigger className="mb-3 h-9 w-[200px]">
            <SelectValue>
              <span className="text-muted-foreground">状态：</span>
              {COUPON_STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {COUPON_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="pl-3">优惠券</TableHead>
                <TableHead>生效日期</TableHead>
                <TableHead>到期日期</TableHead>
                <TableHead>余额 / 总额</TableHead>
                <TableHead>适用产品</TableHead>
                <TableHead className="pr-3">状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.map((coupon) => (
                <TableRow key={coupon.id}>
                  <TableCell className="pl-3">{coupon.name}</TableCell>
                  <TableCell>{coupon.effectiveDate}</TableCell>
                  <TableCell>{coupon.expiryDate}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatBillingAmount(coupon.balance)} / {formatBillingAmount(coupon.total)}
                  </TableCell>
                  <TableCell>{coupon.products}</TableCell>
                  <TableCell className="pr-3">
                    {COUPON_STATUS_LABELS[coupon.status]}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {coupons.length === 0 && (
            <Empty className="min-h-[200px] border-0 border-t rounded-none">
              <EmptyHeader>
                <EmptyTitle>No Data</EmptyTitle>
                <EmptyDescription>暂无数据</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
