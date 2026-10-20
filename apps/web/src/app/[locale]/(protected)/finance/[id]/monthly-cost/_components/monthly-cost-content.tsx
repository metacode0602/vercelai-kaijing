'use client'

import { useEffect, useMemo, useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { formatMoney } from '@/app/[locale]/(protected)/finance/_lib/display'
import { LocaleLink } from '@/lib/i18n/navigation'
import {
  downloadMonthlyCostAmExcel,
  downloadMonthlyCostDeptExcel,
  downloadMonthlyCostWorkbookExcel,
} from '@/lib/finance/monthly-cost-export'
import {
  DEFAULT_MONTHLY_COST_BRANCH,
  MONTHLY_COST_BRANCHES,
  MONTHLY_COST_BRANCH_LABELS,
  MONTHLY_COST_DEPT_MARKETING,
  MONTHLY_COST_DEPT_MIDDLE,
  type MonthlyCostBranch,
} from '@/lib/monthly-cost/constants'
import {
  OPPORTUNITY_SOURCE_LABELS,
  type OpportunitySource,
} from '@/lib/crm/commission-constants'
import { usageMonthFromPeriodCode } from '@/lib/monthly-cost/period-utils'
import { ListPagination } from '@/components/shared/list-pagination'
import { Button } from '@workspace/ui/components/button'
import { Checkbox } from '@workspace/ui/components/checkbox'
import { Input } from '@workspace/ui/components/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import { Tabs, TabsList, TabsTrigger } from '@workspace/ui/components/tabs'
import { Download, Play, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@workspace/ui/components/alert-dialog'
import { MonthlyCostDeptWeightsPanel } from './monthly-cost-dept-weights-panel'
import { MonthlyCostAmCommissionDialog } from './monthly-cost-am-commission-dialog'
import { MonthlyCostDeptProjectTable } from './monthly-cost-dept-project-table'
import { MonthlyCostRunIssuesDialog } from './monthly-cost-run-issues-dialog'
import { Badge } from '@workspace/ui/components/badge'

const PAGE_SIZE = 20

const INCENTIVE_LABELS = ['新客', '老客'] as const
const OPPORTUNITY_SOURCES: OpportunitySource[] = [
  'marketing_sales',
  'sales_self',
  'exec_sales',
]

type MonthlyCostContentProps = {
  /** 从账期路由进入时锁定账期，不可切换 */
  lockedBillingPeriodId?: string
}

export function MonthlyCostContent({ lockedBillingPeriodId }: MonthlyCostContentProps = {}) {
  const isPeriodLocked = Boolean(lockedBillingPeriodId)
  const utils = trpc.useUtils()
  const { data: periods } = trpc.finance.periods.list.useQuery(undefined, {
    enabled: !isPeriodLocked,
  })
  const { data: lockedPeriod, isLoading: lockedPeriodLoading } =
    trpc.finance.periods.getById.useQuery(
      { id: lockedBillingPeriodId! },
      { enabled: isPeriodLocked },
    )
  const [billingPeriodId, setBillingPeriodId] = useState<string>(
    lockedBillingPeriodId ?? '',
  )
  const [usageMonth, setUsageMonth] = useState<string>('')
  const [costBranch, setCostBranch] = useState<MonthlyCostBranch>(DEFAULT_MONTHLY_COST_BRANCH)
  const [basePage, setBasePage] = useState(1)
  const [onlyWithProject, setOnlyWithProject] = useState(true)
  const [baseSearch, setBaseSearch] = useState('')
  const [baseSearchInput, setBaseSearchInput] = useState('')
  const [baseOpportunitySource, setBaseOpportunitySource] = useState<string>('all')
  const [baseDataCenterId, setBaseDataCenterId] = useState<string>('all')
  const [baseAccountManagerStaffId, setBaseAccountManagerStaffId] = useState<string>('all')
  const [exporting, setExporting] = useState<'base' | 'am' | 'dept' | null>(null)
  const [issuesDialogOpen, setIssuesDialogOpen] = useState(false)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [runErrorMessage, setRunErrorMessage] = useState<string | null>(null)
  const [selectedAmName, setSelectedAmName] = useState<string | null>(null)

  useEffect(() => {
    if (!lockedBillingPeriodId || !lockedPeriod) return
    setBillingPeriodId(lockedBillingPeriodId)
    try {
      setUsageMonth(usageMonthFromPeriodCode(lockedPeriod.period_code))
    } catch {
      setUsageMonth('')
    }
  }, [lockedBillingPeriodId, lockedPeriod])

  const selectedPeriod =
    lockedPeriod ?? periods?.find((p) => p.id === billingPeriodId)
  const periodCode = selectedPeriod?.period_code ?? usageMonth

  const { data: bundle, isLoading, refetch } = trpc.finance.monthlyCost.getBundle.useQuery(
    { billingPeriodId, usageMonth, costBranch },
    { enabled: Boolean(billingPeriodId && usageMonth) },
  )

  const baseLineFilters = useMemo(
    () => ({
      onlyWithProject,
      search: baseSearch || undefined,
      opportunitySource:
        baseOpportunitySource === 'all' ? undefined : baseOpportunitySource,
      dataCenterId: baseDataCenterId === 'all' ? undefined : baseDataCenterId,
      accountManagerStaffId:
        baseAccountManagerStaffId === 'all' ? undefined : baseAccountManagerStaffId,
    }),
    [
      onlyWithProject,
      baseSearch,
      baseOpportunitySource,
      baseDataCenterId,
      baseAccountManagerStaffId,
    ],
  )

  const {
    data: baseLinesPage,
    isLoading: baseLinesLoading,
    refetch: refetchBaseLines,
  } = trpc.finance.monthlyCost.listBaseLines.useQuery(
    {
      billingPeriodId,
      usageMonth,
      page: basePage,
      pageSize: PAGE_SIZE,
      ...baseLineFilters,
    },
    { enabled: Boolean(billingPeriodId && usageMonth && bundle?.run) },
  )

  const { data: baseFilterOptions } =
    trpc.finance.monthlyCost.listBaseLineFilterOptions.useQuery(
      { billingPeriodId, usageMonth },
      { enabled: Boolean(billingPeriodId && usageMonth && bundle?.run) },
    )

  const { data: runIssues } = trpc.finance.monthlyCost.listRunIssues.useQuery(
    { billingPeriodId, usageMonth },
    { enabled: Boolean(billingPeriodId && usageMonth && bundle?.run) },
  )

  const runBatch = trpc.finance.monthlyCost.run.useMutation({
    onSuccess: async (result) => {
      setRunErrorMessage(null)
      await utils.finance.monthlyCost.getBundle.invalidate({
        billingPeriodId,
        usageMonth,
        costBranch,
      })
      await utils.finance.monthlyCost.listRunIssues.invalidate({ billingPeriodId, usageMonth })
      await utils.finance.monthlyCost.listBaseLines.invalidate()
      const parts = [`跑批完成：${result.baseLineCount} 行基础数据`]
      if (result.warningCount > 0) parts.push(`${result.warningCount} 条警告`)
      if (result.errorCount > 0) parts.push(`${result.errorCount} 条错误`)
      toast.success(parts.join('，'))
      if (result.issueCount > 0) {
        setIssuesDialogOpen(true)
      }
      setBasePage(1)
      void refetch()
      void refetchBaseLines()
    },
    onError: (e) => {
      setRunErrorMessage(e.message)
      setIssuesDialogOpen(true)
      toast.error('跑批失败，请查看错误详情')
    },
  })

  const confirmCost = trpc.finance.monthlyCost.confirm.useMutation({
    onSuccess: async (result) => {
      setConfirmDialogOpen(false)
      await utils.finance.monthlyCost.getBundle.invalidate({
        billingPeriodId,
        usageMonth,
        costBranch,
      })
      await utils.finance.periods.list.invalidate()
      toast.success(
        `已确认固化：项目成本 ${formatMoney(result.projectCost)}，毛利 ${formatMoney(result.totalGrossProfit)}`,
      )
    },
    onError: (e) => {
      toast.error(e.message)
    },
  })

  const handleExportBase = async () => {
    if (!billingPeriodId || !usageMonth) return
    setExporting('base')
    try {
      const data = await utils.client.finance.monthlyCost.listExportBaseLines.query({
        billingPeriodId,
        usageMonth,
        ...baseLineFilters,
      })
      if (
        !downloadMonthlyCostWorkbookExcel({
          rows: data.rows,
          usageMonth,
          periodCode,
          costBranch,
        })
      ) {
        toast.error('无数据可导出')
      } else {
        toast.success(`已导出 ${data.rows.length} 行，含 8 个工作表`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导出失败')
    } finally {
      setExporting(null)
    }
  }

  const handleExportAm = () => {
    if (!bundle?.commissionLines.length) {
      toast.error('无客户经理提成数据')
      return
    }
    if (
      !downloadMonthlyCostAmExcel({
        lines: bundle.commissionLines,
        periodCode,
        costBranch,
      })
    ) {
      toast.error('导出失败')
      return
    }
    toast.success('已导出客户经理提成')
  }

  const handleExportDept = (dept: string) => {
    const lines = (bundle?.deptPoolProjectLines ?? []).filter((l) => l.recipient_dept === dept)
    if (lines.length === 0) {
      toast.error('无部门池项目数据')
      return
    }
    if (
      !downloadMonthlyCostDeptExcel({
        projectLines: lines,
        periodCode,
        costBranch,
      })
    ) {
      toast.error('导出失败')
      return
    }
    toast.success(`已导出${dept}部门池提成`)
  }

  const baseTotalPages = Math.max(
    1,
    Math.ceil((baseLinesPage?.total ?? 0) / PAGE_SIZE),
  )

  const handlePeriodChange = (id: string) => {
    setBillingPeriodId(id)
    setBasePage(1)
    const period = periods?.find((p) => p.id === id)
    if (period) {
      try {
        setUsageMonth(usageMonthFromPeriodCode(period.period_code))
      } catch {
        setUsageMonth('')
      }
    }
  }

  const amPivot = useMemo(() => {
    const byStaff = new Map<
      string,
      {
        name: string
        cells: Record<
          OpportunitySource,
          Record<(typeof INCENTIVE_LABELS)[number], number>
        >
      }
    >()

    for (const row of bundle?.commissionLines ?? []) {
      const source = row.opportunity_source as OpportunitySource
      const label = row.customer_incentive_label as (typeof INCENTIVE_LABELS)[number]
      if (!OPPORTUNITY_SOURCES.includes(source)) continue
      if (!INCENTIVE_LABELS.includes(label)) continue

      const key = row.account_manager_name
      const acc = byStaff.get(key) ?? {
        name: key,
        cells: {
          marketing_sales: { 新客: 0, 老客: 0 },
          sales_self: { 新客: 0, 老客: 0 },
          exec_sales: { 新客: 0, 老客: 0 },
        },
      }
      acc.cells[source][label] += Number(row.commission_amount) || 0
      byStaff.set(key, acc)
    }

    return [...byStaff.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }, [bundle?.commissionLines])

  const deptSections = useMemo(() => {
    return [MONTHLY_COST_DEPT_MIDDLE, MONTHLY_COST_DEPT_MARKETING].map((dept) => {
      const poolLines = (bundle?.deptPoolLines ?? []).filter((l) => l.recipient_dept === dept)
      const projectLines = (bundle?.deptPoolProjectLines ?? []).filter(
        (l) => l.recipient_dept === dept,
      )
      return { dept, poolLines, projectLines }
    })
  }, [bundle?.deptPoolLines, bundle?.deptPoolProjectLines])

  const projectMetricsMap = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<typeof bundle>['deptPoolProjectLines'][number]['metrics']
    >()
    for (const line of bundle?.deptPoolProjectLines ?? []) {
      if (!map.has(line.project_id)) {
        map.set(line.project_id, line.metrics)
      }
    }
    return map
  }, [bundle?.deptPoolProjectLines])

  const issueWarningCount = runIssues?.warningCount ?? bundle?.run?.warning_count ?? 0
  const issueErrorCount = runIssues?.errorCount ?? 0
  const isConfirmed = Boolean(bundle?.run?.confirmed_at)
  const isPublishedPeriod = selectedPeriod?.status === 'published'
  const canConfirm =
    Boolean(bundle?.run) &&
    !isConfirmed &&
    !isPublishedPeriod &&
    issueWarningCount === 0 &&
    issueErrorCount === 0 &&
    bundle?.run?.dept_distribution_status !== 'pending' &&
    !confirmCost.isPending

  if (isPeriodLocked && lockedPeriodLoading) {
    return (
      <div className="bg-background p-4 md:p-6">
        <p className="text-muted-foreground">加载中…</p>
      </div>
    )
  }

  if (isPeriodLocked && !lockedPeriod) {
    return (
      <div className="bg-background p-4 md:p-6">
        <p className="text-muted-foreground">未找到该账期。</p>
        <Button variant="link" asChild className="mt-2 px-0">
          <LocaleLink href="/finance">返回账期列表</LocaleLink>
        </Button>
      </div>
    )
  }

  return (
    <div className="bg-background space-y-6 p-4 md:p-6">
      {isPeriodLocked && selectedPeriod ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <LocaleLink href="/finance">← 账期列表</LocaleLink>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <LocaleLink href={`/finance/${selectedPeriod.id}/income`}>企业收入</LocaleLink>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <LocaleLink href={`/finance/${selectedPeriod.id}/personal`}>个人收入</LocaleLink>
          </Button>
        </div>
      ) : null}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          月度成本与提成
          {isPeriodLocked && selectedPeriod ? ` · ${selectedPeriod.period_code}` : ''}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          基于租户卡时月表自动核算双分支毛利与提成；核对后确认固化到账期正式数据。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>跑批</CardTitle>
          <CardDescription>
            {isPeriodLocked
              ? '当前账期已锁定，执行成本与提成计算'
              : '选择账期与结算月，执行成本与提成计算'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">账期</label>
            {isPeriodLocked ? (
              <p className="flex h-9 w-[200px] items-center rounded-md border bg-muted/40 px-3 text-sm font-medium">
                {selectedPeriod?.period_code ?? '—'}
              </p>
            ) : (
              <Select value={billingPeriodId} onValueChange={handlePeriodChange}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="选择账期" />
                </SelectTrigger>
                <SelectContent>
                  {(periods ?? [])
                    .filter((p) => p.status !== 'void')
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.period_code}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">结算月</label>
            {isPeriodLocked ? (
              <p className="flex h-9 w-[160px] items-center rounded-md border bg-muted/40 px-3 text-sm font-medium">
                {usageMonth || '—'}
              </p>
            ) : (
              <Select value={usageMonth} onValueChange={setUsageMonth}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="YYYY-MM" />
                </SelectTrigger>
                <SelectContent>
                  {selectedPeriod && (
                    <SelectItem
                      value={usageMonthFromPeriodCode(selectedPeriod.period_code)}
                    >
                      {usageMonthFromPeriodCode(selectedPeriod.period_code)}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
          <Button
            disabled={!billingPeriodId || !usageMonth || runBatch.isPending}
            onClick={() =>
              runBatch.mutate({ billingPeriodId, usageMonth })
            }
          >
            <Play className="mr-2 size-4" />
            {runBatch.isPending ? '计算中…' : '计算成本与提成'}
          </Button>
          <Button
            variant="default"
            disabled={!canConfirm}
            onClick={() => setConfirmDialogOpen(true)}
          >
            <ShieldCheck className="mr-2 size-4" />
            {confirmCost.isPending ? '确认中…' : '确认成本和提成'}
          </Button>
          {bundle?.run && isConfirmed && (
            <Badge variant="outline" className="border-green-500/40 text-green-700">
              已确认 · {bundle.run.confirmed_at?.slice(0, 10)}
              {bundle.run.confirmed_cost_branch
                ? ` · ${MONTHLY_COST_BRANCH_LABELS[bundle.run.confirmed_cost_branch]}`
                : ''}
            </Badge>
          )}
          {isPublishedPeriod && (
            <p className="text-muted-foreground text-xs">已发布账期不可重新确认</p>
          )}
          {bundle?.run && !isConfirmed && issueWarningCount > 0 && (
            <p className="text-muted-foreground text-xs">存在警告时不可确认，请先处理</p>
          )}
          {bundle?.run && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-muted-foreground text-sm">
                最近跑批：{bundle.run.finished_at ?? bundle.run.started_at} ·{' '}
                {bundle.run.base_line_count} 行
              </p>
              {issueWarningCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2"
                  onClick={() => {
                    setRunErrorMessage(null)
                    setIssuesDialogOpen(true)
                  }}
                >
                  <Badge variant="secondary">{issueWarningCount} 警告</Badge>
                </Button>
              )}
              {issueErrorCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2"
                  onClick={() => {
                    setRunErrorMessage(null)
                    setIssuesDialogOpen(true)
                  }}
                >
                  <Badge variant="destructive">{issueErrorCount} 错误</Badge>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {billingPeriodId && usageMonth && (
        <>
          <div className="flex items-center gap-3">
            <Tabs
              value={costBranch}
              onValueChange={(v) => setCostBranch(v as MonthlyCostBranch)}
            >
              <TabsList>
                {MONTHLY_COST_BRANCHES.map((b) => (
                  <TabsTrigger key={b} value={b}>
                    {MONTHLY_COST_BRANCH_LABELS[b]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {isLoading ? (
            <p className="text-muted-foreground">加载中…</p>
          ) : !bundle?.run ? (
            <p className="text-muted-foreground">暂无跑批结果，请先执行计算。</p>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle>基础数据</CardTitle>
                    <CardDescription>
                      明细粒度：项目 × 租户 × 区域 × 卡型 × 产品线
                      {onlyWithProject ? ' · 默认仅显示已归属项目' : ' · 含无项目行'}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={!onlyWithProject}
                        onCheckedChange={(checked) => {
                          setOnlyWithProject(checked !== true)
                          setBasePage(1)
                        }}
                      />
                      显示无项目数据
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={exporting === 'base' || !bundle?.run}
                      onClick={() => void handleExportBase()}
                    >
                      <Download className="mr-1 size-4" />
                      {exporting === 'base' ? '导出中…' : '导出 Excel'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 px-0 pb-0">
                  <div className="flex flex-wrap items-end gap-3 px-6">
                    <div className="min-w-[220px] flex-1 space-y-1">
                      <p className="text-muted-foreground text-xs">搜索</p>
                      <div className="flex gap-2">
                        <Input
                          value={baseSearchInput}
                          placeholder="租户 Id / 客户名称 / 租户名称"
                          onChange={(e) => setBaseSearchInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              setBaseSearch(baseSearchInput.trim())
                              setBasePage(1)
                            }
                          }}
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setBaseSearch(baseSearchInput.trim())
                            setBasePage(1)
                          }}
                        >
                          查询
                        </Button>
                      </div>
                    </div>
                    <div className="w-[160px] space-y-1">
                      <p className="text-muted-foreground text-xs">商机来源</p>
                      <Select
                        value={baseOpportunitySource}
                        onValueChange={(v) => {
                          setBaseOpportunitySource(v)
                          setBasePage(1)
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="全部" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">全部</SelectItem>
                          {(baseFilterOptions?.opportunitySources ?? []).map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-[180px] space-y-1">
                      <p className="text-muted-foreground text-xs">机房</p>
                      <Select
                        value={baseDataCenterId}
                        onValueChange={(v) => {
                          setBaseDataCenterId(v)
                          setBasePage(1)
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="全部" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">全部</SelectItem>
                          {(baseFilterOptions?.dataCenters ?? []).map((dc) => (
                            <SelectItem key={dc.id} value={dc.id}>
                              {dc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-[160px] space-y-1">
                      <p className="text-muted-foreground text-xs">客户经理</p>
                      <Select
                        value={baseAccountManagerStaffId}
                        onValueChange={(v) => {
                          setBaseAccountManagerStaffId(v)
                          setBasePage(1)
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="全部" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">全部</SelectItem>
                          {(baseFilterOptions?.accountManagers ?? []).map((am) => (
                            <SelectItem key={am.staffId} value={am.staffId}>
                              {am.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>项目</TableHead>
                        <TableHead>客户</TableHead>
                        <TableHead>租户 Id</TableHead>
                        <TableHead>租户名称</TableHead>
                        <TableHead>客户经理</TableHead>
                        <TableHead>商机来源</TableHead>
                        <TableHead>客群</TableHead>
                        <TableHead>区域</TableHead>
                        <TableHead>机房</TableHead>
                        <TableHead>卡型</TableHead>
                        <TableHead className="text-right">余额消费</TableHead>
                        <TableHead className="text-right">毛利</TableHead>
                        <TableHead>备注</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {baseLinesLoading ? (
                        <TableRow>
                          <TableCell colSpan={13} className="text-muted-foreground text-center">
                            加载中…
                          </TableCell>
                        </TableRow>
                      ) : (baseLinesPage?.rows.length ?? 0) === 0 ? (
                        <TableRow>
                          <TableCell colSpan={13} className="text-muted-foreground text-center">
                            暂无数据
                          </TableCell>
                        </TableRow>
                      ) : (
                        baseLinesPage?.rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.project_name ?? '—'}</TableCell>
                          <TableCell>{row.customer_full_name ?? '—'}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.tenant_platform_id}
                          </TableCell>
                          <TableCell>{row.tenant_name ?? '—'}</TableCell>
                          <TableCell>{row.account_manager_name ?? '—'}</TableCell>
                          <TableCell>{row.opportunity_source_label ?? '—'}</TableCell>
                          <TableCell>{row.customer_incentive_label ?? '—'}</TableCell>
                          <TableCell>{row.region_code}</TableCell>
                          <TableCell>{row.data_center_name ?? '—'}</TableCell>
                          <TableCell>{row.gpu_card_type_name ?? '—'}</TableCell>
                          <TableCell className="text-right">
                            {formatMoney(row.balance_consumption)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatMoney(
                              costBranch === 'platform_cost'
                                ? row.pc_gross_profit
                                : row.sp_gross_profit,
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-[200px] truncate text-xs">
                            {row.remark ?? '—'}
                          </TableCell>
                        </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  </div>
                  <ListPagination
                    page={basePage}
                    totalPages={baseTotalPages}
                    totalItems={baseLinesPage?.total ?? 0}
                    pageSize={PAGE_SIZE}
                    onPageChange={setBasePage}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle>客户经理提成 · {MONTHLY_COST_BRANCH_LABELS[costBranch]}</CardTitle>
                    <CardDescription>点击客户经理行查看项目汇总与基础数据明细</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleExportAm}>
                    <Download className="mr-1 size-4" />
                    导出 Excel
                  </Button>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>客户经理</TableHead>
                        {OPPORTUNITY_SOURCES.map((s) =>
                          INCENTIVE_LABELS.map((l) => (
                            <TableHead key={`${s}-${l}`} className="text-right">
                              {OPPORTUNITY_SOURCE_LABELS[s].replace(' + 销售', '')}/{l}
                            </TableHead>
                          )),
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {amPivot.map((row) => (
                        <TableRow
                          key={row.name}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => setSelectedAmName(row.name)}
                        >
                          <TableCell className="font-medium">{row.name}</TableCell>
                          {OPPORTUNITY_SOURCES.map((s) =>
                            INCENTIVE_LABELS.map((l) => (
                              <TableCell key={`${s}-${l}`} className="text-right">
                                {formatMoney(String(row.cells[s][l]))}
                              </TableCell>
                            )),
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {deptSections.map(({ dept, poolLines, projectLines }) => (
                <Card key={dept}>
                  <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                    <div>
                      <CardTitle>{dept}部门池 · {MONTHLY_COST_BRANCH_LABELS[costBranch]}</CardTitle>
                      <CardDescription>
                        {dept === MONTHLY_COST_DEPT_MIDDLE
                          ? '项目下全部租户毛利入池（不依赖商机来源）· 点击项目行展开基础数据明细'
                          : '仅市场来源项目入池 · 点击项目行展开基础数据明细'}
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleExportDept(dept)}>
                      <Download className="mr-1 size-4" />
                      导出 Excel
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead />
                          {INCENTIVE_LABELS.map((l) => (
                            <TableHead key={l} className="text-right">
                              {l}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell>池内毛利基数合计</TableCell>
                          {INCENTIVE_LABELS.map((l) => {
                            const line = poolLines.find(
                              (p) => p.customer_incentive_label === l,
                            )
                            return (
                              <TableCell key={l} className="text-right">
                                {formatMoney(line?.gross_profit_base_sum ?? '0')}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">部门池提成合计</TableCell>
                          {INCENTIVE_LABELS.map((l) => {
                            const line = poolLines.find(
                              (p) => p.customer_incentive_label === l,
                            )
                            return (
                              <TableCell key={l} className="text-right font-medium">
                                {formatMoney(line?.commission_pool_sum ?? '0')}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                        <TableRow>
                          <TableCell>涉及项目数</TableCell>
                          {INCENTIVE_LABELS.map((l) => {
                            const line = poolLines.find(
                              (p) => p.customer_incentive_label === l,
                            )
                            return (
                              <TableCell key={l} className="text-right">
                                {line?.project_count ?? 0}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      </TableBody>
                    </Table>

                    <div>
                      <h3 className="mb-2 text-sm font-medium">项目列表</h3>
                      <MonthlyCostDeptProjectTable
                        projectLines={projectLines}
                        billingPeriodId={billingPeriodId}
                        usageMonth={usageMonth}
                        costBranch={costBranch}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </>
      )}

      {usageMonth && <MonthlyCostDeptWeightsPanel usageMonth={usageMonth} />}

      <MonthlyCostRunIssuesDialog
        open={issuesDialogOpen}
        onOpenChange={(open) => {
          setIssuesDialogOpen(open)
          if (!open) setRunErrorMessage(null)
        }}
        billingPeriodId={billingPeriodId}
        usageMonth={usageMonth}
        fallbackErrorMessage={runErrorMessage}
      />

      {selectedAmName && (
        <MonthlyCostAmCommissionDialog
          open={Boolean(selectedAmName)}
          onOpenChange={(open) => {
            if (!open) setSelectedAmName(null)
          }}
          accountManagerName={selectedAmName}
          billingPeriodId={billingPeriodId}
          usageMonth={usageMonth}
          costBranch={costBranch}
          projectLines={bundle?.commissionProjectLines ?? []}
          allProjectMetrics={projectMetricsMap}
        />
      )}

      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认成本和提成</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  确认后，将把账期 <strong>{periodCode}</strong>、结算月{' '}
                  <strong>{usageMonth}</strong> 当前跑批结果（
                  {MONTHLY_COST_BRANCH_LABELS[costBranch]}）固化为账期正式数据：
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>更新账期列表中的项目成本与毛利汇总</li>
                  <li>同步写入项目月度成本快照（CRM 项目详情可查看）</li>
                  <li>提成数据以本次跑批为准，不再使用旧账期提成页</li>
                </ul>
                <p>如需修改，请重新跑批并再次确认。是否继续？</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                confirmCost.mutate({
                  billingPeriodId,
                  usageMonth,
                  costBranch,
                })
              }
            >
              确认固化
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
