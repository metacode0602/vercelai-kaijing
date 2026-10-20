"use client"

import { useMemo } from "react"
import { Ticket } from "lucide-react"
import {
  COMPUTE_VOUCHERS,
  formatVoucherValue,
  isComputeVoucherApplicable,
  type ComputeVoucher,
  type DeployBillingMethod,
} from "@/lib/server-market-data"
import { cn } from "@/lib/utils"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

interface MetalVoucherSelectProps {
  billing: DeployBillingMethod
  priceAmount: number
  value: string | null
  onChange: (voucherId: string | null) => void
  className?: string
}

function getVoucherHint(
  voucher: ComputeVoucher,
  applicable: boolean,
  priceAmount: number,
) {
  if (!applicable) {
    if (voucher.minSpend != null && priceAmount < voucher.minSpend) {
      return `满 ${voucher.minSpend} 元可用`
    }
    return "当前计费方式或金额不可用"
  }
  return `有效期至 ${voucher.expiresAt.replace(/-/g, ".")}`
}

function getVoucherTriggerLabel(voucher: ComputeVoucher) {
  return `${voucher.name}（${formatVoucherValue(voucher)}）`
}

export function MetalVoucherSelect({
  billing,
  priceAmount,
  value,
  onChange,
  className,
}: MetalVoucherSelectProps) {
  const selectedVoucher = COMPUTE_VOUCHERS.find((voucher) => voucher.id === value)

  const triggerLabel = useMemo(() => {
    if (!selectedVoucher) return "不使用算力券"
    return getVoucherTriggerLabel(selectedVoucher)
  }, [selectedVoucher])

  return (
    <div className={className}>
      <Label className="mb-2 block text-sm font-bold">算力券</Label>
      <Select
        value={value ?? "none"}
        onValueChange={(next) => onChange(next === "none" ? null : next)}
      >
        <SelectTrigger
          className="h-10 w-full max-w-full bg-background px-3"
          size="default"
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Ticket className="size-4 shrink-0 text-muted-foreground" />
            <SelectValue asChild>
              <span className="truncate text-left font-normal">{triggerLabel}</span>
            </SelectValue>
          </span>
        </SelectTrigger>
        <SelectContent className="min-w-[var(--radix-select-trigger-width)]">
          <SelectItem value="none" textValue="不使用算力券">
            <span className="text-muted-foreground">不使用算力券</span>
          </SelectItem>
          {COMPUTE_VOUCHERS.map((voucher) => {
            const applicable = isComputeVoucherApplicable(
              voucher,
              billing,
              priceAmount,
            )
            const hint = getVoucherHint(voucher, applicable, priceAmount)

            return (
              <SelectItem
                key={voucher.id}
                value={voucher.id}
                disabled={!applicable}
                textValue={getVoucherTriggerLabel(voucher)}
                className="items-start py-2.5"
              >
                <div className="flex min-w-0 flex-col gap-1 pr-6">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium leading-snug">{voucher.name}</span>
                    <span className="shrink-0 text-sm font-semibold text-primary">
                      {formatVoucherValue(voucher)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {voucher.tag && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {voucher.tag}
                      </span>
                    )}
                    <span
                      className={cn(
                        "text-xs",
                        applicable ? "text-muted-foreground" : "text-destructive/80",
                      )}
                    >
                      {hint}
                    </span>
                  </div>
                </div>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </div>
  )
}
