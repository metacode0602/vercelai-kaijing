"use client"

import { MapPin, Server } from "lucide-react"
import Image from "next/image"
import {
  formatCNY,
  getDeployBillingLabel,
  type DeployBillingMethod,
  type MarketOffering,
} from "@/lib/server-market-data"
import { Badge } from "@workspace/ui/components/badge"
import { Card } from "@workspace/ui/components/card"
import { Separator } from "@workspace/ui/components/separator"

interface InstanceSummaryCardProps {
  offering: MarketOffering
  billing: DeployBillingMethod
}

export function InstanceSummaryCard({ offering, billing }: InstanceSummaryCardProps) {
  const billingLabel = getDeployBillingLabel(billing)

  return (
    <Card className="gap-2.5 rounded-2xl px-3 py-2 ring-border/80 sm:gap-3 sm:px-3.5 sm:py-3 lg:flex-row lg:items-center lg:gap-3.5 lg:px-3.5 lg:py-3.5">
      <div className="flex items-center gap-4 lg:flex-1">
        <div className="flex w-auto shrink-0 items-center gap-2 lg:min-w-[80px] lg:items-stretch">
          <div className="flex aspect-square size-20 items-center justify-center rounded-lg border border-border bg-muted/80">
            {/* <Image src="/icon.svg" alt="GPU" width={48} height={48} className="object-contain" /> */}
            <Server className="size-8 text-primary" />
          </div>
        </div>

        <div className="flex h-full flex-1 flex-col gap-1.5 py-1 sm:min-h-[100px] sm:py-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="min-w-0 flex-1 truncate text-base font-semibold leading-tight sm:text-xl">
              {offering.displayName}
            </h3>
            <Badge variant="outline" className="shrink-0 gap-1 px-2.5 py-1 font-medium">
              <MapPin className="size-3.5 text-primary" />
              {offering.region}
            </Badge>
          </div>

          <div className="mt-0.5 sm:mt-1">
            <div className="mb-1.5 flex items-center gap-1.5 sm:mb-2">
              <span className="text-[10px] tracking-wide text-muted-foreground/70">
                {offering.gpuCount} x GPU 分配
              </span>
              <Separator className="flex-1 border-dashed" />
            </div>
            <div className="grid grid-cols-2 gap-0.5 text-[11px] sm:gap-1 sm:text-xs">
              <div className="flex items-center gap-0.5 sm:gap-1">
                <span className="shrink-0 text-muted-foreground">vCPU</span>
                <span className="whitespace-nowrap font-semibold leading-none">
                  {offering.vcpu} 核心
                </span>
              </div>
              <div className="flex items-center gap-0.5 sm:gap-1">
                <span className="shrink-0 text-muted-foreground">内存</span>
                <span className="whitespace-nowrap font-semibold leading-none">
                  {offering.memoryGb} GB
                </span>
              </div>
              <div className="flex items-center gap-0.5 sm:gap-1">
                <span className="shrink-0 text-muted-foreground">
                  系统盘 <span className="hidden lg:inline">（SSD）</span>
                </span>
                <span className="whitespace-nowrap font-semibold leading-none">
                  {offering.systemDiskGb} GB
                </span>
              </div>
              <div className="flex items-center gap-0.5 sm:gap-1">
                <span className="shrink-0 text-muted-foreground">
                  数据盘 <span className="hidden lg:inline">（SSD）</span>
                </span>
                <span className="flex flex-wrap items-center gap-0.5 font-semibold leading-none sm:gap-1">
                  <span className="whitespace-nowrap">{offering.dataDiskGb} GB</span>
                  {offering.expandableDiskGb != null && (
                    <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                      · 可扩容 {offering.expandableDiskGb} GB
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative w-full border-t border-dashed border-border pb-0.5 pt-2 lg:ml-4 lg:w-72 lg:border-l lg:border-t-0 lg:pb-0 lg:pl-5 lg:pt-0">
        <div className="flex items-center justify-between lg:hidden">
          <div className="flex items-baseline whitespace-nowrap">
            <span className="mr-1.5 text-xs font-bold text-primary">
              {billingLabel}
            </span>
            <span className="text-lg font-black leading-none text-primary">
              {formatCNY(offering.pricing.hourly)}
            </span>
            <span className="ml-1 text-[10px] text-muted-foreground">/时</span>
          </div>
        </div>

        <div className="hidden lg:flex lg:flex-row lg:items-center lg:gap-3">
          <div className="flex-1">
            <div className="mb-2 flex items-end justify-between border-b border-border/60 pb-2">
              <span className="text-xs font-bold text-primary">
                {billingLabel}
              </span>
              <div className="flex items-baseline justify-end gap-0.5">
                <span className="text-2xl font-black text-primary">
                  {formatCNY(offering.pricing.hourly)}
                </span>
                <span className="text-xs text-muted-foreground">/时</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
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
          </div>
        </div>
      </div>
    </Card>
  )
}
