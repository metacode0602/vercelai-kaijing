'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  BarChart3,
  CircleDollarSign,
  Clock3,
  Download,
  Gauge,
  Info,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@workspace/ui/components/chart'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { Tabs, TabsList, TabsTrigger } from '@workspace/ui/components/tabs'
import { cn } from '@workspace/ui/lib/utils'
import {
  PRODUCT_LINE_COLORS,
  PRODUCT_LINE_IDS,
  type ProductLineId,
  type UsageDemoData,
  type UsageMetric,
  type UsageRange,
} from './usage-data'

interface UsageDashboardProps {
  data: UsageDemoData
}

type ProductTotal = {
  id: ProductLineId
  cost: number
  gpuHours: number
  tasks: number
  successfulTasks: number
  share: number
  unitCost: number
}

function KpiCard({
  title,
  value,
  description,
  change,
  icon,
  favorable = false,
}: {
  title: string
  value: string
  description: string
  change: number
  icon: ReactNode
  favorable?: boolean
}) {
  const t = useTranslations('Console.usage')
  const TrendIcon = change >= 0 ? TrendingUp : TrendingDown

  return (
    <Card size="sm" className="gap-3">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </span>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{description}</span>
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-medium tabular-nums',
              favorable && change < 0 ? 'text-emerald-600' : 'text-foreground',
            )}
          >
            <TrendIcon className="size-3" />
            {change > 0 ? '+' : ''}
            {change.toFixed(1)}%
          </span>
          <span>{t('vsPrevious')}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function getUsageMetricValue(
  value: { cost: number; gpuHours: number },
  metric: UsageMetric,
) {
  return metric === 'cost' ? value.cost : value.gpuHours
}

function escapeCsv(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`
}

export function UsageDashboard({ data }: UsageDashboardProps) {
  const t = useTranslations('Console.usage')
  const locale = useLocale()
  const [range, setRange] = useState<UsageRange>('30d')
  const [metric, setMetric] = useState<UsageMetric>('cost')
  const [hiddenProductLines, setHiddenProductLines] = useState<Set<ProductLineId>>(
    () => new Set(),
  )

  const productLabels: Record<ProductLineId, string> = {
    containerCloud: t('productLines.containerCloud'),
    serverless: t('productLines.serverless'),
    bareMetal: t('productLines.bareMetal'),
    tasks: t('productLines.tasks'),
  }

  const selectedDaily = useMemo(() => {
    if (range === '7d') return data.daily.slice(-7)
    if (range === 'month') {
      return data.daily.filter((item) => item.date >= data.monthStart)
    }
    return data.daily
  }, [data, range])

  const productTotals = useMemo<ProductTotal[]>(() => {
    const totalCost = selectedDaily.reduce(
      (sum, item) =>
        sum + PRODUCT_LINE_IDS.reduce((lineSum, id) => lineSum + item.values[id].cost, 0),
      0,
    )

    return PRODUCT_LINE_IDS.map((id) => {
      const totals = selectedDaily.reduce(
        (result, item) => {
          result.cost += item.values[id].cost
          result.gpuHours += item.values[id].gpuHours
          result.tasks += item.values[id].tasks
          result.successfulTasks += item.values[id].successfulTasks
          return result
        },
        { cost: 0, gpuHours: 0, tasks: 0, successfulTasks: 0 },
      )

      return {
        id,
        ...totals,
        share: totalCost > 0 ? (totals.cost / totalCost) * 100 : 0,
        unitCost: totals.gpuHours > 0 ? totals.cost / totals.gpuHours : 0,
      }
    })
  }, [selectedDaily])

  const totalCost = productTotals.reduce((sum, item) => sum + item.cost, 0)
  const totalGpuHours = productTotals.reduce((sum, item) => sum + item.gpuHours, 0)
  const totalTasks = productTotals.reduce((sum, item) => sum + item.tasks, 0)
  const totalSuccessfulTasks = productTotals.reduce(
    (sum, item) => sum + item.successfulTasks,
    0,
  )
  const successRate = totalTasks > 0 ? (totalSuccessfulTasks / totalTasks) * 100 : 0
  const averageUnitCost = totalGpuHours > 0 ? totalCost / totalGpuHours : 0
  const metricTotal = metric === 'cost' ? totalCost : totalGpuHours

  const chartData = useMemo(
    () =>
      selectedDaily.map((item) => {
        const values: Record<string, string | number> = { date: item.date }
        PRODUCT_LINE_IDS.forEach((id) => {
          values[id] = getUsageMetricValue(item.values[id], metric)
        })
        return values
      }),
    [metric, selectedDaily],
  )

  const chartConfig = useMemo<ChartConfig>(
    () => ({
      containerCloud: { label: productLabels.containerCloud, color: PRODUCT_LINE_COLORS.containerCloud },
      serverless: { label: productLabels.serverless, color: PRODUCT_LINE_COLORS.serverless },
      bareMetal: { label: productLabels.bareMetal, color: PRODUCT_LINE_COLORS.bareMetal },
      tasks: { label: productLabels.tasks, color: PRODUCT_LINE_COLORS.tasks },
    }),
    [productLabels.containerCloud, productLabels.serverless, productLabels.bareMetal, productLabels.tasks],
  )

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'CNY',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [locale],
  )
  const compactCurrencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'CNY',
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
    [locale],
  )
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    [locale],
  )
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }),
    [locale],
  )

  const formatCurrency = (value: number) => currencyFormatter.format(value)
  const formatHours = (value: number) =>
    `${numberFormatter.format(Math.round(value * 10) / 10)} ${t('units.gpuHours')}`
  const formatMetric = (value: number) =>
    metric === 'cost' ? formatCurrency(value) : formatHours(value)
  const formatCompactMetric = (value: number) =>
    metric === 'cost'
      ? compactCurrencyFormatter.format(value)
      : numberFormatter.format(Math.round(value * 10) / 10)
  const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`))
  const startDate = selectedDaily[0]?.date ?? data.monthStart
  const endDate = selectedDaily.at(-1)?.date ?? data.monthStart

  function toggleProductLine(id: ProductLineId) {
    setHiddenProductLines((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exportCsv() {
    const header = [
      t('table.date'),
      t('table.productLine'),
      t('table.gpuHours'),
      t('table.cost'),
      t('table.share'),
    ]
    const rows = selectedDaily.flatMap((item) =>
      productTotals.map((product) => [
        item.date,
        productLabels[product.id],
        item.values[product.id].gpuHours,
        item.values[product.id].cost,
        `${product.share.toFixed(1)}%`,
      ]),
    )
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `gpu-usage-${startDate}-${endDate}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-5 py-6">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            >
              <Info />
              {t('demoBadge')}
            </Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">{t('description')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-lg border bg-muted/40 px-3">
            <WalletCards className="size-4 text-muted-foreground" />
            <div className="flex flex-col leading-none">
              <span className="text-[10px] text-muted-foreground">{t('balance')}</span>
              <span className="mt-1 text-sm font-semibold tabular-nums">
                {formatCurrency(data.balance)}
              </span>
            </div>
          </div>
          <Tabs value={range} onValueChange={(value) => setRange(value as UsageRange)}>
            <TabsList>
              <TabsTrigger value="7d">{t('ranges.7d')}</TabsTrigger>
              <TabsTrigger value="30d">{t('ranges.30d')}</TabsTrigger>
              <TabsTrigger value="month">{t('ranges.month')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" onClick={exportCsv}>
            <Download />
            {t('exportCsv')}
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title={t('kpis.spend')}
          value={formatCurrency(totalCost)}
          description={t('kpis.spendHint', { amount: formatCurrency(totalCost / Math.max(selectedDaily.length, 1)) })}
          change={data.changes.spend}
          icon={<CircleDollarSign className="size-4" />}
        />
        <KpiCard
          title={t('kpis.gpuHours')}
          value={formatHours(totalGpuHours)}
          description={t('kpis.gpuHoursHint', { amount: formatHours(totalGpuHours / Math.max(selectedDaily.length, 1)) })}
          change={data.changes.gpuHours}
          icon={<Clock3 className="size-4" />}
        />
        <KpiCard
          title={t('kpis.tasks')}
          value={numberFormatter.format(totalTasks)}
          description={t('kpis.tasksHint', { rate: successRate.toFixed(1) })}
          change={data.changes.tasks}
          icon={<Activity className="size-4" />}
        />
        <KpiCard
          title={t('kpis.unitCost')}
          value={`${formatCurrency(averageUnitCost)} / ${t('units.gpuHour')}`}
          description={t('kpis.unitCostHint')}
          change={data.changes.unitCost}
          icon={<Gauge className="size-4" />}
          favorable
        />
      </section>

      {selectedDaily.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
            <BarChart3 className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">{t('empty.title')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('empty.description')}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid min-w-0 gap-4 xl:grid-cols-12">
            <Card className="min-w-0 xl:col-span-8">
              <CardHeader className="border-b xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <CardTitle>{t('charts.trend.title')}</CardTitle>
                  <CardDescription>
                    {t('charts.trend.description', {
                      start: formatDate(startDate),
                      end: formatDate(endDate),
                    })}
                  </CardDescription>
                </div>
                <Tabs
                  value={metric}
                  onValueChange={(value) => setMetric(value as UsageMetric)}
                  className="w-fit"
                >
                  <TabsList>
                    <TabsTrigger value="cost">{t('metrics.cost')}</TabsTrigger>
                    <TabsTrigger value="hours">{t('metrics.hours')}</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                  <div>
                    <span className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t('charts.trend.total')}
                    </span>
                    <span className="mt-1 block text-3xl font-semibold tracking-tight tabular-nums">
                      {formatMetric(metricTotal)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {t('charts.trend.dailyAverage')}
                    </span>
                    <span className="mt-1 block text-lg font-semibold tabular-nums">
                      {formatMetric(metricTotal / Math.max(selectedDaily.length, 1))}
                    </span>
                  </div>
                </div>
                <ChartContainer config={chartConfig} className="h-[310px] w-full">
                  <AreaChart data={chartData} margin={{ left: 4, right: 12, top: 8 }}>
                    <defs>
                      {PRODUCT_LINE_IDS.map((id) => (
                        <linearGradient key={id} id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={PRODUCT_LINE_COLORS[id]} stopOpacity={0.7} />
                          <stop offset="95%" stopColor={PRODUCT_LINE_COLORS[id]} stopOpacity={0.08} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                    />
                    <YAxis
                      tickFormatter={formatCompactMetric}
                      tickLine={false}
                      axisLine={false}
                      width={58}
                    />
                    <ChartTooltip
                      cursor={{ strokeWidth: 1 }}
                      content={
                        <ChartTooltipContent
                          labelFormatter={(label) => formatDate(String(label))}
                          formatter={(value) => formatMetric(Number(value))}
                        />
                      }
                    />
                    {PRODUCT_LINE_IDS.filter((id) => !hiddenProductLines.has(id)).map((id) => (
                      <Area
                        key={id}
                        dataKey={id}
                        name={productLabels[id]}
                        type="monotone"
                        stackId="usage"
                        stroke={PRODUCT_LINE_COLORS[id]}
                        strokeWidth={2}
                        fill={`url(#fill-${id})`}
                      />
                    ))}
                  </AreaChart>
                </ChartContainer>
                <div className="flex flex-wrap gap-x-5 gap-y-2 border-t pt-3">
                  {PRODUCT_LINE_IDS.map((id) => {
                    const hidden = hiddenProductLines.has(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={!hidden}
                        onClick={() => toggleProductLine(id)}
                        className={cn(
                          'flex items-center gap-2 text-xs text-muted-foreground transition-opacity hover:text-foreground',
                          hidden && 'opacity-40',
                        )}
                      >
                        <span
                          className="size-2.5 rounded-[3px]"
                          style={{ backgroundColor: PRODUCT_LINE_COLORS[id] }}
                        />
                        {productLabels[id]}
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0 xl:col-span-4">
              <CardHeader className="border-b">
                <CardTitle>{t('charts.share.title')}</CardTitle>
                <CardDescription>{t('charts.share.description')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <ChartContainer config={chartConfig} className="h-[250px] w-full">
                    <PieChart>
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            nameKey="id"
                            formatter={(value) => formatMetric(Number(value))}
                          />
                        }
                      />
                      <Pie
                        data={productTotals}
                        dataKey={metric}
                        nameKey="id"
                        innerRadius={68}
                        outerRadius={98}
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {productTotals.map((item) => (
                          <Cell key={item.id} fill={PRODUCT_LINE_COLORS[item.id]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t('charts.share.total')}
                    </span>
                    <span className="mt-1 max-w-28 text-center text-lg font-semibold tabular-nums">
                      {formatMetric(metricTotal)}
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  {productTotals.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-xs">
                      <span
                        className="size-2.5 shrink-0 rounded-[3px]"
                        style={{ backgroundColor: PRODUCT_LINE_COLORS[item.id] }}
                      />
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {productLabels[item.id]}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatMetric(getUsageMetricValue(item, metric))}
                      </span>
                      <span className="w-10 text-right tabular-nums text-muted-foreground">
                        {item.share.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid min-w-0 gap-4 xl:grid-cols-12">
            <Card className="min-w-0 xl:col-span-7">
              <CardHeader className="border-b">
                <CardTitle>{t('charts.ranking.title')}</CardTitle>
                <CardDescription>{t('charts.ranking.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={chartConfig}
                  className="h-[300px] w-full"
                  initialDimension={{ width: 500, height: 300 }}
                >
                  <BarChart
                    data={[...productTotals].sort(
                      (a, b) => getUsageMetricValue(b, metric) - getUsageMetricValue(a, metric),
                    )}
                    layout="vertical"
                    margin={{ left: 12, right: 20 }}
                  >
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="id"
                      tickFormatter={(id: ProductLineId) => productLabels[id]}
                      tickLine={false}
                      axisLine={false}
                      width={86}
                    />
                    <ChartTooltip
                      cursor={{ fill: 'var(--muted)' }}
                      content={
                        <ChartTooltipContent
                          nameKey="id"
                          formatter={(value) => formatMetric(Number(value))}
                        />
                      }
                    />
                    <Bar dataKey={metric} radius={[0, 6, 6, 0]} barSize={24}>
                      {productTotals.map((item) => (
                        <Cell key={item.id} fill={PRODUCT_LINE_COLORS[item.id]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className="min-w-0 xl:col-span-5">
              <CardHeader className="border-b">
                <CardTitle>{t('table.title')}</CardTitle>
                <CardDescription>{t('table.description')}</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table className="min-w-[560px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('table.productLine')}</TableHead>
                      <TableHead className="text-right">{t('table.gpuHours')}</TableHead>
                      <TableHead className="text-right">{t('table.cost')}</TableHead>
                      <TableHead className="text-right">{t('table.share')}</TableHead>
                      <TableHead className="text-right">{t('table.unitCost')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...productTotals]
                      .sort((a, b) => b.cost - a.cost)
                      .map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <span className="flex items-center gap-2 font-medium">
                              <span
                                className="size-2.5 rounded-[3px]"
                                style={{ backgroundColor: PRODUCT_LINE_COLORS[item.id] }}
                              />
                              {productLabels[item.id]}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {numberFormatter.format(Math.round(item.gpuHours * 10) / 10)}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatCurrency(item.cost)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.share.toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(item.unitCost)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell>{t('table.total')}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {numberFormatter.format(Math.round(totalGpuHours * 10) / 10)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(totalCost)}</TableCell>
                      <TableCell className="text-right tabular-nums">100.0%</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(averageUnitCost)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
              <CardFooter className="justify-between gap-3 text-xs text-muted-foreground">
                <span>{t('table.gpuHourUnit')}</span>
                <span>{t('table.updatedAt', { date: formatDate(endDate) })}</span>
              </CardFooter>
            </Card>
          </section>
        </>
      )}
    </div>
  )
}
