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
import {
  getDashboardTrend,
  MOCK_DASHBOARD_INVENTORY,
  MOCK_DASHBOARD_PLATFORM_MIX,
  type DashboardTrendPoint,
  type DashboardTrendRange,
} from '@/lib/crossborder/mock-data'

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
  data?: DashboardTrendPoint[]
}) {
  const points = data && data.length > 0 ? data : getDashboardTrend(range)

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

export function ProfitTrendChart({ range }: { range: DashboardTrendRange }) {
  const points = getDashboardTrend(range)

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

export function RefundRateChart({ range }: { range: DashboardTrendRange }) {
  const points = getDashboardTrend(range)

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

export function AovOrdersChart({ range }: { range: DashboardTrendRange }) {
  const points = getDashboardTrend(range)

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

export function InventoryStructureChart() {
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
          data={MOCK_DASHBOARD_INVENTORY.categories}
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

export function TurnoverChart() {
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
          data={MOCK_DASHBOARD_INVENTORY.categories}
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

export function PlatformMixCard() {
  return (
    <div className="space-y-4">
      {MOCK_DASHBOARD_PLATFORM_MIX.map((item, index) => (
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
      <p className="text-xs text-muted-foreground">MVP 仅 Daraz LK 为真实连接；其他站点为占位。</p>
    </div>
  )
}
