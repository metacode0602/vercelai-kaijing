'use client'

import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { formatAvailabilityRate, formatCount, SLA_RATE_FORMULA_LABEL } from '../_lib/format-sla'
import type { SlaDatacenterOverviewRow } from '@/lib/types/sla'

const CHART_CONFIG = {
  slaPercent: { label: 'SLA', color: 'hsl(var(--chart-1))' },
  newFaultCount: { label: '新增故障', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig

function shortDcName(name: string): string {
  return name.replace(/\s*IDC$/, '')
}

type ChartRow = {
  id: string
  name: string
  slaPercent: number
  newFaultCount: number
  slaMet: boolean
}

export function SlaOverviewChart({ rows }: { rows: SlaDatacenterOverviewRow[] }) {
  const chartData = useMemo<ChartRow[]>(
    () =>
      rows.map((row) => ({
        id: row.dataCenterId,
        name: shortDcName(row.dataCenterName),
        slaPercent: (row.faultSlaRate ?? 0) * 100,
        newFaultCount: row.newFaultCount,
        slaMet: row.slaMet ?? false,
      })),
    [rows],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>机房 SLA 对比</CardTitle>
        <CardDescription>
          合同 SLA = {SLA_RATE_FORMULA_LABEL}，与新增故障次数
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-2 sm:px-6">
        <ChartContainer config={CHART_CONFIG} className="aspect-auto h-[360px] w-full">
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={0}
              angle={-18}
              textAnchor="end"
              height={56}
            />
            <YAxis
              yAxisId="left"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              domain={[90, 100]}
              tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
              width={52}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              allowDecimals={false}
              width={36}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
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
            <Bar yAxisId="right" dataKey="newFaultCount" fill="var(--color-newFaultCount)" radius={[4, 4, 0, 0]} barSize={28} opacity={0.85} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="slaPercent"
              stroke="var(--color-slaPercent)"
              strokeWidth={2.5}
              dot={{ r: 4, fill: 'var(--color-slaPercent)' }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

const FAULT_CHART_CONFIG = {
  count: { label: '故障次数', color: 'hsl(var(--chart-3))' },
} satisfies ChartConfig

export function SlaFaultRankChart({ rows }: { rows: SlaDatacenterOverviewRow[] }) {
  const chartData = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.newFaultCount - a.newFaultCount)
        .map((row) => ({
          name: shortDcName(row.dataCenterName),
          count: row.newFaultCount,
          slaMet: row.slaMet ?? false,
        })),
    [rows],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>新增故障排名</CardTitle>
        <CardDescription>当前月各机房新增故障事件数（§8.2）</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-2 sm:px-6">
        <ChartContainer config={FAULT_CHART_CONFIG} className="aspect-auto h-[280px] w-full">
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              width={88}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent formatter={(value) => [formatCount(Number(value)), '新增故障']} />
              }
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.name}
                  fill={entry.slaMet ? 'hsl(var(--chart-3))' : 'hsl(var(--destructive))'}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function SlaAvailabilityBadge({ rate }: { rate: number | null }) {
  if (rate == null) return <span className="text-muted-foreground">—</span>
  const met = rate >= 0.995
  return (
    <span className={met ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'font-semibold text-rose-600 dark:text-rose-400'}>
      {formatAvailabilityRate(rate)}
    </span>
  )
}
