"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import {
  formatUsageStorageGb,
  getDefaultUsageDateRange,
  getStorageUsageChartData,
} from "@/lib/sandbox-usage/data"
import type {
  SandboxUsagePageData,
  UsageHourDayGroupBy,
} from "@/lib/sandbox-usage/types"
import { UtcDateRangePicker } from "./utc-date-range-picker"
import { UsageLineChart } from "./usage-line-chart"

interface StorageUsageChartProps {
  timeSeries: SandboxUsagePageData["timeSeries"]
  storageFreeQuotaGb: number
  storageUsedGb: number
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label className="mb-1 block text-sm font-normal text-muted-foreground">
      {children}
    </Label>
  )
}

function formatHourDayTick(timestamp: string, groupBy: UsageHourDayGroupBy) {
  const date = new Date(timestamp)
  if (groupBy === "day") {
    return date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    })
  }
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
}

export function StorageUsageChart({
  timeSeries,
  storageFreeQuotaGb,
  storageUsedGb,
}: StorageUsageChartProps) {
  const [dateRange, setDateRange] = useState(getDefaultUsageDateRange)
  const [groupBy, setGroupBy] = useState<UsageHourDayGroupBy>("hour")

  const chartData = useMemo(
    () => getStorageUsageChartData(timeSeries, { dateRange, groupBy }),
    [timeSeries, dateRange, groupBy],
  )

  const tickFormatter = (timestamp: string) =>
    formatHourDayTick(timestamp, groupBy)

  function handleExport() {
    toast.info("存储用量导出功能即将上线")
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border p-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <FilterLabel>时间范围</FilterLabel>
            <UtcDateRangePicker dateRange={dateRange} onChange={setDateRange} />
          </div>

          <div>
            <FilterLabel>分组依据</FilterLabel>
            <ToggleGroup
              type="single"
              value={groupBy}
              onValueChange={(value) => {
                if (value) setGroupBy(value as UsageHourDayGroupBy)
              }}
              variant="outline"
              className="h-8"
            >
              <ToggleGroupItem value="hour" className="h-8 px-3 text-sm">
                小时
              </ToggleGroupItem>
              <ToggleGroupItem value="day" className="h-8 px-3 text-sm">
                天
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 rounded-full px-2.5"
          onClick={handleExport}
        >
          导出
        </Button>
      </div>

      <div className="min-h-[264px] w-full p-4">
        <div className="mb-2 text-sm font-medium text-foreground">
          存储容量(GB)
        </div>
        <div className="text-xs text-muted-foreground">
          所有沙盒使用的持久化存储。存储使用量无法按模板筛选。
        </div>
        <div className="my-2 flex flex-row flex-wrap items-end gap-x-2">
          <span className="text-sm text-foreground">
            {formatUsageStorageGb(storageUsedGb)}
          </span>
          <span className="text-xs text-muted-foreground">当前已使用 GB， </span>
          <span className="text-sm text-foreground/80">
            {formatUsageStorageGb(storageFreeQuotaGb)}
          </span>
          <span className="text-xs text-muted-foreground">GB 免费额度</span>
        </div>
        <div className="relative min-h-[220px] w-full">
          <UsageLineChart
            data={chartData}
            className="h-[220px] w-full"
            tickFormatter={tickFormatter}
          />
        </div>
      </div>
    </div>
  )
}
