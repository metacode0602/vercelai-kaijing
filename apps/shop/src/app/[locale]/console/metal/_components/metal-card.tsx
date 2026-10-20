"use client"

import { Clock, MapPin, Network, Server } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import {
  formatMetalCNY,
  formatMetalAvailability,
  getMetalBillingHighlightLabel,
  NETWORK_MODE_LABELS,
  type AggregatedMetalOffering,
  type MetalBillingMethod,
  type MetalOfferingVariant,
} from "@/lib/metal-market-data"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Separator } from "@workspace/ui/components/separator"
import { cardHover } from "../../server/_components/theme-styles"

interface MetalCardProps {
  offering: AggregatedMetalOffering
  billing: MetalBillingMethod
  viewMode: "grid" | "list"
  onCreate: (offering: AggregatedMetalOffering, deviceId: string) => void
}

function GpuVisual() {
  return (
    <div className="flex aspect-square size-14 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/80">
      {/* <Image src="/icon.svg" alt="GPU" width={32} height={32} className="object-contain" /> */}
      <Server className="size-8 text-primary" />
    </div>
  )
}

function VariantSpecGrid({
  variant,
  maxCuda,
  driverVersion,
}: {
  variant: MetalOfferingVariant
  maxCuda: string
  driverVersion: string
}) {
  return (
    <div className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
      <div className="flex items-center gap-1">
        <span className="shrink-0 text-muted-foreground">vCPU</span>
        <span className="font-semibold leading-none">{variant.vcpu} 核心</span>
      </div>
      <div className="flex items-center justify-end gap-1">
        <span className="shrink-0 text-muted-foreground">内存</span>
        <span className="font-semibold leading-none">{variant.memoryGb} GB</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="shrink-0 text-muted-foreground">系统盘</span>
        <span className="font-semibold leading-none">{variant.systemDiskGb} GB</span>
      </div>
      <div className="flex items-center justify-end gap-1">
        <span className="shrink-0 text-muted-foreground">数据盘</span>
        <span className="font-semibold leading-none">{variant.dataDiskGb} GB</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="shrink-0 text-muted-foreground">CUDA</span>
        <span className="font-semibold leading-none">Max {maxCuda}</span>
      </div>
      <div className="flex items-center justify-end gap-1">
        <span className="shrink-0 text-muted-foreground">驱动</span>
        <span className="font-semibold leading-none">{driverVersion}</span>
      </div>
    </div>
  )
}

function VariantRow({
  variant,
  offering,
  billing,
  onRent,
  compact,
}: {
  variant: MetalOfferingVariant
  offering: AggregatedMetalOffering
  billing: MetalBillingMethod
  onRent: () => void
  compact?: boolean
}) {
  const unitPrice =
    billing === "daily"
      ? variant.pricing.daily
      : billing === "weekly"
        ? variant.pricing.weekly
        : billing === "monthly"
          ? variant.pricing.monthly
          : variant.pricing.hourly

  const priceUnit =
    billing === "daily"
      ? "天"
      : billing === "weekly"
        ? "周"
        : billing === "monthly"
          ? "月"
          : "时"

  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border/80 p-2.5",
        compact && "p-2",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{variant.gpuCount} x GPU 整机</span>
          <Badge variant="secondary" className="text-[10px]">
            {variant.stock} 台
          </Badge>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="size-3" />
          {formatMetalAvailability(variant.availableUntil, variant.availableHours)}
        </div>
      </div>

      <VariantSpecGrid
        variant={variant}
        maxCuda={offering.maxCuda}
        driverVersion={offering.driverVersion}
      />

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-dashed border-border pt-2">
        <span className="text-xs font-bold text-primary">
          {formatMetalCNY(unitPrice)}/{priceUnit}
        </span>
        {variant.stock > 0 ? (
          <Button
            type="button"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={onRent}
          >
            立即租用
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled className="h-7 px-3 text-xs">
            库存不足
          </Button>
        )}
      </div>
    </div>
  )
}

function PricingFooter({
  offering,
  billing,
  inline,
}: {
  offering: AggregatedMetalOffering
  billing: MetalBillingMethod
  inline?: boolean
}) {
  const billingLabel = getMetalBillingHighlightLabel(billing)

  return (
    <div
      className={cn(
        "flex items-center gap-3",
        !inline && "border-t border-dashed border-border pt-2",
      )}
    >
      <div className="grid flex-1 grid-cols-3 gap-2 text-center text-xs">
        <div>
          <div className="scale-90 text-muted-foreground">包天</div>
          <div className="font-bold">{formatMetalCNY(offering.pricing.daily)}</div>
        </div>
        <div className="border-l border-border">
          <div className="scale-90 text-muted-foreground">包周</div>
          <div className="font-bold">{formatMetalCNY(offering.pricing.weekly)}</div>
        </div>
        <div className="border-l border-border">
          <div className="scale-90 text-muted-foreground">包月</div>
          <div className="font-bold">{formatMetalCNY(offering.pricing.monthly)}</div>
        </div>
      </div>

      <div className="flex flex-col items-center">
        <span className="text-xs font-bold text-primary">{billingLabel}</span>
        <div className="flex items-baseline gap-0.5">
          <span className="text-2xl font-black text-primary">
            {formatMetalCNY(offering.pricing.hourly)}
          </span>
          <span className="text-xs text-muted-foreground">/时</span>
        </div>
        <span className="text-[10px] text-muted-foreground">起</span>
      </div>
    </div>
  )
}

export function MetalCard({
  offering,
  billing,
  viewMode,
  onCreate,
}: MetalCardProps) {
  const networkLabel = NETWORK_MODE_LABELS[offering.networkMode]

  const header = (
    <div className="flex items-center gap-3">
      <GpuVisual />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="text-lg font-semibold leading-tight">{offering.displayName}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="gap-1 font-medium">
            <MapPin className="size-3 text-primary" />
            {offering.region}
          </Badge>
          <Badge variant="outline" className="gap-1 font-medium">
            <Network className="size-3 text-primary" />
            {networkLabel}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            共 {offering.totalStock} 台
          </Badge>
          {!offering.inStock && (
            <Badge variant="secondary" className="text-xs">库存不足</Badge>
          )}
        </div>
      </div>
    </div>
  )

  const variants = (
    <div className="flex flex-col gap-2">
      {offering.variants.map((variant) => (
        <VariantRow
          key={variant.deviceId}
          variant={variant}
          offering={offering}
          billing={billing}
          onRent={() => onCreate(offering, variant.deviceId)}
          compact={viewMode === "grid"}
        />
      ))}
    </div>
  )

  if (viewMode === "list") {
    return (
      <Card className={cn("gap-3 rounded-2xl p-3 ring-border/80", cardHover)}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">{header}</div>
          <div className="w-full shrink-0 border-t border-dashed border-border pt-3 lg:w-auto lg:min-w-[260px] lg:border-t-0 lg:border-l lg:pl-4 lg:pt-0">
            <PricingFooter offering={offering} billing={billing} inline />
          </div>
        </div>
        <Separator className="border-dashed" />
        {variants}
      </Card>
    )
  }

  return (
    <Card className={cn("gap-2 rounded-2xl p-3 ring-border/80", cardHover)}>
      {header}
      <Separator className="border-dashed" />
      {variants}
      <PricingFooter offering={offering} billing={billing} />
    </Card>
  )
}
