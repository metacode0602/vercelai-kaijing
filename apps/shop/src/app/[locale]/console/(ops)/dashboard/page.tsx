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
import {
  getDashboardSummary,
  MOCK_DASHBOARD_ALERTS,
  MOCK_DASHBOARD_INVENTORY,
  MOCK_DASHBOARD_KPI_DELTAS,
  MOCK_DASHBOARD_TODOS,
  MOCK_SHOPS,
  type DashboardTrendRange,
} from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { getOrders } from '@/lib/crossborder/order-store'
import { getMappingExceptions } from '@/lib/crossborder/mapping-exception-store'
import { usePurchaseRequests, countByStatus as countPurchaseByStatus } from '@/lib/crossborder/purchase-request-store'
import { useInventoryBalances, countBalancesKpi } from '@/lib/crossborder/wms-store'
import { useAftersaleCancels, countCancelsByStatus } from '@/lib/crossborder/aftersale-store'
import { useSyncTasks, countSyncTasksByStatus } from '@/lib/crossborder/sync-store'
import { useMappings } from '@/lib/crossborder/mapping-store'
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
  const orders = React.useMemo(() => getOrders(), [])
  const purchases = usePurchaseRequests()
  const balances = useInventoryBalances()
  const cancels = useAftersaleCancels()
  const syncTasks = useSyncTasks()
  const mappings = useMappings()
  const mappingExceptions = React.useMemo(() => getMappingExceptions(), [])

  const readyToShip = orders.filter(
    (o) =>
      o.fulfillmentStatus === 'ready_to_ship' ||
      o.fulfillmentStatus === 'unfulfilled' ||
      String(o.status) === 'ready_to_ship',
  ).length
  const lowStock = countBalancesKpi(balances).lowStock
  const purchaseCounts = countPurchaseByStatus(purchases) as Record<string, number>
  const pendingPurchase = purchaseCounts['待审核'] ?? 0
  const refundPending = countCancelsByStatus(cancels).pending
  const mappingAbnormal =
    mappings.filter((m) => m.mappingStatus === '异常' || !m.internalSku || m.internalSku === '—')
      .length +
    mappingExceptions.filter((e) => e.status === '开放' || e.status === '阻断扣库').length
  const syncCounts = countSyncTasksByStatus(syncTasks)
  const syncFail = (syncCounts['失败'] ?? 0) + (syncCounts['部分失败'] ?? 0)

  const items = [
    { label: '待发货', value: String(readyToShip), hint: 'ready_to_ship' },
    { label: '缺货', value: String(lowStock), hint: '库存低于安全水位' },
    { label: '待审采购', value: String(pendingPurchase), hint: '采购申请待审核' },
    { label: '退款', value: String(refundPending), hint: '取消/退款待处理' },
    { label: '映射异常', value: String(mappingAbnormal), hint: '映射 + 异常队列' },
    { label: '接口异常', value: String(syncFail), hint: '同步失败 / 部分失败' },
  ]

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">运营待办</h3>
        <p className="text-xs text-muted-foreground">聚合订单 / 库存 / 采购 / 售后 / 映射 / 同步原型会话</p>
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

  const summary = getDashboardSummary(range)
  const rangeLabel = RANGE_LABEL[range]
  const shopLabel =
    shop === 'all' ? '全部店铺' : (MOCK_SHOPS.find((item) => item.id === shop)?.name ?? shop)

  const kpis = [
    {
      key: 'revenue',
      label: `销售额 · ${rangeLabel}`,
      value: formatCompactLkr(summary.revenue),
      delta: MOCK_DASHBOARD_KPI_DELTAS.revenue.value,
      tone: MOCK_DASHBOARD_KPI_DELTAS.revenue.tone,
      hint: 'vs 上期 · 示例',
      href: '/console/finance',
    },
    {
      key: 'orders',
      label: `订单量 · ${rangeLabel}`,
      value: formatNumber(summary.orders),
      delta: MOCK_DASHBOARD_KPI_DELTAS.orders.value,
      tone: MOCK_DASHBOARD_KPI_DELTAS.orders.tone,
      hint: 'vs 上期 · 示例',
      href: '/console/orders',
    },
    {
      key: 'units',
      label: `销量 · ${rangeLabel}`,
      value: formatNumber(summary.units),
      delta: MOCK_DASHBOARD_KPI_DELTAS.units.value,
      tone: MOCK_DASHBOARD_KPI_DELTAS.units.tone,
      hint: '件数口径 · 示例',
      href: '/console/orders',
    },
    {
      key: 'aov',
      label: `客单价 · ${rangeLabel}`,
      value: `LKR ${formatNumber(summary.aov)}`,
      delta: MOCK_DASHBOARD_KPI_DELTAS.aov.value,
      tone: MOCK_DASHBOARD_KPI_DELTAS.aov.tone,
      hint: '销售额 / 订单量 · 示例',
      href: '/console/reports',
    },
    {
      key: 'refundRate',
      label: `退款率 · ${rangeLabel}`,
      value: `${summary.refundRate}%`,
      delta: MOCK_DASHBOARD_KPI_DELTAS.refundRate.value,
      tone: MOCK_DASHBOARD_KPI_DELTAS.refundRate.tone,
      hint: '目标 ≤ 5% · 示例',
      href: '/console/aftersales',
    },
    {
      key: 'grossProfit',
      label: `毛利 · ${rangeLabel}`,
      value: formatCompactLkr(summary.grossProfit),
      delta: MOCK_DASHBOARD_KPI_DELTAS.grossProfit.value,
      tone: MOCK_DASHBOARD_KPI_DELTAS.grossProfit.tone,
      hint: `毛利率 ${summary.grossMargin}% · 示例`,
      href: '/console/profits',
    },
    {
      key: 'netProfit',
      label: `净利 · ${rangeLabel}`,
      value: formatCompactLkr(summary.netProfit),
      delta: MOCK_DASHBOARD_KPI_DELTAS.netProfit.value,
      tone: MOCK_DASHBOARD_KPI_DELTAS.netProfit.tone,
      hint: `净利率 ${summary.netMargin}% · 示例`,
      href: '/console/profits',
    },
  ]

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
              {MOCK_SHOPS.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            setNotice(
              `已应用 ${dateFrom} 至 ${dateTo} · ${platform === 'all' ? '全部平台' : platform} · ${site === 'all' ? '全部站点' : site} · ${shopLabel}（仅原型筛选状态）`,
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


      {/* 运营待办 KPI：聚合现有原型 store */}
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
            <SalesTrendChart range={range} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">平台 / 站点销售占比</CardTitle>
            <CardDescription>按销售额占比 · 示例</CardDescription>
          </CardHeader>
          <CardContent>
            <PlatformMixCard />
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
            <ProfitTrendChart range={range} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">退款率</CardTitle>
            <CardDescription>退款率与目标阈值 · {rangeLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <RefundRateChart range={range} />
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
          <CardDescription>库存结构、周转与缺货 · 示例数据</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))]">
            <InventoryStat
              label="库存总量"
              value={formatNumber(MOCK_DASHBOARD_INVENTORY.totalStock)}
              unit="件"
            />
            <InventoryStat
              label="周转天数"
              value={MOCK_DASHBOARD_INVENTORY.turnoverDays.toFixed(1)}
              unit="天"
              hint="目标 30 天"
            />
            <InventoryStat
              label="缺货 SKU"
              value={String(MOCK_DASHBOARD_INVENTORY.shortageSkuCount)}
              unit="个"
              hint="需补货"
            />
            <InventoryStat
              label="采购在途"
              value={formatNumber(MOCK_DASHBOARD_INVENTORY.inTransitUnits)}
              unit="件"
              hint="供给管线"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium">分类库存结构</p>
              <InventoryStructureChart />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">分类周转天数</p>
              <TurnoverChart />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">缺货 SKU 清单</p>
              <Badge variant="secondary">
                {MOCK_DASHBOARD_INVENTORY.shortageSkuCount} 个待补货
              </Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>品名</TableHead>
                  <TableHead className="text-right">缺口</TableHead>
                  <TableHead>预计到货</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_DASHBOARD_INVENTORY.shortages.map((item) => (
                  <TableRow key={item.sku}>
                    <TableCell className="font-medium">{item.sku}</TableCell>
                    <TableCell>{item.title}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.gap}</TableCell>
                    <TableCell>{item.eta}</TableCell>
                    <TableCell className="text-right">
                      <LocaleLink
                        href={`/console/inventory/${item.sku}`}
                        className="text-sm underline-offset-4 hover:underline"
                      >
                        去补货
                      </LocaleLink>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">今日预警</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {MOCK_DASHBOARD_ALERTS.map((alert) => (
              <LocaleLink
                key={alert.message}
                href={alert.href}
                className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm hover:bg-muted/50"
              >
                <span>
                  <Badge variant="secondary" className="mr-2">
                    {alert.type}
                  </Badge>
                  {alert.message}
                </span>
              </LocaleLink>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">待办</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {MOCK_DASHBOARD_TODOS.map((todo) => (
              <LocaleLink
                key={todo.title}
                href={todo.href}
                className="block rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
              >
                {todo.title}
              </LocaleLink>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
