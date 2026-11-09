'use client'

import * as React from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
  type ChartConfig,
} from '@workspace/ui/components/chart'
import { Progress } from '@workspace/ui/components/progress'
import { ToggleGroup, ToggleGroupItem } from '@workspace/ui/components/toggle-group'
import { cn } from '@workspace/ui/lib/utils'
import type { DashboardTrendRange } from '@/lib/console/dashboard-types'

export type DashboardChartPoint = {
  day: string
  orders: number
  revenue: number
  units: number
  aov: number
  refundRate: number
  grossProfit: number
  grossMargin: number
  netProfit: number
  netMargin: number
}

export type PlatformMixItem = {
  platform: string
  share: number
  revenue?: number
}

export type InventoryCategoryPoint = {
  category: string
  stock: number
  inTransit: number
  turnoverDays: number
}

function ChartEmpty({ label = '暂无数据' }: { label?: string }) {
  return (
    <div className="flex h-[220px] min-h-[220px] w-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
      {label}
    </div>
  )
}

const RANGE_OPTIONS: { value: DashboardTrendRange; label: string }[] = [
  { value: 7, label: '近7天' },
  { value: 30, label: '近30天' },
  { value: 90, label: '近90天' },
]

const MIX_DOT_CLASSES = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3'] as const

const CHART_BOX_CLASS =
  'aspect-auto h-full w-full [&_.recharts-responsive-container]:h-full [&_.recharts-responsive-container]:w-full'

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return String(value)
}

export function DashboardRangeToggle({
  value,
  onChange,
}: {
  value: DashboardTrendRange
  onChange: (range: DashboardTrendRange) => void
}) {
  return (
    <ToggleGroup
      type="single"
      value={String(value)}
      onValueChange={(next) => {
        if (next === '7' || next === '30' || next === '90') {
          onChange(Number(next) as DashboardTrendRange)
        }
      }}
      variant="outline"
      size="sm"
      spacing={0}
      aria-label="趋势时间范围"
    >
      {RANGE_OPTIONS.map((option) => (
        <ToggleGroupItem key={option.value} value={String(option.value)} className="px-3 text-xs">
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

const salesChartConfig = {
  revenue: {
    label: '销售额 (LKR)',
    color: 'var(--chart-1)',
  },
  orders: {
    label: '订单量',
    color: 'var(--chart-2)',
  },
  units: {
    label: '销量 (件)',
    color: 'var(--chart-3)',
  },
} satisfies ChartConfig

export function SalesTrendChart({
  range,
  data,
}: {
  range: DashboardTrendRange
  data?: DashboardChartPoint[]
}) {
  const points = data ?? []
  const hasSignal = points.some((p) => p.revenue > 0 || p.orders > 0 || p.units > 0)
  if (!hasSignal) {
    return <ChartEmpty label="暂无销售趋势数据" />
  }

  return (
    <div className="h-[280px] min-h-[280px] w-full">
      <ChartContainer
        config={salesChartConfig}
        className={cn(CHART_BOX_CLASS, 'min-h-[280px]')}
        initialDimension={{ width: 720, height: 280 }}
      >
        <ComposedChart
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
            yAxisId="revenue"
            tickLine={false}
            axisLine={false}
            width={44}
            tickMargin={4}
            tickFormatter={(value) => formatCompactNumber(Number(value))}
          />
          <YAxis
            yAxisId="volume"
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={40}
            tickMargin={4}
            allowDecimals={false}
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
          <ChartLegend
            content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />}
          />
          <Area
            yAxisId="revenue"
            dataKey="revenue"
            type="monotone"
            fill="var(--color-revenue)"
            fillOpacity={0.2}
            stroke="var(--color-revenue)"
            strokeWidth={2}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="volume"
            dataKey="orders"
            type="monotone"
            stroke="var(--color-orders)"
            strokeWidth={2}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="volume"
            dataKey="units"
            type="monotone"
            stroke="var(--color-units)"
            strokeWidth={2}
            strokeDasharray="4 4"
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}

const profitChartConfig = {
  grossProfit: {
    label: '毛利额 (LKR)',
    color: 'var(--chart-1)',
  },
  netProfit: {
    label: '净利额 (LKR)',
    color: 'var(--chart-2)',
  },
  grossMargin: {
    label: '毛利率 (%)',
    color: 'var(--chart-4)',
  },
  netMargin: {
    label: '净利率 (%)',
    color: 'var(--chart-5)',
  },
} satisfies ChartConfig

export function ProfitTrendChart({
  range,
  data,
}: {
  range: DashboardTrendRange
  data?: DashboardChartPoint[]
}) {
  const points = data ?? []
  const hasSignal = points.some((p) => p.grossProfit !== 0 || p.netProfit !== 0 || p.revenue > 0)
  if (!hasSignal) {
    return <ChartEmpty label="暂无利润数据" />
  }

  return (
    <div className="h-[260px] min-h-[260px] w-full">
      <ChartContainer
        config={profitChartConfig}
        className={cn(CHART_BOX_CLASS, 'min-h-[260px]')}
        initialDimension={{ width: 560, height: 260 }}
      >
        <LineChart
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
            yAxisId="amount"
            tickLine={false}
            axisLine={false}
            width={44}
            tickMargin={4}
            tickFormatter={(value) => formatCompactNumber(Number(value))}
          />
          <YAxis
            yAxisId="margin"
            orientation="right"
            domain={[0, 40]}
            tickLine={false}
            axisLine={false}
            width={40}
            tickMargin={4}
            tickFormatter={(value) => `${value}%`}
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
          <ChartLegend
            content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />}
          />
          <Line
            yAxisId="amount"
            dataKey="grossProfit"
            type="monotone"
            stroke="var(--color-grossProfit)"
            strokeWidth={2}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="amount"
            dataKey="netProfit"
            type="monotone"
            stroke="var(--color-netProfit)"
            strokeWidth={2}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="margin"
            dataKey="grossMargin"
            type="monotone"
            stroke="var(--color-grossMargin)"
            strokeWidth={2}
            strokeDasharray="4 4"
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="margin"
            dataKey="netMargin"
            type="monotone"
            stroke="var(--color-netMargin)"
            strokeWidth={2}
            strokeDasharray="4 4"
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ChartContainer>
    </div>
  )
}

const refundChartConfig = {
  refundRate: {
    label: '退款率 (%)',
    color: 'var(--chart-5)',
  },
} satisfies ChartConfig

export function RefundRateChart({
  range,
  data,
}: {
  range: DashboardTrendRange
  data?: DashboardChartPoint[]
}) {
  const points = data ?? []
  const hasSignal = points.some((p) => p.orders > 0 || p.refundRate > 0)
  if (!hasSignal) {
    return <ChartEmpty label="暂无退款率数据" />
  }

  return (
    <div className="h-[260px] min-h-[260px] w-full">
      <ChartContainer
        config={refundChartConfig}
        className={cn(CHART_BOX_CLASS, 'min-h-[260px]')}
        initialDimension={{ width: 560, height: 260 }}
      >
        <LineChart
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
            domain={[0, 8]}
            tickLine={false}
            axisLine={false}
            width={36}
            tickMargin={4}
            tickFormatter={(value) => `${value}%`}
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
          <ReferenceLine
            y={5}
            stroke="var(--chart-4)"
            strokeDasharray="4 4"
            label={{
              value: '目标 5%',
              position: 'insideTopRight',
              fill: 'var(--muted-foreground)',
              fontSize: 11,
            }}
          />
          <Line
            dataKey="refundRate"
            type="monotone"
            stroke="var(--color-refundRate)"
            strokeWidth={2}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ChartContainer>
    </div>
  )
}

const aovChartConfig = {
  orders: {
    label: '订单量',
    color: 'var(--chart-2)',
  },
  aov: {
    label: '客单价 (LKR)',
    color: 'var(--chart-4)',
  },
} satisfies ChartConfig

export function AovOrdersChart({
  range,
  data,
}: {
  range: DashboardTrendRange
  data?: DashboardChartPoint[]
}) {
  const points = data ?? []
  const hasSignal = points.some((p) => p.orders > 0 || p.aov > 0)
  if (!hasSignal) {
    return <ChartEmpty label="暂无客单价 / 订单数据" />
  }

  return (
    <div className="h-[260px] min-h-[260px] w-full">
      <ChartContainer
        config={aovChartConfig}
        className={cn(CHART_BOX_CLASS, 'min-h-[260px]')}
        initialDimension={{ width: 720, height: 260 }}
      >
        <ComposedChart
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
            width={40}
            tickMargin={4}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="aov"
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={44}
            tickMargin={4}
            tickFormatter={(value) => formatCompactNumber(Number(value))}
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
          <ChartLegend
            content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />}
          />
          <Bar
            yAxisId="orders"
            dataKey="orders"
            fill="var(--color-orders)"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Line
            yAxisId="aov"
            dataKey="aov"
            type="monotone"
            stroke="var(--color-aov)"
            strokeWidth={2}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}

const inventoryChartConfig = {
  stock: {
    label: '可用库存 (件)',
    color: 'var(--chart-1)',
  },
  inTransit: {
    label: '采购在途 (件)',
    color: 'var(--chart-4)',
  },
} satisfies ChartConfig

export function InventoryStructureChart({ data }: { data?: InventoryCategoryPoint[] }) {
  const rows = data ?? []
  if (rows.length === 0) {
    return <ChartEmpty label="暂无分类库存（balances 为空）" />
  }
  return (
    <div className="h-[240px] min-h-[240px] w-full">
      <ChartContainer
        config={inventoryChartConfig}
        className={cn(CHART_BOX_CLASS, 'min-h-[240px]')}
        initialDimension={{ width: 480, height: 240 }}
      >
        <BarChart
          accessibilityLayer
          layout="vertical"
          data={rows}
          margin={{ left: 8, right: 12, top: 8, bottom: 0 }}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) => formatCompactNumber(Number(value))}
          />
          <YAxis
            type="category"
            dataKey="category"
            tickLine={false}
            axisLine={false}
            width={72}
            tickMargin={4}
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
          <ChartLegend
            content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />}
          />
          <Bar
            dataKey="stock"
            stackId="inventory"
            fill="var(--color-stock)"
            isAnimationActive={false}
          />
          <Bar
            dataKey="inTransit"
            stackId="inventory"
            fill="var(--color-inTransit)"
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
    </div>
  )
}

const turnoverChartConfig = {
  turnoverDays: {
    label: '周转天数',
    color: 'var(--chart-3)',
  },
} satisfies ChartConfig

export function TurnoverChart({ data }: { data?: InventoryCategoryPoint[] }) {
  const rows = data ?? []
  if (rows.length === 0) {
    return <ChartEmpty label="暂无周转数据（movements/balances 为空）" />
  }
  return (
    <div className="h-[240px] min-h-[240px] w-full">
      <ChartContainer
        config={turnoverChartConfig}
        className={cn(CHART_BOX_CLASS, 'min-h-[240px]')}
        initialDimension={{ width: 480, height: 240 }}
      >
        <BarChart
          accessibilityLayer
          layout="vertical"
          data={rows}
          margin={{ left: 8, right: 24, top: 8, bottom: 0 }}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis
            type="number"
            domain={[0, 45]}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) => `${value}天`}
          />
          <YAxis
            type="category"
            dataKey="category"
            tickLine={false}
            axisLine={false}
            width={72}
            tickMargin={4}
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
          <ReferenceLine
            x={30}
            stroke="var(--chart-4)"
            strokeDasharray="4 4"
            label={{
              value: '目标 30 天',
              position: 'insideTopRight',
              fill: 'var(--muted-foreground)',
              fontSize: 11,
            }}
          />
          <Bar
            dataKey="turnoverDays"
            fill="var(--color-turnoverDays)"
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
    </div>
  )
}

export function PlatformMixCard({ data }: { data?: PlatformMixItem[] }) {
  const items = data ?? []
  if (items.length === 0) {
    return <ChartEmpty label="暂无平台占比数据" />
  }
  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <div key={item.platform} className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'size-2 rounded-full',
                  MIX_DOT_CLASSES[index % MIX_DOT_CLASSES.length],
                )}
              />
              {item.platform}
            </span>
            <span className="tabular-nums text-muted-foreground">{item.share}%</span>
          </div>
          <Progress value={item.share} className="h-2" />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">按订单店铺 platform / 站点聚合销售额占比。</p>
    </div>
  )
}
