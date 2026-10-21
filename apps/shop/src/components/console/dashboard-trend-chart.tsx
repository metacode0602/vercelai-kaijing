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

export function DashboardTrendChart({ data }: { data: DashboardTrendPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
      <AreaChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          yAxisId="orders"
          tickLine={false}
          axisLine={false}
          width={36}
          tickMargin={4}
        />
        <YAxis
          yAxisId="revenue"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={48}
          tickMargin={4}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          yAxisId="orders"
          dataKey="orders"
          type="monotone"
          fill="var(--color-orders)"
          fillOpacity={0.2}
          stroke="var(--color-orders)"
          strokeWidth={2}
        />
        <Area
          yAxisId="revenue"
          dataKey="revenue"
          type="monotone"
          fill="var(--color-revenue)"
          fillOpacity={0.15}
          stroke="var(--color-revenue)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  )
}
