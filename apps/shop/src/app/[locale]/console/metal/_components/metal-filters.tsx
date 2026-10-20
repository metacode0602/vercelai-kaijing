"use client"

import { cn } from "@/lib/utils"
import {
  METAL_BILLING_OPTIONS,
  METAL_GPU_MODEL_OPTIONS,
  METAL_REGION_OPTIONS,
  NETWORK_MODE_OPTIONS,
  type MetalBillingMethod,
  type NetworkMode,
} from "@/lib/metal-market-data"
import { Card } from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"
import {
  filterOptionActive,
  filterOptionInactive,
} from "../../server/_components/theme-styles"

interface MetalFiltersProps {
  billing: MetalBillingMethod
  region: string
  gpuModel: string
  networkMode: NetworkMode | "全部"
  onBillingChange: (billing: MetalBillingMethod) => void
  onRegionChange: (region: string) => void
  onGpuModelChange: (model: string) => void
  onNetworkModeChange: (mode: NetworkMode | "全部") => void
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

export function MetalFilters({
  billing,
  region,
  gpuModel,
  networkMode,
  onBillingChange,
  onRegionChange,
  onGpuModelChange,
  onNetworkModeChange,
}: MetalFiltersProps) {
  return (
    <Card className="mb-6 gap-0 rounded-2xl p-4 ring-border/80">
      <FilterRow label="计费方式" className="border-b border-dashed border-border pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {METAL_BILLING_OPTIONS.map((option) => (
            <FilterOption
              key={option.id}
              active={billing === option.id}
              onClick={() => onBillingChange(option.id)}
            >
              {option.label}
            </FilterOption>
          ))}
        </div>
      </FilterRow>

      <FilterRow label="选择地区" className="border-b border-dashed border-border py-4">
        {METAL_REGION_OPTIONS.map((item) => (
          <FilterOption
            key={item}
            active={region === item}
            onClick={() => onRegionChange(item)}
          >
            {item}
          </FilterOption>
        ))}
      </FilterRow>

      <FilterRow label="卡型" className="border-b border-dashed border-border py-4">
        {METAL_GPU_MODEL_OPTIONS.map((item) => (
          <FilterOption
            key={item}
            active={gpuModel === item}
            onClick={() => onGpuModelChange(item)}
          >
            {item}
          </FilterOption>
        ))}
      </FilterRow>

      <FilterRow label="组网方式" className="pt-4">
        {NETWORK_MODE_OPTIONS.map((option) => (
          <FilterOption
            key={option.id}
            active={networkMode === option.id}
            onClick={() => onNetworkModeChange(option.id)}
          >
            {option.label}
          </FilterOption>
        ))}
      </FilterRow>
    </Card>
  )
}
