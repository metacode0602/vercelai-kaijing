'use client'

import { useMemo, useState } from 'react'
import {
  MonthlyCostIssueLevelBadge,
} from '@/app/[locale]/(protected)/finance/[id]/monthly-cost/_components/monthly-cost-shared'
import { ProjectOpportunitySourceDialog } from '@/components/dashboard/project-opportunity-source-dialog'
import type { Project } from '@/lib/data/types'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { toast } from 'sonner'

const ROW_FIELD_LABELS: Record<string, string> = {
  tenant_platform_id: '平台租户 Id',
  project_id: '项目 Id',
  project_name: '项目名称',
  region_code: '区域',
  gpu_card_type_name: '卡型',
  product_line: '产品线',
  customer_full_name: '客户全称',
  account_manager_name: '客户经理',
  balance_consumption: '余额消费',
  balance_card_hours: '余额卡时',
  voucher_card_hours: '券卡时',
  pricing_resolve_status: '定价状态',
  bare_metal_order_nos: '裸金属订单编号',
  remark: '备注',
}

function formatRowField(key: string, value: string | null | undefined) {
  const label = ROW_FIELD_LABELS[key] ?? key
  return `${label}: ${value ?? '—'}`
}

type IssueRow = Record<string, string | null | undefined> | null

type IssueItem = {
  level: 'warning' | 'error'
  code: string
  message: string
  row: IssueRow
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  billingPeriodId: string
  usageMonth: string
  fallbackIssues?: IssueItem[]
  fallbackErrorMessage?: string | null
  onOpportunitySourceSaved?: () => void
}

function resolveIssueProjectId(issue: IssueItem): string | null {
  if (issue.code !== 'MISSING_OPPORTUNITY_SOURCE') return null
  const projectId = issue.row?.project_id?.trim()
  return projectId || null
}

export function MonthlyCostRunIssuesDialog({
  open,
  onOpenChange,
  billingPeriodId,
  usageMonth,
  fallbackIssues,
  fallbackErrorMessage,
  onOpportunitySourceSaved,
}: Props) {
  const utils = trpc.useUtils()
  const [oppDialogOpen, setOppDialogOpen] = useState(false)
  const [oppProject, setOppProject] = useState<Project | null>(null)
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null)

  const { data, isLoading } = trpc.finance.monthlyCost.listRunIssues.useQuery(
    { billingPeriodId, usageMonth },
    { enabled: open && Boolean(billingPeriodId && usageMonth) && !fallbackErrorMessage },
  )

  const issues = useMemo((): IssueItem[] => {
    if (fallbackErrorMessage) {
      return [
        {
          level: 'error',
          code: 'RUN_FAILED',
          message: fallbackErrorMessage,
          row: null,
        },
      ]
    }
    return data?.issues ?? fallbackIssues ?? []
  }, [data?.issues, fallbackErrorMessage, fallbackIssues])

  const warningCount = fallbackErrorMessage
    ? 0
    : (data?.warningCount ?? issues.filter((i) => i.level === 'warning').length)
  const errorCount = fallbackErrorMessage
    ? 1
    : (data?.errorCount ?? issues.filter((i) => i.level === 'error').length)

  const handleSetOpportunitySource = async (projectId: string) => {
    setLoadingProjectId(projectId)
    try {
      const project = await utils.crm.projects.getById.fetch({ id: projectId })
      if (!project) {
        toast.error('未找到对应项目')
        return
      }
      setOppProject(project)
      setOppDialogOpen(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载项目失败')
    } finally {
      setLoadingProjectId(null)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] max-w-5xl min-w-[45vw] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="space-y-1 border-b px-6 py-4">
            <DialogTitle>跑批警告与错误</DialogTitle>
            <DialogDescription>
              {warningCount} 条警告 · {errorCount} 条错误
              {issues.length === 0 && !isLoading ? ' · 暂无详细记录（请重新跑批）' : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
            {isLoading && !fallbackErrorMessage ? (
              <p className="text-muted-foreground text-sm">加载中…</p>
            ) : issues.length === 0 ? (
              <p className="text-muted-foreground text-sm">暂无警告或错误。</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[72px]">级别</TableHead>
                    <TableHead className="w-[140px]">代码</TableHead>
                    <TableHead>原因</TableHead>
                    <TableHead>关联行数据</TableHead>
                    <TableHead className="w-[120px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.map((issue, idx) => {
                    const projectId = resolveIssueProjectId(issue)
                    return (
                      <TableRow key={`${issue.code}-${idx}`}>
                        <TableCell>
                          <MonthlyCostIssueLevelBadge level={issue.level} />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{issue.code}</TableCell>
                        <TableCell className="text-sm">{issue.message}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[320px] text-xs leading-relaxed">
                          {issue.row ? (
                            <ul className="space-y-0.5">
                              {Object.entries(issue.row).map(([key, value]) => (
                                <li key={key}>{formatRowField(key, value)}</li>
                              ))}
                            </ul>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          {projectId ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={loadingProjectId === projectId}
                              onClick={() => void handleSetOpportunitySource(projectId)}
                            >
                              {loadingProjectId === projectId ? '加载中…' : '设置商机来源'}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="flex justify-end border-t px-6 py-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ProjectOpportunitySourceDialog
        open={oppDialogOpen}
        onOpenChange={(next) => {
          setOppDialogOpen(next)
          if (!next) setOppProject(null)
        }}
        project={oppProject}
        onSaved={() => {
          toast.message('商机来源已保存，请重新跑批以计算提成')
          onOpportunitySourceSaved?.()
          void utils.finance.monthlyCost.listRunIssues.invalidate({
            billingPeriodId,
            usageMonth,
          })
        }}
      />
    </>
  )
}
