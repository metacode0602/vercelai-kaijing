"use client"

import type { SandboxUsagePageData } from "@/lib/sandbox-usage/types"
import { ComputeUsageCharts } from "./_components/compute-usage-charts"
import { CostUsageChart } from "./_components/cost-usage-chart"
import { StorageUsageChart } from "./_components/storage-usage-chart"
import { UsageKpiCards } from "./_components/usage-kpi-cards"

interface UsagePageClientProps {
  initialData: SandboxUsagePageData
}

export function UsagePageClient({ initialData }: UsagePageClientProps) {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-6">
      <div className="flex flex-col gap-4">
        <UsageKpiCards initialKpi={initialData.kpi} />

        <ComputeUsageCharts
          timeSeries={initialData.timeSeries}
          templates={initialData.templates}
          kpi={initialData.kpi}
        />

        <StorageUsageChart
          timeSeries={initialData.timeSeries}
          storageFreeQuotaGb={initialData.kpi.storageFreeQuotaGb}
          storageUsedGb={initialData.kpi.storageUsedGb}
        />

        <CostUsageChart
          timeSeries={initialData.timeSeries}
          templates={initialData.templates}
          kpi={initialData.kpi}
        />
      </div>
    </div>
  )
}
