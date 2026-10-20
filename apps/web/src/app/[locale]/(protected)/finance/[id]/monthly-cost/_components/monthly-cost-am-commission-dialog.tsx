'use client'

import { Fragment, useMemo, useState } from 'react'
import { formatMoney } from '@/app/[locale]/(protected)/finance/_lib/display'
import {
  MonthlyCostProjectBaseLinesSubTable,
  MonthlyCostProjectMetricsCells,
} from '@/app/[locale]/(protected)/finance/[id]/monthly-cost/_components/monthly-cost-shared'
import type { MonthlyCostBranch } from '@/lib/monthly-cost/constants'
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
import { ChevronDown, ChevronRight } from 'lucide-react'

type CommissionProjectLine = {
  id: string
  project_id: string
  project_name: string | null
  account_manager_name: string | null
  opportunity_source_label: string | null
  customer_incentive_label: string
  gross_profit_base: string
  commission_rate: string
  commission_amount: string
}

type ProjectMetrics = {
  balance_consumption: string
  balance_card_hours: string
  voucher_card_hours: string
  confirmed_revenue_excl_tax: string
  sold_duration_cost_excl_tax: string
  gifted_duration_cost_excl_tax: string
  gross_profit: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountManagerName: string
  billingPeriodId: string
  usageMonth: string
  costBranch: MonthlyCostBranch
  projectLines: CommissionProjectLine[]
  allProjectMetrics: Map<string, ProjectMetrics>
}

export function MonthlyCostAmCommissionDialog({
  open,
  onOpenChange,
  accountManagerName,
  billingPeriodId,
  usageMonth,
  costBranch,
  projectLines,
  allProjectMetrics,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const rows = useMemo(() => {
    const emptyMetrics = (): ProjectMetrics => ({
      balance_consumption: '0',
      balance_card_hours: '0',
      voucher_card_hours: '0',
      confirmed_revenue_excl_tax: '0',
      sold_duration_cost_excl_tax: '0',
      gifted_duration_cost_excl_tax: '0',
      gross_profit: '0',
    })

    const map = new Map<
      string,
      CommissionProjectLine & { metrics: ProjectMetrics; commission_rate: string }
    >()
    for (const line of projectLines) {
      if ((line.account_manager_name ?? '未指定客户经理') !== accountManagerName) continue
      const existing = map.get(line.project_id)
      if (!existing) {
        map.set(line.project_id, {
          ...line,
          metrics: allProjectMetrics.get(line.project_id) ?? emptyMetrics(),
        })
        continue
      }
      existing.gross_profit_base = String(
        Number(existing.gross_profit_base) + Number(line.gross_profit_base),
      )
      existing.commission_amount = String(
        Number(existing.commission_amount) + Number(line.commission_amount),
      )
    }
    return [...map.values()].sort((a, b) =>
      (a.project_name ?? a.project_id).localeCompare(b.project_name ?? b.project_id, 'zh-CN'),
    )
  }, [projectLines, accountManagerName, allProjectMetrics])

  const toggle = (projectId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-[96vw] min-w-[75vw] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1 border-b px-6 py-4">
          <DialogTitle>客户经理提成 · {accountManagerName}</DialogTitle>
          <DialogDescription>项目汇总与基础数据明细（按当前成本分支）</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>项目名称</TableHead>
                <TableHead>商机来源</TableHead>
                <TableHead>客群</TableHead>
                <TableHead className="text-right">余额消费</TableHead>
                <TableHead className="text-right">余额卡时</TableHead>
                <TableHead className="text-right">券卡时</TableHead>
                <TableHead className="text-right">确认收入(不含税)</TableHead>
                <TableHead className="text-right">售出时长成本(不含税)</TableHead>
                <TableHead className="text-right">赠送时长成本(不含税)</TableHead>
                <TableHead className="text-right">毛利基数</TableHead>
                <TableHead className="text-right">提点</TableHead>
                <TableHead className="text-right">提成金额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-muted-foreground text-center">
                    无项目数据
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const isOpen = expanded.has(row.project_id)
                  return (
                    <Fragment key={row.project_id}>
                      <TableRow>
                        <TableCell className="p-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-expanded={isOpen}
                            onClick={() => toggle(row.project_id)}
                          >
                            {isOpen ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>{row.project_name ?? row.project_id}</TableCell>
                        <TableCell>{row.opportunity_source_label ?? '—'}</TableCell>
                        <TableCell>{row.customer_incentive_label}</TableCell>
                        <MonthlyCostProjectMetricsCells metrics={row.metrics} />
                        <TableCell className="text-right">
                          {formatMoney(row.gross_profit_base)}
                        </TableCell>
                        <TableCell className="text-right">
                          {(Number(row.commission_rate) * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatMoney(row.commission_amount)}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <>
                          <TableRow className="bg-muted/10">
                            <TableCell />
                            <TableCell className="text-muted-foreground text-xs font-medium">
                              区域
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs font-medium">
                              卡型
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs font-medium">
                              产品线
                            </TableCell>
                            <TableCell className="text-muted-foreground text-right text-xs font-medium">
                              余额消费
                            </TableCell>
                            <TableCell className="text-muted-foreground text-right text-xs font-medium">
                              余额卡时
                            </TableCell>
                            <TableCell className="text-muted-foreground text-right text-xs font-medium">
                              券卡时
                            </TableCell>
                            <TableCell className="text-muted-foreground text-right text-xs font-medium">
                              确认收入
                            </TableCell>
                            <TableCell className="text-muted-foreground text-right text-xs font-medium">
                              售出成本
                            </TableCell>
                            <TableCell className="text-muted-foreground text-right text-xs font-medium">
                              赠送成本
                            </TableCell>
                            <TableCell className="text-muted-foreground text-right text-xs font-medium">
                              毛利
                            </TableCell>
                            <TableCell colSpan={2} className="text-muted-foreground text-xs font-medium">
                              备注
                            </TableCell>
                          </TableRow>
                          <MonthlyCostProjectBaseLinesSubTable
                            billingPeriodId={billingPeriodId}
                            usageMonth={usageMonth}
                            projectId={row.project_id}
                            costBranch={costBranch}
                            enabled={isOpen}
                          />
                        </>
                      )}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
