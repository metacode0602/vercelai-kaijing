"use client"

import {
  formatMetalCNY,
  type MetalBillingMethod,
} from "@/lib/metal-market-data"
import { Button } from "@workspace/ui/components/button"
import { LocaleLink } from "@/lib/i18n/navigation"
import { Separator } from "@workspace/ui/components/separator"

interface MetalDeployActionBarProps {
  region: string
  gpuLabel: string
  networkModeLabel: string
  deviceCount: number
  rentalDuration: number
  rentalDurationLabel: string
  priceAmount: number
  priceUnit: string
  totalAmount: number
  voucherDeduction?: number
  payableAmount: number
  balance: number
  availabilityError?: string
  canSubmit: boolean
  submitting?: boolean
  onCancel: () => void
  onSubmit: () => void
}

export function MetalDeployActionBar({
  region,
  gpuLabel,
  networkModeLabel,
  deviceCount,
  rentalDuration,
  rentalDurationLabel,
  priceAmount,
  priceUnit,
  totalAmount,
  voucherDeduction = 0,
  payableAmount,
  balance,
  availabilityError,
  canSubmit,
  submitting,
  onCancel,
  onSubmit,
}: MetalDeployActionBarProps) {
  const insufficientBalance = payableAmount > 0 && balance < payableAmount
  const submitDisabled = !canSubmit || insufficientBalance || Boolean(availabilityError)

  return (
    <section className="shrink-0 border-t border-border bg-background/95 shadow-[0_-4px_24px_-12px_rgba(0,0,0,0.12)] backdrop-blur-sm">
      <div className="container mx-auto px-4 py-3 lg:px-8">
        <div className="mb-3 min-w-0 overflow-x-auto">
          <div className="flex min-w-max gap-5 text-sm">
            <SpecColumn label="地区" value={region} />
            <SpecColumn label="卡型" value={gpuLabel} />
            <SpecColumn label="组网" value={networkModeLabel} />
            <SpecColumn label="设备" value={`${deviceCount} 台`} />
            <SpecColumn
              label="租用"
              value={`${rentalDuration} ${rentalDurationLabel}`}
            />
          </div>
        </div>

        <Separator className="mb-3" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-sm">
            <p className="text-xs text-muted-foreground">
              {formatMetalCNY(priceAmount)}/{priceUnit} × {deviceCount} 台 ×{" "}
              {rentalDuration} {rentalDurationLabel}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">应付:</span>
              {voucherDeduction > 0 ? (
                <>
                  <span className="text-muted-foreground line-through">
                    {formatMetalCNY(totalAmount)}
                  </span>
                  <span className="text-lg font-bold text-primary">
                    {formatMetalCNY(payableAmount)}
                  </span>
                </>
              ) : (
                <span className="text-lg font-bold">{formatMetalCNY(totalAmount)}</span>
              )}
            </div>
            {availabilityError && (
              <p className="text-xs text-destructive">{availabilityError}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">余额 {formatMetalCNY(balance)}</span>
              {insufficientBalance && (
                <LocaleLink
                  href="/billing"
                  className="text-destructive hover:underline"
                >
                  余额不足，去充值
                </LocaleLink>
              )}
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              取消
            </Button>
            <Button
              type="button"
              disabled={submitDisabled || submitting}
              onClick={onSubmit}
              className="min-w-[108px]"
            >
              {insufficientBalance
                ? "余额不足"
                : availabilityError
                  ? "时长超限"
                  : submitting
                    ? "提交中..."
                    : "确认租用"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

function SpecColumn({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="min-w-[64px]">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-medium leading-snug">{value}</div>
    </div>
  )
}
