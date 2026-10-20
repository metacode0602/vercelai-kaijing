'use client'

import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Building2,
  ChevronRight,
  FileBarChart,
  Percent,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'

import { formatMoney } from '@/app/[locale]/(protected)/finance/_lib/display'
import { Badge } from '@workspace/ui/components/badge'
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
  avgPerCustomer,
  formatPercent,
  formatRate,
  formatReportCount,
  formatReportMoney,
  grossMargin,
} from '../_lib/format-report'
import { trpc } from '@/lib/trpc/client'
import type { MomMetric, MonthlyReport } from '@/lib/server/dataaccess/finance/monthly-report'

const STATUS_LABEL: Record<MonthlyReport['billingStatus'], string> = {
  published: '已发布',
  computed: '已计算',
  draft: '草稿',
}

const STATUS_CLASS: Record<MonthlyReport['billingStatus'], string> = {
  published: 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300',
  computed: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  draft: 'border-muted-foreground/30 text-muted-foreground',
}

function MomBadge({ metric, suffix = '' }: { metric: MomMetric; suffix?: string }) {
  if (metric.momPercent == null) {
    return <span className="text-xs text-muted-foreground">环比 —</span>
  }

  const up = metric.momPercent >= 0
  const Icon = up ? TrendingUp : TrendingDown

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium',
        up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
      )}
    >
      <Icon className="size-3" />
      {formatPercent(metric.momPercent)}
      {suffix}
    </span>
  )
}

function MetricCard({
  title,
  value,
  metric,
  icon: Icon,
  accent,
  sub,
}: {
  title: string
  value: string
  metric?: MomMetric
  icon: React.ComponentType<{ className?: string }>
  accent: string
  sub?: string
}) {
  return (
    <Card className={cn('border-l-4', accent)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tabular-nums tracking-tight">{value}</p>
            {metric ? <MomBadge metric={metric} suffix=" MoM" /> : null}
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

function FunnelStep({
  label,
  metric,
  rate,
}: {
  label: string
  metric: MomMetric
  rate?: string
}) {
  return (
    <div className="flex min-w-[8.5rem] flex-1 flex-col items-center gap-2 rounded-lg border bg-card p-4 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold tabular-nums">{formatReportCount(metric.value)}</p>
      <MomBadge metric={metric} />
      {rate ? <p className="text-xs text-muted-foreground">转化率 {rate}</p> : null}
    </div>
  )
}

export function OperationalMonthlyReportContent() {
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null)

  const periodOptionsQuery = trpc.finance.monthlyReport.periodOptions.useQuery()
  const periodOptions = useMemo(() => periodOptionsQuery.data ?? [], [periodOptionsQuery.data])

  // 未选择时默认最新账期，避免把 2026-05 之类的假账期写死在前端
  const periodCode = selectedPeriod ?? periodOptions[0]?.periodCode ?? null

  const reportQuery = trpc.finance.monthlyReport.get.useQuery(
    { periodCode: periodCode ?? '' },
    { enabled: periodCode !== null },
  )

  const productLineRows = useMemo(
    () => (reportQuery.data?.productLines ?? []).filter((row) => row.total > 0),
    [reportQuery.data],
  )

  if (periodOptionsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">加载账期列表…</p>
  }

  if (periodOptions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        暂无账期数据，请先在财务账期页面创建并计算账期。
      </p>
    )
  }

  if (reportQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">加载月报数据…</p>
  }

  if (reportQuery.error) {
    return (
      <p className="text-sm text-destructive">月报加载失败：{reportQuery.error.message}</p>
    )
  }

  const report = reportQuery.data
  if (!report) return null

  const isPreview = report.billingStatus !== 'published'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">运营月报</h1>
            <Badge variant="outline" className={STATUS_CLASS[report.billingStatus]}>
              {STATUS_LABEL[report.billingStatus]}
            </Badge>
            {isPreview ? (
              <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                预览版
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground">
            {report.periodLabel}经营复盘 · 首期聚焦 B 端漏斗、新客/老客经营、平台整体与产品线矩阵
          </p>
          {report.publishedAt ? (
            <p className="text-xs text-muted-foreground">账期发布时间：{report.publishedAt}</p>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              账期未发布，消耗为同步预览口径，毛利待月结
            </p>
          )}
        </div>

        <Select value={periodCode ?? undefined} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-[11rem]">
            <SelectValue placeholder="选择统计月" />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map((option) => (
              <SelectItem key={option.periodCode} value={option.periodCode}>
                {option.label}
                {option.status !== 'published' ? '（未发布）' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* T3 平台整体 */}
      <section className="space-y-3">
        <SectionHeading
          title="T3 · 平台整体经营"
          description="全平台充值、消耗、毛利及结构拆解"
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="平台充值"
            value={`¥ ${formatReportMoney(report.platform.recharge.value)}`}
            metric={report.platform.recharge}
            icon={Wallet}
            accent="border-l-emerald-500"
            sub={`${report.platform.rechargeTenantCount} 个充值租户`}
          />
          <MetricCard
            title="平台消耗"
            value={`¥ ${formatReportMoney(report.platform.consumption.value)}`}
            metric={report.platform.consumption}
            icon={FileBarChart}
            accent="border-l-blue-500"
            sub={`${report.platform.consumptionTenantCount} 个消耗租户`}
          />
          <MetricCard
            title="平台毛利"
            value={
              isPreview && report.platform.grossProfit.value === 0
                ? '待月结'
                : `¥ ${formatReportMoney(report.platform.grossProfit.value)}`
            }
            metric={isPreview ? undefined : report.platform.grossProfit}
            icon={TrendingUp}
            accent="border-l-violet-500"
          />
          <MetricCard
            title="平台毛利率"
            value={
              // 毛利为 null 表示账期尚未月结完成（incomeTotal 为 0），此时无毛利率可言
              report.platform.grossMarginPercent === null ||
              (isPreview && report.platform.grossMarginPercent === 0)
                ? '—'
                : `${report.platform.grossMarginPercent.toFixed(1)}%`
            }
            icon={Percent}
            accent="border-l-amber-500"
            sub={`企业 ¥${formatMoney(String(report.platform.enterpriseConsumption))} · 个人 ¥${formatMoney(String(report.platform.personalConsumption))}`}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">消耗结构</CardTitle>
              <CardDescription>企业 vs 个人 · 弹性 vs 裸金属</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <StructureRow
                label="企业消耗"
                value={report.platform.enterpriseConsumption}
                total={report.platform.consumption.value}
              />
              <StructureRow
                label="个人消耗"
                value={report.platform.personalConsumption}
                total={report.platform.consumption.value}
              />
              <StructureRow
                label="弹性算力"
                value={report.platform.balanceConsumption}
                total={report.platform.consumption.value}
              />
              <StructureRow
                label="裸金属"
                value={report.platform.baremetalConsumption}
                total={report.platform.consumption.value}
              />
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">口径说明</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>消耗、毛利以已发布账期为准；充值以 paid 状态净额统计。</p>
              <p>
                老客：项目标签含「平台老客」或「中台直客」；新客：含「销售新客」且不含上述老客标签。
              </p>
              <p>
                平台消耗 / 毛利取账期派生层（platform_income_monthly、
                billing_period.total_gross_profit）；分客毛利取 project_monthly_cost_snapshot。
              </p>
              <p>漏斗口径复用经营看板，与看板数值一致。</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* T1 漏斗 */}
      <section className="space-y-3">
        <SectionHeading
          title="T1 · B 端客户漏斗"
          description="当月新增注册 → 测试通过 → 转正（含 MoM）"
        />
        <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
          <FunnelStep label="新增注册" metric={report.funnel.newRegistrations} />
          <FunnelArrow rate={formatRate(report.funnel.registrationToTestRate)} />
          <FunnelStep
            label="测试通过"
            metric={report.funnel.testPassed}
            rate={formatRate(report.funnel.testToConversionRate)}
          />
          <FunnelArrow />
          <FunnelStep label="转正（客户）" metric={report.funnel.conversionsCustomer} />
          <FunnelArrow />
          <FunnelStep label="转正（项目）" metric={report.funnel.conversionsProject} />
        </div>
        <p className="text-xs text-muted-foreground">
          辅助：测试中 → 转正项目 {formatReportCount(report.funnel.testingToConverted.value)} 个
          {report.funnel.testingToConverted.momPercent != null
            ? `（${formatPercent(report.funnel.testingToConverted.momPercent)} MoM）`
            : ''}
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* T2 新客/老客 */}
        <section className="space-y-3">
          <SectionHeading
            title="T2 · B 端新客 / 老客"
            description="充值、消耗、毛利按项目标签拆分"
          />
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>客群</TableHead>
                    <TableHead className="text-right">充值</TableHead>
                    <TableHead className="text-right">消耗</TableHead>
                    <TableHead className="text-right">毛利</TableHead>
                    <TableHead className="text-right">毛利率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.customerSegments.map((row) => (
                    <TableRow
                      key={row.key}
                      className={row.key === 'total' ? 'bg-muted/40 font-medium' : undefined}
                    >
                      <TableCell>{row.label}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatReportMoney(row.recharge)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatReportMoney(row.consumption)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {isPreview && row.grossProfit === 0 && row.key !== 'total'
                          ? '待月结'
                          : formatReportMoney(row.grossProfit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {isPreview && row.grossProfit === 0
                          ? '—'
                          : grossMargin(row.consumption, row.grossProfit)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">客户数 & 客均</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>客群</TableHead>
                    <TableHead className="text-right">充值客户</TableHead>
                    <TableHead className="text-right">消耗客户</TableHead>
                    <TableHead className="text-right">客均消耗</TableHead>
                    <TableHead className="text-right">客均毛利</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.customerSegments
                    .filter((row) => row.key !== 'total')
                    .map((row) => (
                      <TableRow key={row.key}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.rechargeCustomers}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.consumptionCustomers}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {avgPerCustomer(row.consumption, row.consumptionCustomers)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {isPreview && row.grossProfit === 0
                            ? '—'
                            : avgPerCustomer(row.grossProfit, row.consumptionCustomers)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>

        {/* T4 产品线矩阵 */}
        <section className="space-y-3">
          <SectionHeading
            title="T4 · 产品线 × 客群"
            description="B 端按产品线消耗，区分新客 / 老客 / 未分类"
          />
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>产品线</TableHead>
                    <TableHead className="text-right">新客</TableHead>
                    <TableHead className="text-right">老客</TableHead>
                    <TableHead className="text-right">未分类</TableHead>
                    <TableHead className="text-right">合计</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productLineRows.map((row) => (
                    <TableRow key={row.productLine}>
                      <TableCell className="font-medium">{row.productLine}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatReportMoney(row.newCustomer)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatReportMoney(row.oldCustomer)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatReportMoney(row.unclassified)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatReportMoney(row.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-medium">
                    <TableCell>合计</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatReportMoney(
                        productLineRows.reduce((sum, row) => sum + row.newCustomer, 0),
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatReportMoney(
                        productLineRows.reduce((sum, row) => sum + row.oldCustomer, 0),
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatReportMoney(
                        productLineRows.reduce((sum, row) => sum + row.unclassified, 0),
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatReportMoney(
                        productLineRows.reduce((sum, row) => sum + row.total, 0),
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">产品线卡时（弹性算力）</CardTitle>
              <CardDescription>
              成本侧卡时按机房 / 卡型核算，尚无产品线维度，卡时暂不可用
            </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {productLineRows
                .filter((row) => row.cardHours !== null)
                .map((row) => (
                  <div
                    key={row.productLine}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">{row.productLine}</span>
                    <span className="font-mono tabular-nums">
                      {formatReportCount(row.cardHours ?? 0)} 卡时
                    </span>
                  </div>
                ))}
            </CardContent>
          </Card>
        </section>
      </div>

      <Card className="border-dashed bg-muted/20">
        <CardContent className="flex flex-wrap items-center gap-4 p-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <UserPlus className="size-4" />
            漏斗口径：CRM 客户建档 / test_completed_on / conversion_date
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-4" />
            客群口径：project_tag_assignment
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="size-4" />
            详见 content/design/reports/operational-monthly-report-p0-metrics.md
          </span>
        </CardContent>
      </Card>
    </div>
  )
}

function SectionHeading({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function StructureRow({
  label,
  value,
  total,
}: {
  label: string
  value: number
  total: number
}) {
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        ¥ {formatReportMoney(value)}{' '}
        <span className="text-muted-foreground">({pct}%)</span>
      </span>
    </div>
  )
}

function FunnelArrow({ rate }: { rate?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 px-1 text-muted-foreground lg:py-8">
      <ChevronRight className="hidden size-5 lg:block" />
      <ArrowRight className="size-5 rotate-90 lg:hidden" />
      {rate ? <span className="text-[10px]">{rate}</span> : null}
    </div>
  )
}
