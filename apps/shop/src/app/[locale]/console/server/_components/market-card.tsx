"use client"

import { Cpu, MapPin } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { cardHover } from "./theme-styles"
import {
  formatCNY,
  getBillingHighlightLabel,
  type BillingMethod,
  type MarketOffering,
} from "@/lib/server-market-data"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Separator } from "@workspace/ui/components/separator"

interface MarketCardProps {
  offering: MarketOffering
  billing: BillingMethod
  viewMode: "grid" | "list"
  onCreate: (offering: MarketOffering) => void
}

function GpuVisual() {
  return (
    <div className="flex aspect-square size-14 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/80">
      {/* <Image src="/icon.svg" alt="GPU" width={32} height={32} className="object-contain" /> */}
      <Cpu className="size-8 text-primary" />
    </div>
  )
}

function SpecGrid({ offering }: { offering: MarketOffering }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[10px] tracking-wide text-muted-foreground/70">
          {offering.gpuCount} x GPU 分配
        </span>
        <Separator className="flex-1 border-dashed" />
      </div>
      <div className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
        <div className="flex items-center gap-1">
          <span className="shrink-0 text-muted-foreground">vCPU</span>
          <span className="whitespace-nowrap font-semibold leading-none">
            {offering.vcpu} 核心
          </span>
        </div>
        <div className="flex items-center justify-end gap-1">
          <span className="shrink-0 text-muted-foreground">内存</span>
          <span className="whitespace-nowrap font-semibold leading-none">
            {offering.memoryGb} GB
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="shrink-0 text-muted-foreground">系统盘</span>
          <span className="whitespace-nowrap font-semibold leading-none">
            {offering.systemDiskGb} GB
          </span>
        </div>
        <div className="flex min-w-0 items-center">
          <div className="ml-auto flex min-w-0 max-w-full items-center gap-1">
            <span className="shrink-0 text-muted-foreground">数据盘</span>
            <span className="min-w-0 truncate font-semibold leading-none">
              <span>{offering.dataDiskGb} GB</span>
              {offering.expandableDiskGb != null && (
                <span className="text-[10px] text-muted-foreground">
                  {" "}
                  · 可扩容 {offering.expandableDiskGb} GB
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function PricingFooter({
  offering,
  billing,
  onCreate,
  compact,
}: {
  offering: MarketOffering
  billing: BillingMethod
  onCreate: () => void
  compact?: boolean
}) {
  const billingLabel = getBillingHighlightLabel(billing)

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-dashed border-border pt-2",
        compact && "mt-auto",
      )}
    >
      <div className="grid flex-1 grid-cols-3 gap-2 text-center text-xs">
        <div>
          <div className="scale-90 text-muted-foreground">包日</div>
          <div className="font-bold">{formatCNY(offering.pricing.daily)}</div>
        </div>
        <div className="border-l border-border">
          <div className="scale-90 text-muted-foreground">包周</div>
          <div className="font-bold">{formatCNY(offering.pricing.weekly)}</div>
        </div>
        <div className="border-l border-border">
          <div className="scale-90 text-muted-foreground">包月</div>
          <div className="font-bold">{formatCNY(offering.pricing.monthly)}</div>
        </div>
      </div>

      <div className="flex flex-col items-center">
        <span className="text-xs font-bold text-primary">
          {billingLabel}
        </span>
        <div className="flex items-baseline gap-0.5">
          <span className="text-2xl font-black text-primary">
            {formatCNY(offering.pricing.hourly)}
          </span>
          <span className="text-xs text-muted-foreground">/时</span>
        </div>
      </div>

      <div className="flex justify-end">
        {offering.inStock ? (
          <Button
            type="button"
            onClick={onCreate}
            className="flex size-12 flex-col gap-0.5 rounded-xl p-0 text-xs font-bold leading-none"
          >
            <span>立即</span>
            <span>创建</span>
          </Button>
        ) : (
          <Button
            type="button"
            disabled
            variant="outline"
            className="flex size-12 cursor-not-allowed flex-col gap-0.5 rounded-xl p-0 text-xs font-bold leading-none"
          >
            <span>库存</span>
            <span>不足</span>
          </Button>
        )}
      </div>
    </div>
  )
}

export function MarketCard({ offering, billing, viewMode, onCreate }: MarketCardProps) {
  if (viewMode === "list") {
    return (
      <Card className={cn("gap-3 rounded-2xl p-3 ring-border/80", cardHover)}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <GpuVisual />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold leading-tight">{offering.displayName}</h3>
                <Badge variant="outline" className="gap-1 font-medium">
                  <MapPin className="size-3 text-primary" />
                  {offering.region}
                </Badge>
                {!offering.inStock && (
                  <Badge variant="secondary" className="text-xs">
                    库存不足
                  </Badge>
                )}
              </div>
              <div className="mt-2 max-w-xl">
                <SpecGrid offering={offering} />
              </div>
            </div>
          </div>
          <div className="w-full shrink-0 lg:w-[420px]">
            <PricingFooter
              offering={offering}
              billing={billing}
              onCreate={() => onCreate(offering)}
            />
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className={cn("gap-2 rounded-2xl p-3 ring-border/80", cardHover)}>
      <div className="flex items-center gap-3">
        <GpuVisual />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h3 className="text-lg font-semibold leading-tight">{offering.displayName}</h3>
          <Badge variant="outline" className="w-fit gap-1 font-medium">
            <MapPin className="size-3 text-primary" />
            {offering.region}
          </Badge>
        </div>
      </div>

      <div className="mt-1">
        <SpecGrid offering={offering} />
      </div>

      <PricingFooter
        offering={offering}
        billing={billing}
        onCreate={() => onCreate(offering)}
        compact
      />
    </Card>
  )
}
