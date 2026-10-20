"use client"

import { Button } from "@workspace/ui/components/button"
import { formatUSD } from "@/lib/gpu-data"
import { cn } from "@workspace/ui/lib/utils"

export interface SummaryRow {
  label: string
  value: string
}

export function DeploySummary({
  rows,
  pricePerHour,
  ctaLabel,
  onDeploy,
  disabled,
  loading,
  note,
  containerClassName,
}: {
  rows: SummaryRow[]
  pricePerHour: number
  ctaLabel: string
  onDeploy: () => void
  disabled?: boolean
  loading?: boolean
  note?: string
  /** 与页面主内容区对齐，默认 max-w-6xl */
  containerClassName?: string
}) {
  return (
    <section className="flex shrink-0 flex-col border-t border-border bg-background transition-[width,height] ease-linear">
      <div
        className={cn(
          "mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-6",
          containerClassName,
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="overflow-x-auto p-2">
            <div className="flex min-w-max gap-x-6 gap-y-3 text-sm">
              {rows.map((row) => (
                <BillingColumn key={row.label} label={row.label} value={row.value} />
              ))}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="text-right sm:text-left">
            <div className="text-xs text-muted-foreground">预计合计</div>
            <div className="flex items-baseline justify-end gap-1 sm:justify-start">
              <span className="text-xl font-semibold text-foreground">
                {formatUSD(pricePerHour)}
              </span>
              <span className="text-sm font-normal text-muted-foreground">/hr</span>
            </div>
            {note && (
              <p className="mt-1 max-w-xs text-xs text-muted-foreground text-pretty">
                {note}
              </p>
            )}
          </div>
          <Button
            className={cn("min-w-[120px]", loading && "opacity-80")}
            size="lg"
            onClick={onDeploy}
            disabled={disabled || loading}
          >
            {loading ? "部署中…" : ctaLabel}
          </Button>
        </div>
      </div>
    </section>
  )
}

function BillingColumn({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[88px] max-w-[200px]">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium leading-snug text-foreground">{value}</div>
    </div>
  )
}
