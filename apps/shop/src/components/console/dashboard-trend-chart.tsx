'use client'

import * as React from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@workspace/ui/components/chart'
import { ToggleGroup, ToggleGroupItem } from '@workspace/ui/components/toggle-group'
import {
  getDashboardTrend,
  type DashboardTrendPoint,
  type DashboardTrendRange,
} from '@/lib/crossborder/mock-data'

const chartConfig = {
  orders: {
    label: '订单',
    color: 'var(--chart-1)',
  },
  revenue: {
    label: '营收 (USD)',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig

const RANGE_OPTIONS: { value: DashboardTrendRange; label: string }[] = [
  { value: 7, label: '7天' },
  { value: 30, label: '30天' },
  { value: 90, label: '90天' },
]

export type { DashboardTrendPoint }

type DashboardTrendChartProps = {
  /** When omitted, uses mock series for the selected range. */
  data?: DashboardTrendPoint[]
  /** Initial range when using mock data. Default 7天. */
  defaultRange?: DashboardTrendRange
  /** Controlled range (optional). */
  range?: DashboardTrendRange
  onRangeChange?: (range: DashboardTrendRange) => void
  /** Hide the segmented control (e.g. parent owns it). */
  hideRangeControl?: boolean
}

export function DashboardTrendChart({
  data,
  defaultRange = 7,
  range: rangeProp,
  onRangeChange,
  hideRangeControl = false,
}: DashboardTrendChartProps) {
  const [internalRange, setInternalRange] = React.useState<DashboardTrendRange>(defaultRange)
  const range = rangeProp ?? internalRange

  function setRange(next: DashboardTrendRange) {
    if (rangeProp === undefined) setInternalRange(next)
    onRangeChange?.(next)
  }

  const points: DashboardTrendPoint[] =
    data && data.length > 0 ? data : getDashboardTrend(range)

  return (
    <div className="space-y-3">
      {!hideRangeControl ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">订单 / 营收趋势（示例）</p>
          <ToggleGroup
            type="single"
            value={String(range)}
            onValueChange={(v) => {
              if (v === '7' || v === '30' || v === '90') setRange(Number(v) as DashboardTrendRange)
            }}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="趋势时间范围"
          >
            {RANGE_OPTIONS.map((opt) => (
              <ToggleGroupItem key={opt.value} value={String(opt.value)} className="px-3 text-xs">
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ) : null}

      {points.length === 0 ? (
        <div className="flex h-[260px] min-h-[260px] w-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
          暂无趋势数据
        </div>
      ) : (
        /*
         * Recharts 3 ResponsiveContainer returns null when measured size ≤ 0.
         * ChartContainer defaults to flex + aspect-video; we force a stable box
         * (aspect-auto + fixed height) so ResizeObserver always sees positive size.
         */
        <div className="h-[260px] min-h-[260px] w-full">
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-full min-h-[260px] w-full [&_.recharts-responsive-container]:h-full [&_.recharts-responsive-container]:w-full"
            initialDimension={{ width: 640, height: 260 }}
          >
            <AreaChart
              accessibilityLayer
              data={points}
              margin={{ left: 8, right: 12, top: 8, bottom: 0 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
                minTickGap={range === 90 ? 28 : range === 30 ? 16 : 8}
              />
              <YAxis
                yAxisId="orders"
                tickLine={false}
                axisLine={false}
                width={36}
                tickMargin={4}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="revenue"
                orientation="right"
                tickLine={false}
                axisLine={false}
                width={48}
                tickMargin={4}
                tickFormatter={(v) =>
                  typeof v === 'number'
                    ? v >= 1000
                      ? `${(v / 1000).toFixed(1)}k`
                      : String(v)
                    : String(v)
                }
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="line" />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Area
                yAxisId="orders"
                dataKey="orders"
                type="monotone"
                fill="var(--color-orders)"
                fillOpacity={0.25}
                stroke="var(--color-orders)"
                strokeWidth={2}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Area
                yAxisId="revenue"
                dataKey="revenue"
                type="monotone"
                fill="var(--color-revenue)"
                fillOpacity={0.15}
                stroke="var(--color-revenue)"
                strokeWidth={2}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ChartContainer>
        </div>
      )}
    </div>
  )
}
