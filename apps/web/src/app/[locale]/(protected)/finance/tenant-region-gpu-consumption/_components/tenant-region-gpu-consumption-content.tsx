"use client"

import { formatMoney, formatText } from '@/app/[locale]/(protected)/finance/_lib/display'
import { ListPagination } from '@/components/shared/list-pagination'
import {
  labelTenantRegionGpuProductLine,
  labelTenantRegionGpuSource,
  TENANT_REGION_GPU_PRODUCT_LINES,
  type TenantRegionGpuProductLine,
} from '@/lib/finance/tenant-region-gpu-product-line'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs'
import { Badge } from '@workspace/ui/components/badge'
import { useEffect, useMemo, useState } from 'react'
import { TenantRegionGpuImportButton } from './tenant-region-gpu-import-dialog'
import { TenantRegionGpuMonthlyImportButton } from './tenant-region-gpu-monthly-import-dialog'
import {
  isTenantRegionGpuPricingFixable,
  TenantRegionGpuPricingFixDialog,
  type TenantRegionGpuPricingFixTarget,
} from './tenant-region-gpu-pricing-fix-dialog'

const FILTER_ALL = 'all'
const PAGE_SIZE = 20

function currentUsageMonth(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

const pricingStatusLabels: Record<string, string> = {
  ok: '正常',
  pending: '待解析',
  region_not_found: '区域未匹配机房',
  card_type_not_found: '卡型未匹配',
  pricing_pair_not_found: '缺成本定价',
  platform_list_price_not_found: '缺平台刊例价',
}

const enrichmentLabels: Record<string, string> = {
  none: '无项目',
  auto_single: '单项目',
  auto_preset: '预置分成',
  multi_project_primary: '主租户项目',
  multi_project_unresolved: '多项目待配置',
}

export function TenantRegionGpuConsumptionContent() {
  const [usageMonth, setUsageMonth] = useState(currentUsageMonth())
  const [tenantPlatformId, setTenantPlatformId] = useState('')
  const [dataCenterId, setDataCenterId] = useState<string>(FILTER_ALL)
  const [productLine, setProductLine] = useState<string>(FILTER_ALL)
  const [hasAnomaly, setHasAnomaly] = useState<string>(FILTER_ALL)
  const [granularity, setGranularity] = useState<'monthly' | 'daily'>('monthly')
  const [monthlyPage, setMonthlyPage] = useState(1)
  const [dailyPage, setDailyPage] = useState(1)
  const [pricingFixTarget, setPricingFixTarget] = useState<TenantRegionGpuPricingFixTarget | null>(
    null,
  )
  const [pricingFixOpen, setPricingFixOpen] = useState(false)

  const utils = trpc.useUtils()

  const invalidateLists = async () => {
    await utils.finance.tenantRegionGpuConsumption.listMonthly.invalidate()
    await utils.finance.tenantRegionGpuConsumption.listDaily.invalidate()
    await utils.finance.tenantRegionGpuConsumption.summarizeMonthly.invalidate()
    await utils.finance.tenantRegionGpuConsumption.listFilterOptions.invalidate()
  }

  const { data: filterOptions } = trpc.finance.tenantRegionGpuConsumption.listFilterOptions.useQuery(
    { usageMonth },
  )

  const productLineFilter =
    productLine === FILTER_ALL ? undefined : (productLine as TenantRegionGpuProductLine)

  const anomalyFilter =
    hasAnomaly === FILTER_ALL ? undefined : (hasAnomaly as 'yes' | 'no')

  const listInput = useMemo(
    () => ({
      usageMonth,
      tenantPlatformId: tenantPlatformId.trim() || undefined,
      dataCenterId: dataCenterId === FILTER_ALL ? undefined : dataCenterId,
      productLine: productLineFilter,
      hasAnomaly: anomalyFilter,
    }),
    [usageMonth, tenantPlatformId, dataCenterId, productLineFilter, anomalyFilter],
  )

  useEffect(() => {
    setMonthlyPage(1)
    setDailyPage(1)
  }, [usageMonth, tenantPlatformId, dataCenterId, productLine, hasAnomaly])

  const monthlyListInput = useMemo(
    () => ({
      ...listInput,
      limit: PAGE_SIZE,
      offset: (monthlyPage - 1) * PAGE_SIZE,
    }),
    [listInput, monthlyPage],
  )

  const dailyListInput = useMemo(
    () => ({
      ...listInput,
      limit: PAGE_SIZE,
      offset: (dailyPage - 1) * PAGE_SIZE,
    }),
    [listInput, dailyPage],
  )

  const { data: monthlyData, isLoading: monthlyLoading } =
    trpc.finance.tenantRegionGpuConsumption.listMonthly.useQuery(monthlyListInput, {
      enabled: granularity === 'monthly',
    })

  const { data: dailyData, isLoading: dailyLoading } =
    trpc.finance.tenantRegionGpuConsumption.listDaily.useQuery(dailyListInput, {
      enabled: granularity === 'daily',
    })

  const { data: summary } = trpc.finance.tenantRegionGpuConsumption.summarizeMonthly.useQuery(
    listInput,
  )

  const rows = granularity === 'monthly' ? (monthlyData?.rows ?? []) : (dailyData?.rows ?? [])
  const total = granularity === 'monthly' ? (monthlyData?.total ?? 0) : (dailyData?.total ?? 0)
  const page = granularity === 'monthly' ? monthlyPage : dailyPage
  const setPage = granularity === 'monthly' ? setMonthlyPage : setDailyPage
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const isLoading = granularity === 'monthly' ? monthlyLoading : dailyLoading

  const monthOptions = useMemo(() => {
    const set = new Set<string>([usageMonth, ...(filterOptions?.availableMonths ?? [])])
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [usageMonth, filterOptions?.availableMonths])

  const monthlyColSpan =
    granularity === 'monthly' ? 18 : granularity === 'daily' ? 16 : 16

  const openPricingFix = (row: (typeof rows)[number]) => {
    if (!isTenantRegionGpuPricingFixable(row) || !row.dataCenterId || !row.gpuCardTypeId) return
    setPricingFixTarget({
      dataCenterId: row.dataCenterId,
      gpuCardTypeId: row.gpuCardTypeId,
      dataCenterName: row.dataCenterName,
      gpuCardTypeName: row.gpuCardTypeName,
      regionCode: row.regionCode,
      gpuModel: row.gpuModel,
      usageMonth,
    })
    setPricingFixOpen(true)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">租户卡时消费</h1>
          <p className="text-sm text-muted-foreground">
            按租户 × 区域 × GPU × 产品线查看日/月卡时与消费；日表与月表独立存储，支持 Excel 导入。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TenantRegionGpuImportButton onSuccess={() => void invalidateLists()} />
          <TenantRegionGpuMonthlyImportButton
            onSuccess={() => void invalidateLists()}
            defaultUsageMonth={usageMonth}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>筛选</CardTitle>
          <CardDescription>按月度、租户 Id、机房、产品线、是否有异常过滤</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-5">
          <div className="grid gap-2">
            <Label htmlFor="usage-month">月度</Label>
            <Select value={usageMonth} onValueChange={setUsageMonth}>
              <SelectTrigger id="usage-month" className="w-full">
                <SelectValue placeholder="选择月份" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tenant-id">租户 Id</Label>
            <Input
              id="tenant-id"
              placeholder="平台租户 Id 或 CRM tenant_id"
              value={tenantPlatformId}
              onChange={(e) => setTenantPlatformId(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="data-center">机房</Label>
            <Select value={dataCenterId} onValueChange={setDataCenterId}>
              <SelectTrigger id="data-center" className="w-full">
                <SelectValue placeholder="全部机房" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>全部机房</SelectItem>
                {(filterOptions?.dataCenters ?? []).map((dc) => (
                  <SelectItem key={dc.id} value={dc.id}>
                    {dc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="product-line">产品线</Label>
            <Select value={productLine} onValueChange={setProductLine}>
              <SelectTrigger id="product-line" className="w-full">
                <SelectValue placeholder="全部产品线" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>全部产品线</SelectItem>
                {TENANT_REGION_GPU_PRODUCT_LINES.map((pl) => (
                  <SelectItem key={pl} value={pl}>
                    {labelTenantRegionGpuProductLine(pl)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="has-anomaly">是否有异常</Label>
            <Select value={hasAnomaly} onValueChange={setHasAnomaly}>
              <SelectTrigger id="has-anomaly" className="w-full">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>全部</SelectItem>
                <SelectItem value="yes">有</SelectItem>
                <SelectItem value="no">无</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>匹配行数</CardDescription>
            <CardTitle className="text-2xl">{summary?.rowCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>余额消费合计</CardDescription>
            <CardTitle className="text-2xl">
              {formatMoney(summary?.totalBalanceConsumption ?? '0')}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>余额卡时合计</CardDescription>
            <CardTitle className="text-2xl">
              {formatMoney(summary?.totalBalanceCardHours ?? '0')}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>裸金属摊销前余额消费合计</CardDescription>
            <CardTitle className="text-2xl">
              {formatMoney(summary?.totalBareMetalPreAmortBalanceConsumption ?? '0')}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>裸金属摊销前余额卡时合计</CardDescription>
            <CardTitle className="text-2xl">
              {formatMoney(summary?.totalBareMetalPreAmortBalanceCardHours ?? '0')}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs value={granularity} onValueChange={(v) => setGranularity(v as 'monthly' | 'daily')}>
        <TabsList>
          <TabsTrigger value="monthly">月度汇总</TabsTrigger>
          <TabsTrigger value="daily">日明细</TabsTrigger>
        </TabsList>
        <TabsContent value={granularity} className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{granularity === 'monthly' ? '月度数据' : '日明细数据'}</CardTitle>
              <CardDescription>
                共 {total} 行{isLoading ? '（加载中…）' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {granularity === 'daily' ? <TableHead>日期</TableHead> : null}
                    <TableHead>租户Id</TableHead>
                    <TableHead>租户名称</TableHead>
                    <TableHead>产品线</TableHead>
                    {granularity === 'monthly' ? <TableHead>摊销</TableHead> : null}
                    {granularity === 'monthly' ? <TableHead>来源</TableHead> : null}
                    <TableHead>客户全称</TableHead>
                    <TableHead>机房</TableHead>
                    <TableHead>区域</TableHead>
                    <TableHead>GPU</TableHead>
                    <TableHead className="text-right">余额消费</TableHead>
                    <TableHead className="text-right">余额卡时</TableHead>
                    <TableHead className="text-right">刊例价</TableHead>
                    <TableHead className="text-right">成交单价</TableHead>
                    <TableHead className="text-right">分成%</TableHead>
                    <TableHead>客户经理</TableHead>
                    <TableHead>新客/老客</TableHead>
                    <TableHead>定价</TableHead>
                    {granularity === 'monthly' ? <TableHead>操作</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={monthlyColSpan} className="text-center text-muted-foreground">
                        暂无数据，可导入 Excel 或等待平台同步写入
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.id}>
                        {granularity === 'daily' ? (
                          <TableCell className="whitespace-nowrap">{row.usageDate}</TableCell>
                        ) : null}
                        <TableCell className="whitespace-nowrap">{row.tenantPlatformId}</TableCell>
                        <TableCell>{formatText(row.tenantName)}</TableCell>
                        <TableCell>{labelTenantRegionGpuProductLine(row.productLine)}</TableCell>
                        {granularity === 'monthly' ? (
                          <TableCell>
                            {row.productLine === 'bare_metal' && row.hasAmortization ? (
                              <Badge variant="secondary">有摊销</Badge>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                        ) : null}
                        {granularity === 'monthly' ? (
                          <TableCell>
                            {row.source ? labelTenantRegionGpuSource(row.source) : '—'}
                          </TableCell>
                        ) : null}
                        <TableCell>{formatText(row.customerFullName)}</TableCell>
                        <TableCell>{formatText(row.dataCenterName)}</TableCell>
                        <TableCell>{row.regionCode}</TableCell>
                        <TableCell>{row.gpuModel}</TableCell>
                        <TableCell className="text-right">
                          {formatMoney(row.balanceConsumption)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(row.balanceCardHours)}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.listPricePerHour ? formatMoney(row.listPricePerHour) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.unitPricePerHour ? formatMoney(row.unitPricePerHour) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.revenueSharePercent ?? '—'}
                        </TableCell>
                        <TableCell>{formatText(row.accountManagerName)}</TableCell>
                        <TableCell>{row.customerIncentiveLabel}</TableCell>
                        <TableCell
                          className={`whitespace-nowrap text-xs ${
                            isTenantRegionGpuPricingFixable(row)
                              ? 'cursor-pointer text-destructive underline-offset-2 hover:underline'
                              : 'text-muted-foreground'
                          }`}
                          onClick={() => openPricingFix(row)}
                          title={
                            isTenantRegionGpuPricingFixable(row)
                              ? '点击配置机房×卡型成本并刷新日/月定价'
                              : undefined
                          }
                        >
                          {pricingStatusLabels[row.pricingResolveStatus] ??
                            row.pricingResolveStatus}
                          {row.enrichmentBindingSource !== 'none'
                            ? ` · ${enrichmentLabels[row.enrichmentBindingSource] ?? row.enrichmentBindingSource}`
                            : ''}
                        </TableCell>
                        {granularity === 'monthly' ? (
                          <TableCell>
                            <LocaleLink
                              href={`/finance/tenant-region-gpu-consumption/monthly/${row.id}`}
                              className="text-primary text-sm hover:underline"
                            >
                              详情
                            </LocaleLink>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <ListPagination
                page={page}
                totalPages={totalPages}
                totalItems={total}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <TenantRegionGpuPricingFixDialog
        open={pricingFixOpen}
        onOpenChange={setPricingFixOpen}
        target={pricingFixTarget}
        onSuccess={() => void invalidateLists()}
      />
    </div>
  )
}
