'use client'

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
import { MOCK_DASHBOARD_TREND } from '@/lib/crossborder/mock-data'

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

export type DashboardTrendPoint = {
  day: string
  orders: number
  revenue: number
}

type DashboardTrendChartProps = {
  /** When omitted or empty, falls back to MOCK_DASHBOARD_TREND for the demo console. */
  data?: DashboardTrendPoint[]
}

export function DashboardTrendChart({ data }: DashboardTrendChartProps) {
  const points =
    data && data.length > 0 ? data : (MOCK_DASHBOARD_TREND as DashboardTrendPoint[])

  if (points.length === 0) {
    return (
      <div className="flex h-[260px] min-h-[260px] w-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        暂无趋势数据
      </div>
    )
  }

  return (
    /*
     * Recharts 3 ResponsiveContainer returns null when measured size ≤ 0.
     * ChartContainer defaults to flex + aspect-video; we force a stable box
     * (aspect-auto + fixed height) so ResizeObserver always sees positive size.
     * Card overflow-hidden + recharts' 0×0 overflow trick can also clip — keep
     * the chart in its own sized wrapper.
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
              typeof v === 'number' ? (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)) : String(v)
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
  )
}
