'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  FileSpreadsheet,
  Gauge,
  Search,
  ShieldCheck,
  ShieldX,
} from 'lucide-react'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import {
  currentSlaMonth,
  formatSlaMonthOption,
  listRecentSlaMonths,
} from '@/lib/types/sla'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent } from '@workspace/ui/components/card'
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
import { cn } from '@workspace/ui/lib/utils'
import {
  formatAvailabilityRate,
  formatCount,
  formatMonthLabel,
  SLA_RATE_FORMULA_LABEL,
  SLA_TARGET_AVAILABILITY,
} from '../_lib/format-sla'
import { SlaAvailabilityBadge, SlaFaultRankChart, SlaOverviewChart } from './sla-overview-chart'
import { SlaBitableSyncDialog } from './sla-bitable-sync-dialog'

function SummaryCard({
  title,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  title: string
  value: string
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  accent: string
}) {
  return (
    <Card className={cn('border-l-4', accent)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tabular-nums tracking-tight">{value}</p>
            {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
          </div>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/60">
            <Icon className="size-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function SlaOverviewContent() {
  const [slaMonth, setSlaMonth] = useState(currentSlaMonth())
  const [search, setSearch] = useState('')
  const [bitableOpen, setBitableOpen] = useState(false)

  const monthsQuery = trpc.supplier.sla.listMonths.useQuery(undefined, { retry: false })
  const overviewQuery = trpc.supplier.sla.getOverview.useQuery({ slaMonth }, { retry: false })

  const monthOptions = useMemo(() => {
    const months = monthsQuery.data?.length ? monthsQuery.data : listRecentSlaMonths()
    return months.map(formatSlaMonthOption)
  }, [monthsQuery.data])

  const rows = overviewQuery.data?.rows ?? []

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.dataCenterName.toLowerCase().includes(q) ||
        r.dataCenterCode.toLowerCase().includes(q) ||
        r.supplierName.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q),
    )
  }, [rows, search])

  const summary = useMemo(() => {
    const withRollup = rows.filter((r) => r.hasRollup)
    const metCount = withRollup.filter((r) => r.slaMet).length
    const totalFaults = rows.reduce((s, r) => s + r.newFaultCount, 0)
    const carryover = rows.reduce((s, r) => s + r.carryoverFaultCountEnd, 0)
    const supplySum = withRollup.reduce((s, r) => s + r.totalSupplyCardHours, 0)
    const weightedSla =
      supplySum > 0
        ? withRollup.reduce((s, r) => s + (r.faultSlaRate ?? 0) * r.totalSupplyCardHours, 0) /
          supplySum
        : null
    return {
      metCount,
      totalFaults,
      carryover,
      weightedSla,
      total: rows.length,
      rollupCount: withRollup.length,
    }
  }, [rows])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">机房 SLA</h1>
          <p className="text-muted-foreground">
            合作机房合同 SLA 与故障监控111 · SLA = {SLA_RATE_FORMULA_LABEL}
          </p>
          <p className="text-xs text-muted-foreground">
            SLA 目标 {formatAvailabilityRate(SLA_TARGET_AVAILABILITY)} · 统计月{' '}
            {formatMonthLabel(slaMonth)} · 已汇总 {summary.rollupCount}/{summary.total} 机房
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={slaMonth} onValueChange={setSlaMonth}>
            <SelectTrigger className="w-[11rem]">
              <SelectValue placeholder="选择统计月" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setBitableOpen(true)}>
            <FileSpreadsheet className="mr-2 size-4" />
            飞书多维表格同步
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="合作机房"
          value={formatCount(summary.total)}
          sub="cooperation_status = active"
          icon={Building2}
          accent="border-l-indigo-500"
        />
        <SummaryCard
          title="SLA 达标"
          value={`${summary.metCount} / ${summary.rollupCount}`}
          sub={
            summary.rollupCount > 0
              ? `达标率 ${((summary.metCount / summary.rollupCount) * 100).toFixed(0)}%`
              : '暂无月汇总'
          }
          icon={ShieldCheck}
          accent="border-l-emerald-500"
        />
        <SummaryCard
          title="加权 SLA"
          value={formatAvailabilityRate(summary.weightedSla)}
          sub="按供给卡时加权（仅已汇总）"
          icon={Gauge}
          accent="border-l-violet-500"
        />
        <SummaryCard
          title="月新增故障"
          value={formatCount(summary.totalFaults)}
          sub={`遗留 ${formatCount(summary.carryover)} 起`}
          icon={AlertTriangle}
          accent="border-l-amber-500"
        />
      </div>

      <SlaOverviewChart rows={rows.filter((r) => r.hasRollup)} />

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">机房列表</h2>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="搜索机房 / 供应商..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>机房</TableHead>
                    <TableHead>供应商</TableHead>
                    <TableHead className="text-right">SLA</TableHead>
                    <TableHead className="text-center">状态</TableHead>
                    <TableHead className="text-right">新增故障</TableHead>
                    <TableHead className="text-right">遗留故障</TableHead>
                    <TableHead className="text-right">新增设备故障</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overviewQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        加载中…
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        暂无合作机房
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((row) => (
                      <TableRow key={row.dataCenterId} className="group">
                        <TableCell>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{row.dataCenterName}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.dataCenterCode} · {row.location}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{row.supplierName}</TableCell>
                        <TableCell className="text-right">
                          <SlaAvailabilityBadge rate={row.faultSlaRate} />
                        </TableCell>
                        <TableCell className="text-center">
                          {!row.hasRollup ? (
                            <Badge variant="outline">未汇总</Badge>
                          ) : row.slaMet ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            >
                              <ShieldCheck className="mr-1 size-3" />
                              达标
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                            >
                              <ShieldX className="mr-1 size-3" />
                              未达标
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatCount(row.newFaultCount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCount(row.carryoverFaultCountEnd)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCount(row.newFaultDeviceCount)}
                        </TableCell>
                        <TableCell>
                          <LocaleLink
                            href={`/supplier/sla/${row.dataCenterId}`}
                            className="inline-flex items-center text-sm text-primary opacity-70 transition-opacity group-hover:opacity-100"
                          >
                            详情
                            <ChevronRight className="size-4" />
                          </LocaleLink>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-2">
          <SlaFaultRankChart rows={rows.filter((r) => r.hasRollup)} />
        </div>
      </div>

      <SlaBitableSyncDialog open={bitableOpen} onOpenChange={setBitableOpen} />
    </div>
  )
}
