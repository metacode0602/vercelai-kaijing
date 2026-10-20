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
  formatUsageCurrency,
  getCostUsageChartData,
} from "@/lib/sandbox-usage/data"
import type { SandboxUsageKpi, SandboxUsagePageData } from "@/lib/sandbox-usage/types"
import { UsageLineChart } from "./usage-line-chart"

interface CostUsageChartProps {
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

export function CostUsageChart({ timeSeries, templates, kpi }: CostUsageChartProps) {
  const [templateId, setTemplateId] = useState("all")

  const chartData = useMemo(
    () => getCostUsageChartData(timeSeries, { templateId }),
    [timeSeries, templateId],
  )

  function handleExport() {
    toast.info("使用费用导出功能即将上线")
  }

  return (
    <div className="min-h-[318px] w-full rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border p-4">
        <div>
          <div className="pb-4">
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
          <div className="text-sm font-medium text-foreground">使用费用</div>
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

      <div className="w-full p-4 pt-0">
        <div className="my-2">
          <span className="text-sm text-foreground">
            {formatUsageCurrency(kpi.costTodayUsd)}{" "}
          </span>
          <span className="text-xs text-muted-foreground">今天</span>
        </div>
        <UsageLineChart
          data={chartData}
          className="h-[210px] w-full"
          tickFormatter={(timestamp) =>
            new Date(timestamp).toLocaleDateString("en-US", {
              month: "2-digit",
              day: "2-digit",
              timeZone: "UTC",
            })
          }
        />
      </div>
    </div>
  )
}
