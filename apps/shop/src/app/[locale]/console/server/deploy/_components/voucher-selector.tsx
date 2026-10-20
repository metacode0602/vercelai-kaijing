"use client"

import { Ticket } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  COMPUTE_VOUCHERS,
  formatVoucherValue,
  isComputeVoucherApplicable,
  type ComputeVoucher,
  type DeployBillingMethod,
} from "@/lib/server-market-data"
import { Badge } from "@workspace/ui/components/badge"
import { Label } from "@workspace/ui/components/label"
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"

interface VoucherSelectorProps {
  billing: DeployBillingMethod
  priceAmount: number
  value: string | null
  onChange: (voucherId: string | null) => void
}

export function VoucherSelector({
  billing,
  priceAmount,
  value,
  onChange,
}: VoucherSelectorProps) {
  if (billing === "voucher") {
    return (
      <p className="text-xs text-muted-foreground">
        当前为兑换券计费，无需额外选择算力券。
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
      <Label className="w-24 shrink-0 pt-1 text-sm font-bold">算力券:</Label>
      <RadioGroup
        value={value ?? "none"}
        onValueChange={(next) => onChange(next === "none" ? null : next)}
        className="flex-1 gap-2"
      >
        <VoucherOption
          id="none"
          selected={value == null}
          title="不使用算力券"
          description="按原价计费"
        />

        {COMPUTE_VOUCHERS.map((voucher) => {
          const applicable = isComputeVoucherApplicable(
            voucher,
            billing,
            priceAmount,
          )

          return (
            <VoucherOption
              key={voucher.id}
              id={voucher.id}
              selected={value === voucher.id}
              disabled={!applicable}
              title={voucher.name}
              description={getVoucherDescription(voucher, applicable, priceAmount)}
              tag={voucher.tag}
              valueLabel={formatVoucherValue(voucher)}
            />
          )
        })}
      </RadioGroup>
    </div>
  )
}

function getVoucherDescription(
  voucher: ComputeVoucher,
  applicable: boolean,
  priceAmount: number,
) {
  if (!applicable) {
    if (voucher.minSpend != null && priceAmount < voucher.minSpend) {
      return `需满 ${voucher.minSpend} 元可用`
    }
    if (voucher.applicableBilling?.length) {
      return "当前计费方式不可用"
    }
    return "不可用"
  }

  const expiry = voucher.expiresAt.replace(/-/g, ".")
  return `有效期至 ${expiry}`
}

function VoucherOption({
  id,
  selected,
  disabled,
  title,
  description,
  tag,
  valueLabel,
}: {
  id: string
  selected: boolean
  disabled?: boolean
  title: string
  description: string
  tag?: string
  valueLabel?: string
}) {
  return (
    <label
      htmlFor={`voucher-${id}`}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border bg-card px-3 py-2.5 transition-colors",
        disabled && "cursor-not-allowed opacity-50",
        selected
          ? "border-primary/50 ring-2 ring-primary/20"
          : "border-border/80 hover:border-primary/40",
      )}
    >
      <RadioGroupItem
        id={`voucher-${id}`}
        value={id}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{title}</span>
            {tag && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {tag}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {valueLabel && (
          <div className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
            <Ticket className="size-3.5" />
            {valueLabel}
          </div>
        )}
      </div>
    </label>
  )
}
