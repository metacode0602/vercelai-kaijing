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
import {
  defaultDateRange,
  formatDashboardMoney,
} from '@/lib/console/dashboard-query'
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

const RANGE_LABEL: Record<DashboardTrendRange, string> = {
  7: '近 7 天',
  30: '近 30 天',
  90: '近 90 天',
}

function formatNumber(value: number) {
  return value.toLocaleString('en-US')
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

type AppliedFilters = {
  range: DashboardTrendRange
  dateFrom: string
  dateTo: string
  platform: string
  site: string
  shopId: string
}

function initialFilters(): AppliedFilters {
  const dates = defaultDateRange(new Date(), 7)
  return {
    range: 7,
    dateFrom: dates.dateFrom,
    dateTo: dates.dateTo,
    platform: 'all',
    site: 'all',
    shopId: 'all',
  }
}

export default function DashboardPage() {
  const [draft, setDraft] = React.useState<AppliedFilters>(initialFilters)
  const [applied, setApplied] = React.useState<AppliedFilters>(initialFilters)
  const [notice, setNotice] = React.useState('')

  const queryInput = {
    range: applied.range,
    dateFrom: applied.dateFrom,
    dateTo: applied.dateTo,
    platform: applied.platform === 'all' ? undefined : applied.platform,
    site: applied.site === 'all' ? undefined : applied.site,
    shopId: applied.shopId === 'all' ? undefined : applied.shopId,
  }

  const kpisQuery = trpc.dashboard.kpis.useQuery(queryInput)
  const trendsQuery = trpc.dashboard.trends.useQuery(queryInput)
  const inventoryQuery = trpc.dashboard.inventory.useQuery()
  const inventoryByCategoryQuery = trpc.dashboard.inventoryByCategory.useQuery()
  const platformMixQuery = trpc.dashboard.platformMix.useQuery(queryInput)
  const alertsQuery = trpc.dashboard.alerts.useQuery()
  const todosListQuery = trpc.dashboard.todos.useQuery()
  const filterOptionsQuery = trpc.dashboard.filterOptions.useQuery()
  const metaQuery = trpc.dashboard.meta.useQuery()
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
  const currency = k?.currency ?? null
  const currencyMode = k?.currencyMode ?? 'empty'
  const windowLabel = k ? `${k.dateFrom} 至 ${k.dateTo}` : `${applied.dateFrom} 至 ${applied.dateTo}`
  const rangeLabel = `${RANGE_LABEL[applied.range]} · ${windowLabel}`
  const shopOptions = filterOptionsQuery.data?.shops ?? []

  function deltaPct(cur: number | null | undefined, prev: number | null | undefined): { value: string; tone: 'positive' | 'negative' | 'neutral' } {
    if (cur == null || prev == null) return { value: '—', tone: 'neutral' }
    if (!prev && !cur) return { value: '0%', tone: 'neutral' }
    if (!prev) return { value: '+100%', tone: 'positive' }
    const pct = ((cur - prev) / Math.abs(prev)) * 100
    const value = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
    const tone = pct > 0.05 ? 'positive' : pct < -0.05 ? 'negative' : 'neutral'
    return { value, tone }
  }

  const revenueDelta = deltaPct(k?.revenue, k?.prevRevenue)
  const ordersDelta = deltaPct(k?.orders ?? 0, k?.prevOrders ?? 0)
  const unitsDelta = deltaPct(k?.units ?? 0, k?.prevUnits ?? 0)
  const aovDelta = deltaPct(k?.aov, k?.prevAov)
  const grossDelta = deltaPct(k?.grossProfit, k?.prevGrossProfit)
  const netDelta = deltaPct(k?.netProfit, k?.prevNetProfit)
  const totalTrendOrders = trends.reduce((s, p) => s + p.orders, 0)
  const refundRate =
    totalTrendOrders === 0
      ? 0
      : Number((trends.reduce((s, p) => s + p.refundRate * p.orders, 0) / totalTrendOrders).toFixed(1))

  const kpis = [
    {
      key: 'revenue',
      label: `销售额 · ${windowLabel}`,
      value: formatDashboardMoney(k?.revenue ?? (currencyMode === 'empty' ? 0 : null), currency, currencyMode, { compact: true }),
      delta: revenueDelta.value,
      tone: revenueDelta.tone,
      hint: 'vs 上期 · 同筛选窗口',
      href: '/console/finance',
    },
    {
      key: 'orders',
      label: `订单量 · ${windowLabel}`,
      value: formatNumber(k?.orders ?? 0),
      delta: ordersDelta.value,
      tone: ordersDelta.tone,
      hint: 'vs 上期 · orders',
      href: '/console/orders',
    },
    {
      key: 'units',
      label: `销量 · ${windowLabel}`,
      value: formatNumber(k?.units ?? 0),
      delta: unitsDelta.value,
      tone: unitsDelta.tone,
      hint: '件数 · order_lines.qty',
      href: '/console/orders',
    },
    {
      key: 'aov',
      label: `客单价 · ${windowLabel}`,
      value: formatDashboardMoney(k?.aov ?? (currencyMode === 'empty' ? 0 : null), currency, currencyMode),
      delta: aovDelta.value,
      tone: aovDelta.tone,
      hint: '销售额 / 订单量',
      href: '/console/reports',
    },
    {
      key: 'refundRate',
      label: `退款率 · ${windowLabel}`,
      value: `${refundRate}%`,
      delta: '—',
      tone: 'neutral' as const,
      hint: 'cancel_pending / 订单',
      href: '/console/aftersales',
    },
    {
      key: 'grossProfit',
      label: `毛利 · ${windowLabel}`,
      value: formatDashboardMoney(k?.grossProfit ?? (currencyMode === 'empty' ? 0 : null), currency, currencyMode, { compact: true }),
      delta: grossDelta.value,
      tone: grossDelta.tone,
      hint: k?.grossMargin == null ? '收入 − 最新 sku_costs' : `利润约 ${k.grossMargin}% · 收入 − 成本`,
      href: '/console/profits',
    },
    {
      key: 'netProfit',
      label: `净利 · ${windowLabel}`,
      value: formatDashboardMoney(k?.netProfit ?? (currencyMode === 'empty' ? 0 : null), currency, currencyMode, { compact: true }),
      delta: netDelta.value,
      tone: netDelta.tone,
      hint: k?.netMargin == null ? '毛利 − 结算/物流费用' : `净利率 ${k.netMargin}% · 同筛选窗口`,
      href: '/console/profits',
    },
  ]

  const inventorySummary = inventoryQuery.data
  const todosQueryInline = trpc.dashboard.todos.useQuery()
  const mixedMoney = currencyMode === 'mixed'
  const chartPoints = trends.map((p) => {
    const day = p.date.slice(5)
    return {
      day,
      orders: p.orders,
      revenue: mixedMoney ? null : p.revenue,
      units: p.units,
      aov: mixedMoney ? null : p.aov,
      refundRate: p.refundRate,
      grossProfit: mixedMoney ? null : p.grossProfit,
      grossMargin: mixedMoney ? null : p.grossMargin,
      netProfit: mixedMoney ? null : p.netProfit,
      netMargin: mixedMoney ? null : p.netMargin,
    }
  })
  const chartRange = k?.range ?? applied.range

  function applyFilters() {
    setApplied({ ...draft })
    const shopName =
      draft.shopId === 'all'
        ? '全部店铺'
        : (shopOptions.find((s) => s.id === draft.shopId)?.name ?? draft.shopId)
    setNotice(
      `已应用 ${draft.dateFrom} 至 ${draft.dateTo} · ${draft.platform === 'all' ? '全部平台' : draft.platform} · ${draft.site === 'all' ? '全部站点' : draft.site} · ${shopName}`,
    )
  }

  function onRangeChange(next: DashboardTrendRange) {
    const dates = defaultDateRange(new Date(), next)
    const nextFilters: AppliedFilters = { ...draft, range: next, dateFrom: dates.dateFrom, dateTo: dates.dateTo }
    setDraft(nextFilters)
    setApplied(nextFilters)
    setNotice(`已切换为${RANGE_LABEL[next]}（${dates.dateFrom} 至 ${dates.dateTo}）`)
  }

  function resetFilters() {
    const next = initialFilters()
    setDraft(next)
    setApplied(next)
    setNotice('已重置为近 7 天、全部平台、站点和店铺。')
  }

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

      {metaQuery.data?.isDemoTenant ? (
        <Alert>
          <AlertTitle>当前为演示种子数据</AlertTitle>
          <AlertDescription>
            本组织是沙箱演示租户。订单、库存流水与部分费用由手工种子写入数据库，并标有 source=seed，并非平台同步成功回执。
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">开始日期</label>
          <Input
            type="date"
            value={draft.dateFrom}
            onChange={(event) => setDraft((prev) => ({ ...prev, dateFrom: event.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">结束日期</label>
          <Input
            type="date"
            value={draft.dateTo}
            onChange={(event) => setDraft((prev) => ({ ...prev, dateTo: event.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">平台</label>
          <Select value={draft.platform} onValueChange={(value) => setDraft((prev) => ({ ...prev, platform: value }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部平台</SelectItem>
              {(filterOptionsQuery.data?.platforms ?? []).map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">国家 / 站点</label>
          <Select value={draft.site} onValueChange={(value) => setDraft((prev) => ({ ...prev, site: value }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部站点</SelectItem>
              {(filterOptionsQuery.data?.sites ?? []).map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">店铺</label>
          <Select value={draft.shopId} onValueChange={(value) => setDraft((prev) => ({ ...prev, shopId: value }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部店铺</SelectItem>
              {shopOptions.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                  {item.currency ? ` · ${item.currency}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={applyFilters}>
          应用筛选
        </Button>
        <Button variant="ghost" onClick={resetFilters}>
          重置
        </Button>
      </div>
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <OpsTodoKpiRow />

      <Alert>
        <AlertTitle>跨币种指标暂不合计</AlertTitle>
        <AlertDescription>
          {currencyMode === 'mixed'
            ? `当前窗口包含 ${(k?.currencies ?? []).join(' / ')}，金额类指标不跨币种相加。请筛选单一店铺或站点后查看销售额与利润。`
            : '金额按订单实际币种展示。筛选出单一币种后才会合计销售额、客单价与利润；不同币种不会加总后标成单一币种。'}
        </AlertDescription>
      </Alert>

      {currencyMode === 'mixed' && (k?.byCurrency.length ?? 0) > 0 ? (
        <p className="text-sm text-muted-foreground">
          分币种：{(k?.byCurrency ?? [])
            .map((row) => `${row.currency} 销售额 ${formatNumber(row.revenue)} / ${row.orders} 单`)
            .join('；')}
        </p>
      ) : null}

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
              <CardDescription>销售额、订单量、销量 · {windowLabel}</CardDescription>
            </div>
            <DashboardRangeToggle value={applied.range} onChange={onRangeChange} />
          </CardHeader>
          <CardContent>
            <SalesTrendChart range={chartRange} data={chartPoints} currency={currency} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">平台 / 站点销售占比</CardTitle>
            <CardDescription>按店铺 platform / 站点聚合 · {windowLabel}</CardDescription>
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
            <CardDescription>毛利 = 收入 − 成本；净利再减结算/物流费用 · {windowLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            {mixedMoney ? (
              <p className="flex h-[260px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                存在多种币种，请筛选单一店铺或站点后再查看利润趋势。
              </p>
            ) : (
              <ProfitTrendChart range={chartRange} data={chartPoints} currency={currency} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">退款率</CardTitle>
            <CardDescription>退款率与目标阈值 · {windowLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <RefundRateChart range={chartRange} data={chartPoints} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">客单价与订单量</CardTitle>
          <CardDescription>柱为订单量，线为客单价 · {windowLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          {mixedMoney ? (
            <AovOrdersChart
              range={chartRange}
              data={chartPoints.map((p) => ({ ...p, aov: null }))}
              currency={null}
            />
          ) : (
            <AovOrdersChart range={chartRange} data={chartPoints} currency={currency} />
          )}
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
