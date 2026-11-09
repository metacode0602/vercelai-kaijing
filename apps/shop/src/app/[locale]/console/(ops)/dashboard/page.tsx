'use client'

import * as React from 'react'
import {
  AovOrdersChart,
  DashboardRangeToggle,
  InventoryStructureChart,
  PlatformMixCard,
  ProfitTrendChart,
  RefundRateChart,
  SalesTrendChart,
  TurnoverChart,
} from '@/components/console/dashboard-charts'
import { DashboardKpiCard } from '@/components/console/dashboard-kpi-card'
import type { DashboardTrendRange } from '@/lib/console/dashboard-types'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { DetailKpiRow } from '@/components/console/detail'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
import { Input } from '@workspace/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

const RANGE_LABEL: Record<DashboardTrendRange, string> = {
  7: '近 7 天',
  30: '近 30 天',
  90: '近 90 天',
}

function formatNumber(value: number) {
  return value.toLocaleString('en-US')
}

function formatCompactLkr(value: number) {
  if (value >= 1_000_000) return `LKR ${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `LKR ${Math.round(value / 1_000)}k`
  return `LKR ${formatNumber(value)}`
}

function InventoryStat({
  label,
  value,
  unit,
  hint,
}: {
  label: string
  value: string
  unit?: string
  hint?: string
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="break-words text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-lg font-semibold tabular-nums sm:text-xl">
        {value}
        {unit ? <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-1 break-words text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}


function OpsTodoKpiRow() {
  const todosQuery = trpc.dashboard.todos.useQuery()
  const t = todosQuery.data
  const items = [
    { label: '待发货', value: String(t?.readyToShip ?? 0), hint: 'ready_to_ship' },
    { label: '缺货', value: String(t?.lowStock ?? 0), hint: '可用 < 20' },
    { label: '待审采购', value: String(t?.pendingPurchase ?? 0), hint: 'pending_approval' },
    { label: '退款', value: String(t?.refundPending ?? 0), hint: '售后进行中' },
    { label: '映射异常', value: String(t?.mappingAbnormal ?? 0), hint: '映射 + 异常队列' },
    { label: '接口异常', value: String(t?.syncFail ?? 0), hint: '同步失败 / 部分失败' },
  ]

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium">运营待办</h3>
        <p className="text-xs text-muted-foreground">
          聚合订单 / 库存 / 采购 / 售后 / 映射 / 同步（DB，缺省 0）
        </p>
      </div>
      <DetailKpiRow items={items} />
      <div className="flex flex-wrap gap-2 text-xs">
        <LocaleLink className="underline-offset-2 hover:underline" href="/console/orders">订单</LocaleLink>
        <LocaleLink className="underline-offset-2 hover:underline" href="/console/inventory-balances">库存</LocaleLink>
        <LocaleLink className="underline-offset-2 hover:underline" href="/console/purchase-requests">采购</LocaleLink>
        <LocaleLink className="underline-offset-2 hover:underline" href="/console/aftersale-cancels">退款</LocaleLink>
        <LocaleLink className="underline-offset-2 hover:underline" href="/console/mappings">映射</LocaleLink>
        <LocaleLink className="underline-offset-2 hover:underline" href="/console/sync-tasks">同步</LocaleLink>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [range, setRange] = React.useState<DashboardTrendRange>(7)
  const [platform, setPlatform] = React.useState('all')
  const [site, setSite] = React.useState('all')
  const [shop, setShop] = React.useState('all')
  const [dateFrom, setDateFrom] = React.useState('2026-10-21')
  const [dateTo, setDateTo] = React.useState('2026-10-28')
  const [notice, setNotice] = React.useState('')

  const rangeLabel = RANGE_LABEL[range]
  const shopLabel = shop === 'all' ? '全部店铺' : shop

  const kpisQuery = trpc.dashboard.kpis.useQuery({ range })
  const trendsQuery = trpc.dashboard.trends.useQuery({ range })
  const inventoryQuery = trpc.dashboard.inventory.useQuery()
  const inventoryByCategoryQuery = trpc.dashboard.inventoryByCategory.useQuery()
  const financeOverview = trpc.finance.overview.useQuery()
  const platformMixQuery = trpc.dashboard.platformMix.useQuery({ range })
  const alertsQuery = trpc.dashboard.alerts.useQuery()
  const todosListQuery = trpc.dashboard.todos.useQuery()
  const exceptionSync = trpc.orderExceptions.sync.useMutation({
    onSuccess: async () => {
      await alertsQuery.refetch()
      await todosListQuery.refetch()
      setNotice('已同步订单异常统计（orderExceptions.sync）')
    },
    onError: (e) => setNotice(e.message),
  })
  const k = kpisQuery.data
  const trends = trendsQuery.data ?? []

  function deltaPct(cur: number, prev: number): { value: string; tone: 'positive' | 'negative' | 'neutral' } {
    if (!prev && !cur) return { value: '0%', tone: 'neutral' }
    if (!prev) return { value: '+100%', tone: 'positive' }
    const pct = ((cur - prev) / Math.abs(prev)) * 100
    const value = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
    const tone = pct > 0.05 ? 'positive' : pct < -0.05 ? 'negative' : 'neutral'
    return { value, tone }
  }

  const revenueDelta = deltaPct(k?.revenue ?? 0, k?.prevRevenue ?? 0)
  const ordersDelta = deltaPct(k?.orders ?? 0, k?.prevOrders ?? 0)
  const unitsDelta = deltaPct(k?.units ?? 0, k?.prevUnits ?? 0)
  const aovDelta = deltaPct(k?.aov ?? 0, k?.prevAov ?? 0)
  const refundRate =
    trends.length === 0
      ? 0
      : Number((trends.reduce((s, p) => s + p.refundRate, 0) / trends.length).toFixed(1))
  const grossProfit = financeOverview.data?.profit ?? (k?.revenue ?? 0)
  const grossMargin =
    (k?.revenue ?? 0) > 0 ? (((grossProfit) / (k?.revenue ?? 1)) * 100).toFixed(1) : '0.0'

  const kpis = [
    {
      key: 'revenue',
      label: `销售额 · ${rangeLabel}`,
      value: formatCompactLkr(k?.revenue ?? 0),
      delta: revenueDelta.value,
      tone: revenueDelta.tone,
      hint: 'vs 上期',
      href: '/console/finance',
    },
    {
      key: 'orders',
      label: `订单量 · ${rangeLabel}`,
      value: formatNumber(k?.orders ?? 0),
      delta: ordersDelta.value,
      tone: ordersDelta.tone,
      hint: 'vs 上期 · orders',
      href: '/console/orders',
    },
    {
      key: 'units',
      label: `销量 · ${rangeLabel}`,
      value: formatNumber(k?.units ?? 0),
      delta: unitsDelta.value,
      tone: unitsDelta.tone,
      hint: '件数 · order_lines.qty',
      href: '/console/orders',
    },
    {
      key: 'aov',
      label: `客单价 · ${rangeLabel}`,
      value: `LKR ${formatNumber(k?.aov ?? 0)}`,
      delta: aovDelta.value,
      tone: aovDelta.tone,
      hint: '销售额 / 订单量',
      href: '/console/reports',
    },
    {
      key: 'refundRate',
      label: `退款率 · ${rangeLabel}`,
      value: `${refundRate}%`,
      delta: '—',
      tone: 'neutral' as const,
      hint: 'cancel_pending / 订单',
      href: '/console/aftersales',
    },
    {
      key: 'grossProfit',
      label: `毛利 · ${rangeLabel}`,
      value: formatCompactLkr(grossProfit),
      delta: '—',
      tone: 'neutral' as const,
      hint: `利润约 ${grossMargin}% · finance.overview`,
      href: '/console/profits',
    },
    {
      key: 'netProfit',
      label: `净利 · ${rangeLabel}`,
      value: formatCompactLkr(financeOverview.data?.profit ?? 0),
      delta: '—',
      tone: 'neutral' as const,
      hint: `净利率 ${financeOverview.data?.margin ?? '—'}`,
      href: '/console/profits',
    },
  ]

  const inventorySummary = inventoryQuery.data
  const todosQueryInline = trpc.dashboard.todos.useQuery()
  const chartPoints = trends.map((p) => {
    const day = p.date.slice(5)
    const grossProfit = p.profit
    const grossMargin = p.revenue > 0 ? Number(((grossProfit / p.revenue) * 100).toFixed(1)) : 0
    return {
      day,
      orders: p.orders,
      revenue: p.revenue,
      units: p.units,
      aov: p.aov,
      refundRate: p.refundRate,
      grossProfit,
      grossMargin,
      netProfit: grossProfit,
      netMargin: grossMargin,
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">运营仪表盘</h2>
          <p className="text-sm text-muted-foreground">
            经营概览 · {rangeLabel} · 多店铺运营 KPI
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">开始日期</label>
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">结束日期</label>
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">平台</label>
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部平台</SelectItem>
              <SelectItem value="lazada">Lazada</SelectItem>
              <SelectItem value="daraz">Daraz</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">国家 / 站点</label>
          <Select value={site} onValueChange={setSite}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部站点</SelectItem>
              <SelectItem value="MY">MY</SelectItem>
              <SelectItem value="LK">LK</SelectItem>
              <SelectItem value="TH">TH</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">店铺</label>
          <Select value={shop} onValueChange={setShop}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部店铺</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            setNotice(
              `已应用 ${dateFrom} 至 ${dateTo} · ${platform === 'all' ? '全部平台' : platform} · ${site === 'all' ? '全部站点' : site} · ${shopLabel}`,
            )
          }
        >
          应用筛选
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setDateFrom('2026-10-21')
            setDateTo('2026-10-28')
            setPlatform('all')
            setSite('all')
            setShop('all')
            setRange(7)
            setNotice('已重置为近 7 天、全部平台、站点和店铺。')
          }}
        >
          重置
        </Button>
      </div>
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}


      {/* 运营待办 KPI：聚合待办数据 */}
      <OpsTodoKpiRow />

      <Alert>
        <AlertTitle>跨币种指标暂不合计</AlertTitle>
        <AlertDescription>
          MVP 仅 Daraz LK 使用 LKR 展示；跨币种折算、订单状态范围和利润公式待业务确认，当前不把不同币种相加。
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]">
        {kpis.map((kpi) => (
          <DashboardKpiCard
            key={kpi.key}
            label={kpi.label}
            value={kpi.value}
            delta={kpi.delta}
            tone={kpi.tone}
            hint={kpi.hint}
            href={kpi.href}
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">销售与订单趋势</CardTitle>
              <CardDescription>销售额、订单量、销量 · {rangeLabel}</CardDescription>
            </div>
            <DashboardRangeToggle value={range} onChange={setRange} />
          </CardHeader>
          <CardContent>
            <SalesTrendChart range={range} data={chartPoints} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">平台 / 站点销售占比</CardTitle>
            <CardDescription>按销售额占比 · 订单×店铺</CardDescription>
          </CardHeader>
          <CardContent>
            <PlatformMixCard data={platformMixQuery.data} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">利润结构</CardTitle>
            <CardDescription>毛利额 / 净利额与对应利润率 · {rangeLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfitTrendChart range={range} data={chartPoints} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">退款率</CardTitle>
            <CardDescription>退款率与目标阈值 · {rangeLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <RefundRateChart range={range} data={chartPoints} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">客单价与订单量</CardTitle>
          <CardDescription>柱为订单量，线为客单价 · {rangeLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          <AovOrdersChart range={range} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">库存健康</CardTitle>
          <CardDescription>库存余额汇总 · inventory_balances（缺省 0）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))]">
            <InventoryStat
              label="在库总量"
              value={formatNumber(inventorySummary?.onHand ?? 0)}
              unit="件"
            />
            <InventoryStat
              label="可用"
              value={formatNumber(inventorySummary?.available ?? 0)}
              unit="件"
            />
            <InventoryStat
              label="占用"
              value={formatNumber(inventorySummary?.reserved ?? 0)}
              unit="件"
            />
            <InventoryStat
              label="SKU 数"
              value={String(inventorySummary?.skus ?? 0)}
              unit="个"
              hint={`低库存 ${todosQueryInline.data?.lowStock ?? 0}`}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            分类 / 周转按 balances + movements 聚合；无数据空态。详见库存余额页。
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <InventoryStructureChart data={inventoryByCategoryQuery.data} />
            <TurnoverChart data={inventoryByCategoryQuery.data} />
          </div>
          <Button size="sm" variant="outline" asChild>
            <LocaleLink href="/console/inventory-balances">打开库存余额</LocaleLink>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">今日预警</CardTitle>
            <Button
              size="sm"
              variant="outline"
              disabled={exceptionSync.isPending}
              onClick={() => exceptionSync.mutate()}
            >
              同步异常
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {(alertsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无预警（订单异常 / 同步 / 库存统计为空）</p>
            ) : (
              (alertsQuery.data ?? []).map((alert) => (
                <LocaleLink
                  key={`${alert.type}-${alert.message}`}
                  href={alert.href}
                  className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm hover:bg-muted/50"
                >
                  <span>
                    <Badge variant="secondary" className="mr-2">
                      {alert.type}
                    </Badge>
                    {alert.message}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{alert.count}</span>
                </LocaleLink>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">待办</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              {
                title: `待发货 ${todosListQuery.data?.readyToShip ?? 0}`,
                href: '/console/orders',
                show: (todosListQuery.data?.readyToShip ?? 0) > 0,
              },
              {
                title: `低库存 ${todosListQuery.data?.lowStock ?? 0}`,
                href: '/console/inventory-balances',
                show: (todosListQuery.data?.lowStock ?? 0) > 0,
              },
              {
                title: `待审采购 ${todosListQuery.data?.pendingPurchase ?? 0}`,
                href: '/console/purchase-requests',
                show: (todosListQuery.data?.pendingPurchase ?? 0) > 0,
              },
              {
                title: `映射异常 ${todosListQuery.data?.mappingAbnormal ?? 0}`,
                href: '/console/mappings',
                show: (todosListQuery.data?.mappingAbnormal ?? 0) > 0,
              },
              {
                title: `同步失败 ${todosListQuery.data?.syncFail ?? 0}`,
                href: '/console/sync-tasks',
                show: (todosListQuery.data?.syncFail ?? 0) > 0,
              },
            ]
              .filter((t) => t.show)
              .map((todo) => (
                <LocaleLink
                  key={todo.title}
                  href={todo.href}
                  className="block rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
                >
                  {todo.title}
                </LocaleLink>
              ))}
            {(todosListQuery.data == null ||
              ((todosListQuery.data.readyToShip ?? 0) === 0 &&
                (todosListQuery.data.lowStock ?? 0) === 0 &&
                (todosListQuery.data.pendingPurchase ?? 0) === 0 &&
                (todosListQuery.data.mappingAbnormal ?? 0) === 0 &&
                (todosListQuery.data.syncFail ?? 0) === 0)) && (
              <p className="text-sm text-muted-foreground">暂无待办</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
