"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import type { RechargeFilters } from "@/lib/recharge-shared"
import {
  RECHARGE_PAYMENT_METHOD_OPTIONS,
  RECHARGE_STATUS_OPTIONS,
  RECHARGE_TRANSACTION_TYPE_OPTIONS,
} from "@/lib/recharge-shared"
import { RechargeDateRangePicker } from "./recharge-date-range-picker"

interface RechargeFiltersBarProps {
  filters: RechargeFilters
  onDateRangeChange: (range: {
    startDate: Date | null
    endDate: Date | null
  }) => void
  onTransactionTypeChange: (value: RechargeFilters["transactionType"]) => void
  onPaymentMethodChange: (value: RechargeFilters["paymentMethod"]) => void
  onStatusChange: (value: RechargeFilters["status"]) => void
}

export function RechargeFiltersBar({
  filters,
  onDateRangeChange,
  onTransactionTypeChange,
  onPaymentMethodChange,
  onStatusChange,
}: RechargeFiltersBarProps) {
  return (
    <div className="mb-7 flex flex-row flex-wrap items-end gap-x-2.5 gap-y-3">
      <div>
        <p className="mb-1.5 text-sm text-muted-foreground">时间范围</p>
        <RechargeDateRangePicker
          startDate={filters.startDate}
          endDate={filters.endDate}
          onChange={onDateRangeChange}
        />
      </div>

      <Select
        value={filters.transactionType}
        onValueChange={onTransactionTypeChange}
      >
        <SelectTrigger className="h-9 w-[257px]">
          <SelectValue>
            <span className="text-muted-foreground">交易类型：</span>
            {
              RECHARGE_TRANSACTION_TYPE_OPTIONS.find(
                (option) => option.value === filters.transactionType,
              )?.label
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {RECHARGE_TRANSACTION_TYPE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.paymentMethod}
        onValueChange={onPaymentMethodChange}
      >
        <SelectTrigger className="h-9 w-[257px]">
          <SelectValue>
            <span className="text-muted-foreground">支付方式：</span>
            {
              RECHARGE_PAYMENT_METHOD_OPTIONS.find(
                (option) => option.value === filters.paymentMethod,
              )?.label
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {RECHARGE_PAYMENT_METHOD_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.status} onValueChange={onStatusChange}>
        <SelectTrigger className="h-9 w-[257px]">
          <SelectValue>
            <span className="text-muted-foreground">状态：</span>
            {
              RECHARGE_STATUS_OPTIONS.find(
                (option) => option.value === filters.status,
              )?.label
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {RECHARGE_STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
