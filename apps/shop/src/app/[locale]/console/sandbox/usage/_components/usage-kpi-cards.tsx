"use client"

import { useState } from "react"
import { cn } from "@workspace/ui/lib/utils"
import {
  formatUsageCurrency,
  formatUsageHours,
  formatUsageStorageGb,
} from "@/lib/sandbox-usage/data"
import type { SandboxUsageKpi } from "@/lib/sandbox-usage/types"

interface UsageKpiCardsProps {
  initialKpi: SandboxUsageKpi
}

interface KpiCardProps {
  title: string
  value: string
  subtitle?: string
  titleExtra?: string
  className?: string
}

function KpiCard({ title, value, subtitle, titleExtra, className }: KpiCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-y-1 rounded-xl border border-border bg-card p-4",
        className,
      )}
    >
      <div className="flex flex-row items-center gap-1">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {titleExtra ? (
          <div className="text-xs leading-[14px] text-muted-foreground">
            {titleExtra}
          </div>
        ) : null}
      </div>
      <div className="flex items-end gap-1">
        <span className="text-2xl font-semibold text-foreground">{value}</span>
        {subtitle ? (
          <span className="text-sm text-muted-foreground">{subtitle}</span>
        ) : null}
      </div>
    </div>
  )
}

export function UsageKpiCards({ initialKpi }: UsageKpiCardsProps) {
  const [kpi] = useState(initialKpi)

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <KpiCard
        title="vCPU 小时"
        value={formatUsageHours(kpi.vcpuHoursToday)}
        subtitle="今日小时数"
      />
      <KpiCard
        title="RAM 小时"
        value={formatUsageHours(kpi.ramHoursToday)}
        subtitle="今日 GB-小时"
      />
      <KpiCard
        title="存储容量"
        titleExtra={`，${formatUsageStorageGb(kpi.storageFreeQuotaGb)}GB 免费额度`}
        value={formatUsageStorageGb(kpi.storageUsedGb)}
        subtitle="当前已使用 GB"
      />
      <KpiCard
        title="运行中的沙盒"
        value={String(kpi.runningSandboxes)}
      />
      <KpiCard
        title="使用费用"
        value={formatUsageCurrency(kpi.costTodayUsd)}
        subtitle="今天"
      />
    </div>
  )
}
