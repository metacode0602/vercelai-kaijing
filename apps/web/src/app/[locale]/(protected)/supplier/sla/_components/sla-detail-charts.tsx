'use client'

import { useMemo } from 'react'
import { Area, AreaChart, ComposedChart, Bar, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@workspace/ui/components/chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { formatCardHours, formatCount } from '../_lib/format-sla'
import type { SlaDailyTrendPoint } from '@/lib/types/sla'

const TREND_CONFIG = {
  slaPercent: { label: 'SLA', color: 'hsl(var(--chart-1))' },
  newFaultCount: { label: '新增故障', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig

const FAULT_HOURS_CONFIG = {
  externalFaultCardHours: { label: '外部故障卡时', color: 'hsl(var(--chart-4))' },
} satisfies ChartConfig

export function SlaDailyTrendChart({
  points,
  slaMonth,
}: {
  points: SlaDailyTrendPoint[]
  slaMonth: string
}) {
  const chartData = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        slaPercent: (p.faultSlaRate ?? 0) * 100,
      })),
    [points],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>日趋势</CardTitle>
        <CardDescription>
          {slaMonth} 每日合同 SLA 与新增故障次数
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-2 sm:px-6">
        <ChartContainer config={TREND_CONFIG} className="aspect-auto h-[320px] w-full">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              yAxisId="left"
              tickLine={false}
              axisLine={false}
              domain={[90, 100]}
              tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
              width={52}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={32}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as SlaDailyTrendPoint | undefined
                    return row?.statDate ?? ''
                  }}
                  formatter={(value, name) => {
                    if (name === 'slaPercent') {
                      return [`${Number(value).toFixed(2)}%`, 'SLA']
                    }
                    return [formatCount(Number(value)), '新增故障']
                  }}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="slaPercent"
              fill="var(--color-slaPercent)"
              fillOpacity={0.12}
              stroke="var(--color-slaPercent)"
              strokeWidth={2}
            />
            <Bar
              yAxisId="right"
              dataKey="newFaultCount"
              fill="var(--color-newFaultCount)"
              radius={[2, 2, 0, 0]}
              barSize={10}
              opacity={0.8}
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function SlaFaultCardHoursChart({ points }: { points: SlaDailyTrendPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>外部故障卡时</CardTitle>
        <CardDescription>每日外部故障卡时累计（§8.3，impact_side = external）</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-2 sm:px-6">
        <ChartContainer config={FAULT_HOURS_CONFIG} className="aspect-auto h-[240px] w-full">
          <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v) => formatCardHours(Number(v))}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => [formatCardHours(Number(value)), '外部故障卡时']}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="externalFaultCardHours"
              fill="var(--color-externalFaultCardHours)"
              fillOpacity={0.2}
              stroke="var(--color-externalFaultCardHours)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
