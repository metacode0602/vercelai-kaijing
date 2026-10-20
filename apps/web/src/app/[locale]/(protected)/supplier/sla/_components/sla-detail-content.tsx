'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  FileBarChart,
  Gauge,
  Pencil,
  Percent,
  ShieldCheck,
  ShieldX,
  Trash2,
  Wallet,
} from 'lucide-react'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import {
  currentSlaMonth,
  formatSlaMonthOption,
  listRecentSlaMonths,
  type SlaDatacenterMonthlyDetail,
} from '@/lib/types/sla'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
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
  CARD_HOUR_TERM_CONTRACT,
  CARD_HOUR_TERM_SUPPLY,
} from '../_lib/card-hour-terms'
import {
  DEVICE_SLA_TARGET,
  formatAvailabilityRate,
  formatCardHours,
  formatCompensationTier,
  formatCount,
  formatMoneyPrecise,
  formatMonthLabel,
  formatSlaPercent,
  SLA_RATE_FORMULA_LABEL,
} from '../_lib/format-sla'
import { SlaDailyTrendChart, SlaFaultCardHoursChart } from './sla-detail-charts'
import { SlaReportDialog } from './sla-report-dialog'

function MetricCard({
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
            <p className="text-xl font-bold tabular-nums tracking-tight">{value}</p>
            {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
          </div>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60">
            <Icon className="size-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-0.5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  )
}

function CardHourGlossary({ detail }: { detail: SlaDatacenterMonthlyDetail }) {
  const items = [
    { term: CARD_HOUR_TERM_CONTRACT, value: detail.contractCardHours },
    { term: CARD_HOUR_TERM_SUPPLY, value: detail.totalSupplyCardHours },
  ] as const

  return (
    <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
      <p className="mb-2 font-medium text-foreground">卡时口径说明</p>
      <ul className="space-y-2">
        {items.map(({ term, value }) => (
          <li key={term.label}>
            <p>
              <span className="font-medium text-foreground">{term.label}</span>
              {' · '}
              {term.definition}
            </p>
            <p className="mt-0.5">
              公式：{term.formula}
              {' · '}
              本月 {formatCardHours(value)}
              {'usedBy' in term && term.usedBy ? (
                <> · 用于 {term.usedBy.join('、')}</>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2 border-t border-dashed pt-2">
        <strong className="text-foreground">统一口径</strong>：SLA、闲置率、浪费率均以
        <strong className="text-foreground">供给卡时</strong>为分母；可用率分子亦为供给卡时。
      </p>
    </div>
  )
}

function FaultSlaBadge({ rate }: { rate: number | null }) {
  if (rate == null) return <span className="text-muted-foreground">—</span>
  const met = rate >= DEVICE_SLA_TARGET
  return (
    <span
      className={
        met
          ? 'font-semibold text-emerald-600 dark:text-emerald-400'
          : 'font-semibold text-rose-600 dark:text-rose-400'
      }
    >
      {formatAvailabilityRate(rate)}
    </span>
  )
}

function DeviceMonthlySlaTable({ detail }: { detail: SlaDatacenterMonthlyDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>单实例月度 SLA</CardTitle>
        <CardDescription>
          单设备月度 SLA · {SLA_RATE_FORMULA_LABEL} · 目标{' '}
          {formatAvailabilityRate(DEVICE_SLA_TARGET)}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>设备</TableHead>
              <TableHead>卡型</TableHead>
              <TableHead className="text-right">供给卡时</TableHead>
              <TableHead className="text-right">故障卡时</TableHead>
              <TableHead className="text-right">SLA</TableHead>
              <TableHead className="text-center">达标</TableHead>
              <TableHead className="text-right">服务费</TableHead>
              <TableHead className="text-right">赔偿梯度</TableHead>
              <TableHead className="text-right">赔偿金额</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.devices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-20 text-center text-muted-foreground">
                  暂无设备 SLA 数据
                </TableCell>
              </TableRow>
            ) : (
              detail.devices.map((row) => (
                <TableRow key={row.deviceId}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{row.deviceAssetNo}</p>
                      <p className="text-xs text-muted-foreground">{row.deviceSn}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.gpuCardTypeName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCardHours(row.supplyCardHours)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCardHours(row.faultCardHours)}
                  </TableCell>
                  <TableCell className="text-right">
                    <FaultSlaBadge rate={row.faultSlaRate} />
                  </TableCell>
                  <TableCell className="text-center">
                    {row.slaMet ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                      >
                        达标
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-rose-500/40 text-rose-700 dark:text-rose-300"
                      >
                        未达标
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoneyPrecise(row.serviceFee)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompensationTier(row.compensationTier)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatMoneyPrecise(row.compensationAmount)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function SlaDetailContent({ dataCenterId }: { dataCenterId: string }) {
  const [slaMonth, setSlaMonth] = useState(currentSlaMonth())
  const [reportOpen, setReportOpen] = useState(false)

  const monthsQuery = trpc.supplier.sla.listMonths.useQuery(undefined, { retry: false })
  const detailQuery = trpc.supplier.sla.getDatacenterDetail.useQuery(
    { dataCenterId, slaMonth },
    { retry: false },
  )
  const reportQuery = trpc.supplier.sla.getMonthlyReport.useQuery(
    { dataCenterId, slaMonth },
    { enabled: reportOpen, retry: false },
  )

  const monthOptions = useMemo(() => {
    const months = monthsQuery.data?.length ? monthsQuery.data : listRecentSlaMonths()
    return months.map(formatSlaMonthOption)
  }, [monthsQuery.data])

  const detail = detailQuery.data?.detail ?? null
  const report = reportQuery.data?.report ?? null

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <LocaleLink
          href="/supplier/sla"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          返回 SLA 概览
        </LocaleLink>
        <p className="text-muted-foreground">加载中…</p>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <LocaleLink
          href="/supplier/sla"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          返回 SLA 概览
        </LocaleLink>
        <p className="text-muted-foreground">未找到该机房 SLA 数据</p>
      </div>
    )
  }

  const compensationHref = `/supplier/sla/${dataCenterId}/compensation?month=${encodeURIComponent(slaMonth)}`

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <LocaleLink
            href="/supplier/sla"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            返回 SLA 概览
          </LocaleLink>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{detail.dataCenterName}</h1>
              {detail.hasRollup ? (
                detail.slaMet ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  >
                    <ShieldCheck className="mr-1 size-3" />
                    SLA 达标
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                  >
                    <ShieldX className="mr-1 size-3" />
                    SLA 未达标
                  </Badge>
                )
              ) : (
                <Badge variant="outline">未汇总</Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {detail.dataCenterCode} · {detail.supplierName} · {detail.location}
            </p>
            <p className="text-xs text-muted-foreground">
              汇总时间 {detail.rollupAt ?? '—'} · 合同 SLA 目标{' '}
              {formatAvailabilityRate(DEVICE_SLA_TARGET)}
            </p>
          </div>
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
          <Button onClick={() => setReportOpen(true)} disabled={!detail.hasRollup}>
            <FileBarChart className="mr-2 size-4" />
            生成 SLA 报告
          </Button>
          <Button variant="outline" asChild>
            <LocaleLink href={compensationHref} className="inline-flex items-center">
              <Pencil className="mr-2 size-4" />
              赔偿编辑
            </LocaleLink>
          </Button>
        </div>
      </div>

      {!detail.hasRollup ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          本月尚未汇总，请先运行日切/月切或等待定时任务
        </div>
      ) : null}

      <div className="rounded-lg border bg-muted/30 px-4 py-3">
        <p className="text-sm font-medium">{formatMonthLabel(detail.slaMonth)} 合同 SLA</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">
          <FaultSlaBadge rate={detail.faultSlaRate} />
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          SLA = {SLA_RATE_FORMULA_LABEL} · 供给 {formatCardHours(detail.totalSupplyCardHours)} · 故障{' '}
          {formatCardHours(detail.externalFaultCardHours)}
        </p>
      </div>

      <section className="space-y-3">
        <SectionTitle
          title="核心指标"
          description={`${formatMonthLabel(detail.slaMonth)} · 合同 SLA 与运营指标`}
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            title="故障次数"
            value={formatCount(detail.newFaultCount)}
            sub={`遗留 ${formatCount(detail.carryoverFaultCountEnd)} · 设备 ${formatCount(detail.newFaultDeviceCount)}`}
            icon={AlertTriangle}
            accent="border-l-rose-500"
          />
          <MetricCard
            title="可用率"
            value={formatAvailabilityRate(detail.supplyAvailabilityRate)}
            sub={`供给卡时 / 合同卡时 · 供给 ${formatCardHours(detail.totalSupplyCardHours)} · 损耗 ${formatCardHours(detail.onboardingLossCardHours)}`}
            icon={Gauge}
            accent="border-l-violet-500"
          />
          <MetricCard
            title="浪费率"
            value={formatSlaPercent(detail.wasteRateAvg)}
            sub={`浪费卡时 / 供给卡时 · 浪费 ${formatCardHours(detail.wasteCardHours)}`}
            icon={Trash2}
            accent="border-l-fuchsia-500"
          />
          <MetricCard
            title="闲置率"
            value={formatSlaPercent(detail.idleRateAvg)}
            sub={`闲置卡时 / 供给卡时 · 闲置 ${formatCardHours(detail.idleCardHours)}`}
            icon={Percent}
            accent="border-l-sky-500"
          />
          <MetricCard
            title="内部使用"
            value={formatCardHours(detail.internalUsageCardHours)}
            sub="内部占用卡时"
            icon={Wallet}
            accent="border-l-teal-500"
          />
        </div>
      </section>

      {detail.hasRollup ? (
        <>
          <SlaDailyTrendChart points={detail.dailyTrend} slaMonth={detail.slaMonth} />

          <div className="grid gap-6 lg:grid-cols-2">
            <SlaFaultCardHoursChart points={detail.dailyTrend} />
            <Card>
              <CardHeader>
                <CardTitle>卡型 SLA 汇总</CardTitle>
                <CardDescription>按卡型聚合 · {SLA_RATE_FORMULA_LABEL}</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>卡型</TableHead>
                      <TableHead className="text-right">供给卡时</TableHead>
                      <TableHead className="text-right">故障卡时</TableHead>
                      <TableHead className="text-right">SLA</TableHead>
                      <TableHead className="text-center">达标</TableHead>
                      <TableHead className="text-right">新增故障</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.cardTypes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                          暂无卡型汇总
                        </TableCell>
                      </TableRow>
                    ) : (
                      detail.cardTypes.map((row) => (
                        <TableRow key={row.gpuCardTypeId}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{row.gpuCardTypeName}</p>
                              <p className="text-xs text-muted-foreground">{row.gpuCardTypeCode}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCardHours(row.totalSupplyCardHours)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCardHours(row.externalFaultCardHours)}
                          </TableCell>
                          <TableCell className="text-right">
                            <FaultSlaBadge rate={row.faultSlaRate} />
                          </TableCell>
                          <TableCell className="text-center">
                            {row.slaMet ? (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                              >
                                达标
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-rose-500/40 text-rose-700 dark:text-rose-300"
                              >
                                未达标
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCount(row.newFaultCount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <DeviceMonthlySlaTable detail={detail} />
        </>
      ) : null}

      <CardHourGlossary detail={detail} />
      <SlaReportDialog open={reportOpen} onOpenChange={setReportOpen} report={report} />
    </div>
  )
}
