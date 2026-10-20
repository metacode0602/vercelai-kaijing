"use client"

import { cn } from "@/lib/utils"
import {
  filterOptionActive,
  filterOptionInactive,
} from "./theme-styles"
import {
  BILLING_OPTIONS,
  GPU_COUNT_OPTIONS,
  GPU_MODEL_OPTIONS,
  REGION_OPTIONS,
  type BillingMethod,
} from "@/lib/server-market-data"
import { Card } from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"
interface MarketFiltersProps {
  billing: BillingMethod
  region: string
  gpuModel: string
  gpuCount: number
  onBillingChange: (billing: BillingMethod) => void
  onRegionChange: (region: string) => void
  onGpuModelChange: (model: string) => void
  onGpuCountChange: (count: number) => void
}

function FilterOption({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
        active ? filterOptionActive : filterOptionInactive,
        className,
      )}
    >
      {children}
    </button>
  )
}

function FilterRow({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-0",
        className,
      )}
    >
      <Label className="w-24 shrink-0 pt-1.5 text-sm font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="flex flex-1 flex-wrap gap-2">{children}</div>
    </div>
  )
}

export function MarketFilters({
  billing,
  region,
  gpuModel,
  gpuCount,
  onBillingChange,
  onRegionChange,
  onGpuModelChange,
  onGpuCountChange,
}: MarketFiltersProps) {
  return (
    <Card className="mb-6 gap-0 rounded-2xl p-4 ring-border/80">
      <FilterRow label="计费方式" className="border-b border-dashed border-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {BILLING_OPTIONS.map((option) => (
            <FilterOption
              key={option.id}
              active={billing === option.id}
              onClick={() => onBillingChange(option.id)}
              className={option.id === "night" ? "border-dashed" : undefined}
            >
              {option.label}
            </FilterOption>
          ))}
        </div>
      </FilterRow>

      <FilterRow label="选择地区" className="border-b border-dashed border-border py-4">
        {REGION_OPTIONS.map((item) => (
          <FilterOption
            key={item}
            active={region === item}
            onClick={() => onRegionChange(item)}
          >
            {item}
          </FilterOption>
        ))}
      </FilterRow>

      <FilterRow label="GPU型号" className="border-b border-dashed border-border py-4">
        {GPU_MODEL_OPTIONS.map((item) => (
          <FilterOption
            key={item}
            active={gpuModel === item}
            onClick={() => onGpuModelChange(item)}
          >
            {item}
          </FilterOption>
        ))}
      </FilterRow>

      <FilterRow label="GPU数量" className="pt-4">
        {GPU_COUNT_OPTIONS.map((count) => (
          <button
            key={count}
            type="button"
            onClick={() => onGpuCountChange(count)}
            className={cn(
              "flex size-9 items-center justify-center rounded-lg border text-sm font-semibold transition-colors",
              gpuCount === count
                ? filterOptionActive
                : filterOptionInactive,
            )}
          >
            {count}
          </button>
        ))}
      </FilterRow>
    </Card>
  )
}
