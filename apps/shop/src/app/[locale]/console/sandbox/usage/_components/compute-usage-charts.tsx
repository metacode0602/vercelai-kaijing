"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import {
  getComputeUsageChartData,
  getDefaultUsageDateRange,
  formatUsageHours,
} from "@/lib/sandbox-usage/data"
import type {
  SandboxUsageKpi,
  SandboxUsagePageData,
  UsageMinuteDayGroupBy,
} from "@/lib/sandbox-usage/types"
import { UtcDateRangePicker } from "./utc-date-range-picker"
import { UsageLineChart } from "./usage-line-chart"

interface ComputeUsageChartsProps {
  timeSeries: SandboxUsagePageData["timeSeries"]
  templates: SandboxUsagePageData["templates"]
  kpi: SandboxUsageKpi
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label className="mb-1 block text-sm font-normal text-muted-foreground">
      {children}
    </Label>
  )
}

function formatMinuteDayTick(timestamp: string, groupBy: UsageMinuteDayGroupBy) {
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

export function ComputeUsageCharts({
  timeSeries,
  templates,
  kpi,
}: ComputeUsageChartsProps) {
  const [dateRange, setDateRange] = useState(getDefaultUsageDateRange)
  const [groupBy, setGroupBy] = useState<UsageMinuteDayGroupBy>("minute")
  const [templateId, setTemplateId] = useState("all")

  const chartData = useMemo(
    () =>
      getComputeUsageChartData(timeSeries, {
        dateRange,
        groupBy,
        templateId,
      }),
    [timeSeries, dateRange, groupBy, templateId],
  )

  const tickFormatter = (timestamp: string) =>
    formatMinuteDayTick(timestamp, groupBy)

  function handleExport() {
    toast.info("vCPU / RAM / 沙盒用量导出功能即将上线")
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
                if (value) setGroupBy(value as UsageMinuteDayGroupBy)
              }}
              variant="outline"
              className="h-8"
            >
              <ToggleGroupItem value="minute" className="h-8 px-3 text-sm">
                分钟
              </ToggleGroupItem>
              <ToggleGroupItem value="day" className="h-8 px-3 text-sm">
                天
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div>
            <FilterLabel>模板</FilterLabel>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="h-8 min-w-[200px] max-w-[350px]">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.value} value={template.value}>
                    {template.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      <div className="flex min-h-[292px] w-full flex-col lg:flex-row">
        <div className="w-full p-4 lg:w-1/2">
          <div className="text-sm font-medium text-foreground">vCPU 小时</div>
          <div className="text-xs text-muted-foreground">
            您的沙盒消耗的虚拟 CPU 时间。
          </div>
          <div className="my-2">
            <span className="text-sm text-foreground">
              {formatUsageHours(kpi.vcpuHoursToday)}{" "}
            </span>
            <span className="text-xs text-muted-foreground">今日小时数</span>
          </div>
          <UsageLineChart
            data={chartData.vcpuHours}
            tickFormatter={tickFormatter}
          />
        </div>

        <div className="w-full border-t border-border p-4 lg:w-1/2 lg:border-t-0 lg:border-l">
          <div className="text-sm font-medium text-foreground">RAM 小时</div>
          <div className="text-xs text-muted-foreground">
            所有沙盒的内存使用时长。
          </div>
          <div className="my-2">
            <span className="text-sm text-foreground">
              {formatUsageHours(kpi.ramHoursToday)}{" "}
            </span>
            <span className="text-xs text-muted-foreground">今日 GB-小时</span>
          </div>
          <UsageLineChart
            data={chartData.ramHours}
            tickFormatter={tickFormatter}
          />
        </div>
      </div>

      <div className="w-full p-4 pt-1">
        <div className="mb-2 text-sm font-medium text-foreground">
          运行中的沙盒
        </div>
        <UsageLineChart
          data={chartData.runningSandboxes}
          className="h-[220px] w-full"
          tickFormatter={tickFormatter}
        />
      </div>
    </div>
  )
}
