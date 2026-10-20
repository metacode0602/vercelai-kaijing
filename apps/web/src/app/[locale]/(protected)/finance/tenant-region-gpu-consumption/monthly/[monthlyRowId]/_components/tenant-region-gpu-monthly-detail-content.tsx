'use client'

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
import { Badge } from '@workspace/ui/components/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
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
import { useMemo, useState } from 'react'

const PAGE_SIZE = 20

const reconciliationLabels = {
  match: { label: '与日合计一致', variant: 'outline' as const },
  mismatch: { label: '与日合计不一致', variant: 'destructive' as const },
  no_daily: { label: '无日明细', variant: 'secondary' as const },
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function MetricCompareRow({
  label,
  monthly,
  daily,
  delta,
}: {
  label: string
  monthly: string
  daily: string | null
  delta: string | null
}) {
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell className="text-right">{formatMoney(monthly)}</TableCell>
      <TableCell className="text-right">{daily != null ? formatMoney(daily) : '—'}</TableCell>
      <TableCell className="text-right">{delta != null ? formatMoney(delta) : '—'}</TableCell>
    </TableRow>
  )
}

export function TenantRegionGpuMonthlyDetailContent({ monthlyRowId }: { monthlyRowId: string }) {
  const [dailyProductLineFilter, setDailyProductLineFilter] = useState<string>('row_default')
  const [dailyPage, setDailyPage] = useState(1)

  const filterValue = useMemo(() => {
    if (dailyProductLineFilter === 'all') return 'all' as const
    if (dailyProductLineFilter === 'row_default') return undefined
    return dailyProductLineFilter as TenantRegionGpuProductLine
  }, [dailyProductLineFilter])

  const { data, isLoading, error } = trpc.finance.tenantRegionGpuConsumption.getMonthlyRowDetail.useQuery(
    {
      monthlyRowId,
      dailyProductLineFilter: filterValue,
      dailyLimit: PAGE_SIZE,
      dailyOffset: (dailyPage - 1) * PAGE_SIZE,
    },
  )

  const monthly = data?.monthly
  const reconciliation = data?.reconciliation
  const bareMetalOrderLines = data?.bareMetalOrderLines ?? []

  if (error) {
    return (
      <div className="p-6">
        <p className="text-destructive">{error.message}</p>
        <LocaleLink href="/finance/tenant-region-gpu-consumption" className="text-primary mt-4 inline-block text-sm">
          返回列表
        </LocaleLink>
      </div>
    )
  }

  if (isLoading || !monthly || !reconciliation) {
    return <div className="p-6 text-muted-foreground">加载中…</div>
  }

  const statusMeta = reconciliationLabels[reconciliation.status]

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <LocaleLink
          href="/finance/tenant-region-gpu-consumption"
          className="text-muted-foreground text-sm hover:text-foreground"
        >
          ← 租户卡时消费
        </LocaleLink>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">月度行详情</h1>
          {monthly.productLine === 'bare_metal' && monthly.hasAmortization ? (
            <Badge variant="secondary">有摊销</Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {monthly.usageMonth} · 租户 {monthly.tenantPlatformId} · {monthly.regionCode} ·{' '}
          {monthly.gpuModel} · {labelTenantRegionGpuProductLine(monthly.productLine)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>月行摘要</CardTitle>
          <CardDescription>
            来源：{monthly.source ? labelTenantRegionGpuSource(monthly.source) : '—'} · 租户{' '}
            {formatText(monthly.tenantName)} · 机房 {formatText(monthly.dataCenterName)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-muted-foreground text-xs">余额消费</p>
            <p className="text-lg font-semibold">{formatMoney(monthly.balanceConsumption)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">余额卡时</p>
            <p className="text-lg font-semibold">{formatMoney(monthly.balanceCardHours)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">总消费</p>
            <p className="text-lg font-semibold">{formatMoney(monthly.totalConsumption)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">总卡时</p>
            <p className="text-lg font-semibold">{formatMoney(monthly.totalCardHours)}</p>
          </div>
        </CardContent>
      </Card>

      {monthly.productLine === 'bare_metal' ? (
        <Card>
          <CardHeader>
            <CardTitle>原订单信息</CardTitle>
            <CardDescription>
              与本月行键（租户 × 区域 × GPU）匹配的裸金属订单设备；跨月订单按租期重叠比例摊销入月
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单号</TableHead>
                  <TableHead>设备型号</TableHead>
                  <TableHead className="text-right">GPU数</TableHead>
                  <TableHead>租期</TableHead>
                  <TableHead className="text-right">总时长(h)</TableHead>
                  <TableHead className="text-right">本月重叠(h)</TableHead>
                  <TableHead className="text-right">摊销比例</TableHead>
                  <TableHead>摊销</TableHead>
                  <TableHead className="text-right">行金额</TableHead>
                  <TableHead className="text-right">摊销前余额消费</TableHead>
                  <TableHead className="text-right">摊销后余额消费</TableHead>
                  <TableHead className="text-right">摊销前余额卡时</TableHead>
                  <TableHead className="text-right">摊销后余额卡时</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bareMetalOrderLines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center text-muted-foreground">
                      未匹配到本月相交的裸金属订单设备
                    </TableCell>
                  </TableRow>
                ) : (
                  bareMetalOrderLines.map((line) => (
                    <TableRow key={`${line.orderId}-${line.rentStartsAt}-${line.deviceModelText}`}>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {line.orderNo ?? line.platformOrderId ?? line.orderId}
                      </TableCell>
                      <TableCell>{formatText(line.deviceModelText ?? line.gpuModel)}</TableCell>
                      <TableCell className="text-right">{line.gpuCount}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDateTime(line.rentStartsAt)}
                        <br />
                        ~ {formatDateTime(line.rentEndsAt)}
                      </TableCell>
                      <TableCell className="text-right">{formatMoney(String(line.totalHours))}</TableCell>
                      <TableCell className="text-right">
                        {formatMoney(String(line.overlapHours))}
                      </TableCell>
                      <TableCell className="text-right">
                        {(line.amortRatio * 100).toFixed(2)}%
                      </TableCell>
                      <TableCell>
                        {line.hasAmortization ? (
                          <Badge variant="secondary">有摊销</Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatMoney(line.lineAmount)}</TableCell>
                      <TableCell className="text-right">
                        {formatMoney(line.preAmortBalanceConsumption)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(line.amortBalanceConsumption)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(line.preAmortBalanceCardHours)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMoney(line.amortBalanceCardHours)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>对账</CardTitle>
              <CardDescription>
                比较月行与同键日明细合计（只读，不写库）· 日明细 {reconciliation.dailyRowCount} 行
              </CardDescription>
            </div>
            {reconciliation.showPrimaryStatus ? (
              <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
            ) : (
              <Badge variant="secondary">当前筛选非月行产品线，仅供参考</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>指标</TableHead>
                <TableHead className="text-right">月行</TableHead>
                <TableHead className="text-right">日合计</TableHead>
                <TableHead className="text-right">差额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <MetricCompareRow
                label="余额消费"
                monthly={reconciliation.monthlyMetrics.balanceConsumption}
                daily={reconciliation.dailySumMetrics?.balanceConsumption ?? null}
                delta={reconciliation.deltaMetrics?.balanceConsumption ?? null}
              />
              <MetricCompareRow
                label="余额卡时"
                monthly={reconciliation.monthlyMetrics.balanceCardHours}
                daily={reconciliation.dailySumMetrics?.balanceCardHours ?? null}
                delta={reconciliation.deltaMetrics?.balanceCardHours ?? null}
              />
              <MetricCompareRow
                label="总消费"
                monthly={reconciliation.monthlyMetrics.totalConsumption}
                daily={reconciliation.dailySumMetrics?.totalConsumption ?? null}
                delta={reconciliation.deltaMetrics?.totalConsumption ?? null}
              />
              <MetricCompareRow
                label="总卡时"
                monthly={reconciliation.monthlyMetrics.totalCardHours}
                daily={reconciliation.dailySumMetrics?.totalCardHours ?? null}
                delta={reconciliation.deltaMetrics?.totalCardHours ?? null}
              />
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>日明细</CardTitle>
              <CardDescription>
                同租户、同月、同区域、同 GPU；可按产品线过滤
              </CardDescription>
            </div>
            <div className="grid w-full gap-2 sm:w-56">
              <Label htmlFor="daily-pl-filter">产品线</Label>
              <Select
                value={dailyProductLineFilter}
                onValueChange={(v) => {
                  setDailyProductLineFilter(v)
                  setDailyPage(1)
                }}
              >
                <SelectTrigger id="daily-pl-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="row_default">
                    月行产品线（{labelTenantRegionGpuProductLine(monthly.productLine)}）
                  </SelectItem>
                  <SelectItem value="all">全部产品线</SelectItem>
                  {TENANT_REGION_GPU_PRODUCT_LINES.filter((pl) => pl !== monthly.productLine).map(
                    (pl) => (
                      <SelectItem key={pl} value={pl}>
                        {labelTenantRegionGpuProductLine(pl)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead>产品线</TableHead>
                <TableHead>来源</TableHead>
                <TableHead className="text-right">余额消费</TableHead>
                <TableHead className="text-right">余额卡时</TableHead>
                <TableHead className="text-right">总消费</TableHead>
                <TableHead className="text-right">总卡时</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.dailyRows.rows ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    当前筛选下无日明细
                  </TableCell>
                </TableRow>
              ) : (
                data?.dailyRows.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.usageDate}</TableCell>
                    <TableCell>{labelTenantRegionGpuProductLine(row.productLine)}</TableCell>
                    <TableCell>
                      {row.source ? labelTenantRegionGpuSource(row.source) : '—'}
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(row.balanceConsumption)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.balanceCardHours)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.totalConsumption)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.totalCardHours)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <ListPagination
            page={dailyPage}
            totalPages={Math.max(1, Math.ceil((data?.dailyRows.total ?? 0) / PAGE_SIZE))}
            totalItems={data?.dailyRows.total ?? 0}
            pageSize={PAGE_SIZE}
            onPageChange={setDailyPage}
          />
        </CardContent>
      </Card>
    </div>
  )
}
