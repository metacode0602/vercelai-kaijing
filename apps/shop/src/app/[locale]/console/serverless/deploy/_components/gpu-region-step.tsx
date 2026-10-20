"use client"

import { HardDrive } from "lucide-react"
import { FormSection } from "@/components/form-section"
import { BillingMethodSelector } from "@/components/billing-method-selector"
import { GpuSelector } from "@/components/gpu-selector"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Badge } from "@workspace/ui/components/badge"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  BILLING_METHOD_OPTIONS,
  getGpuUnitPrice,
  GPUS,
  type Region,
} from "@/lib/gpu-data"
import { cn } from "@workspace/ui/lib/utils"
import type { GpuRegionValues } from "./types"

export interface LogicalRegionOption {
  id: string
  name: string
  complianceDomain?: string
}

export interface GpuRegionStepProps {
  values: GpuRegionValues
  onChange: <K extends keyof GpuRegionValues>(
    key: K,
    value: GpuRegionValues[K],
  ) => void
  /** Optional logical region allowlist choices (waverless M1). */
  logicalRegions?: LogicalRegionOption[]
  /** Legacy SkyPilot regions (optional advanced path). */
  skypilotRegions?: Region[]
  /** From `serverlessDeployOptions.gpuCountOptions` on deploy. */
  gpuCountOptions?: string[]
  variant?: "deploy" | "detail"
}

export function GpuRegionStep({
  values,
  onChange,
  logicalRegions = [],
  skypilotRegions = [],
  gpuCountOptions,
  variant = "deploy",
}: GpuRegionStepProps) {
  const countList =
    gpuCountOptions ?? (values.gpuCount ? [values.gpuCount] : [])
  const selectedBilling =
    BILLING_METHOD_OPTIONS.find((item) => item.id === values.commitment) ??
    BILLING_METHOD_OPTIONS[1]
  const selectedGpu = GPUS.find((gpu) => gpu.id === values.gpuId)
  const gpuBilling = values.commitment === "spot" ? "spot" : "on-demand"
  const gpuBillingLabel =
    values.commitment !== "on-demand" && values.commitment !== "spot"
      ? selectedBilling.name
      : undefined
  const gpuUnitPrice = selectedGpu
    ? getGpuUnitPrice(selectedGpu, values.commitment)
    : undefined
  const isPackageBilling =
    values.commitment === "daily" ||
    values.commitment === "weekly" ||
    values.commitment === "monthly"

  const allowlist = values.regionAllowlist ?? []
  const allRegionsSelected =
    logicalRegions.length > 0 &&
    allowlist.length === logicalRegions.length

  function toggleRegion(id: string, checked: boolean) {
    const next = checked
      ? [...new Set([...allowlist, id])]
      : allowlist.filter((r) => r !== id)
    onChange("regionAllowlist", next)
  }

  function toggleAllRegions(checked: boolean) {
    onChange(
      "regionAllowlist",
      checked ? logicalRegions.map((r) => r.id) : [],
    )
  }

  const body = (
    <>
      <BillingMethodSelector
        className="mb-4"
        value={values.commitment}
        onChange={(commitment) => onChange("commitment", commitment)}
      />

      {logicalRegions.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label>逻辑区域（可选）</Label>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => toggleAllRegions(!allRegionsSelected)}
            >
              {allRegionsSelected ? "清除限制" : "全选"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            不选择任何区域时，平台将在全部可用逻辑区内自动选址（placementMode=auto）。
          </p>
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            {logicalRegions.map((region) => {
              const checked = allowlist.includes(region.id)
              return (
                <label
                  key={region.id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => toggleRegion(region.id, v === true)}
                  />
                  <span className="flex-1">{region.name}</span>
                  {region.complianceDomain === "domestic" && (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      国内
                    </Badge>
                  )}
                </label>
              )
            })}
          </div>
        </div>
      )}

      {skypilotRegions.length > 0 && (
        <div className="mb-4 flex flex-col gap-1.5">
          <Label>SkyPilot 区域（可选）</Label>
          <Select
            value={values.skypilotRegion ?? ""}
            onValueChange={(v) =>
              onChange("skypilotRegion", v === "__none__" ? "" : v)
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="不使用 SkyPilot 路径" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">不使用 SkyPilot 路径</SelectItem>
              {skypilotRegions.map((region) => (
                <SelectItem key={region.id} value={region.id}>
                  <span className="flex w-full items-center justify-between gap-3">
                    <span>{region.name}</span>
                    <RegionStorageBadge supportsStorage={region.supportsStorage} />
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            仅在选择具体 SkyPilot 区域时使用旧版编排；默认走 Waverless 自动选址。
          </p>
        </div>
      )}

      <GpuSelector
        value={values.gpuId}
        onChange={(v) => onChange("gpuId", v)}
        billing={gpuBilling}
        billingLabel={gpuBillingLabel}
        priceOverride={isPackageBilling ? gpuUnitPrice : undefined}
      />

      <div className="mt-4 flex flex-col gap-1.5">
        <Label>卡数</Label>
        <div className="flex flex-wrap gap-2">
          {countList.map((count) => {
            const selected = values.gpuCount === count

            return (
              <button
                key={count}
                type="button"
                onClick={() => onChange("gpuCount", count)}
                className={cn(
                  "flex min-w-[56px] items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                  selected
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40",
                )}
              >
                {count}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )

  if (variant === "detail") return body

  return (
    <FormSection
      step={1}
      title="选择 GPU 与区域"
      description="卡型、卡数与计费方式；区域限制可选，默认全平台自动选址。"
    >
      {body}
    </FormSection>
  )
}

function RegionStorageBadge({ supportsStorage }: { supportsStorage: boolean }) {
  return (
    <Badge
      variant={supportsStorage ? "secondary" : "outline"}
      className={cn(
        "shrink-0 gap-1 px-1.5 text-[10px] font-normal",
        supportsStorage
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "text-muted-foreground",
      )}
    >
      <HardDrive className="size-2.5" />
      {supportsStorage ? "支持存储" : "不支持存储"}
    </Badge>
  )
}
