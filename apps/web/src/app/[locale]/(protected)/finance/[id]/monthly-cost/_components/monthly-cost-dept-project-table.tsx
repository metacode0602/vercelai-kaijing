'use client'

import { Fragment, useState } from 'react'
import { formatMoney } from '@/app/[locale]/(protected)/finance/_lib/display'
import {
  MonthlyCostProjectBaseLinesSubTable,
  MonthlyCostProjectMetricsCells,
} from '@/app/[locale]/(protected)/finance/[id]/monthly-cost/_components/monthly-cost-shared'
import type { MonthlyCostBranch } from '@/lib/monthly-cost/constants'
import { Button } from '@workspace/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { ChevronDown, ChevronRight } from 'lucide-react'

type ProjectLine = {
  id: string
  project_id: string
  project_name: string | null
  tenant_id: string
  opportunity_source_label: string | null
  customer_incentive_label: string
  account_manager_name: string | null
  gross_profit_base: string
  commission_pool_amount: string
  metrics: {
    balance_consumption: string
    balance_card_hours: string
    voucher_card_hours: string
    confirmed_revenue_excl_tax: string
    sold_duration_cost_excl_tax: string
    gifted_duration_cost_excl_tax: string
  }
}

type Props = {
  projectLines: ProjectLine[]
  billingPeriodId: string
  usageMonth: string
  costBranch: MonthlyCostBranch
}

export function MonthlyCostDeptProjectTable({
  projectLines,
  billingPeriodId,
  usageMonth,
  costBranch,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (projectId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10" />
          <TableHead>客群</TableHead>
          <TableHead>项目名称</TableHead>
          <TableHead>商机来源</TableHead>
          <TableHead className="text-right">余额消费</TableHead>
          <TableHead className="text-right">余额卡时</TableHead>
          <TableHead className="text-right">券卡时</TableHead>
          <TableHead className="text-right">确认收入(不含税)</TableHead>
          <TableHead className="text-right">售出时长成本(不含税)</TableHead>
          <TableHead className="text-right">赠送时长成本(不含税)</TableHead>
          <TableHead className="text-right">毛利基数</TableHead>
          <TableHead className="text-right">入池金额</TableHead>
          <TableHead>客户经理</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projectLines.map((p) => {
          const isOpen = expanded.has(p.project_id)
          return (
            <Fragment key={p.id}>
              <TableRow>
                <TableCell className="p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-expanded={isOpen}
                    onClick={() => toggle(p.project_id)}
                  >
                    {isOpen ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </Button>
                </TableCell>
                <TableCell>{p.customer_incentive_label}</TableCell>
                <TableCell>{p.tenant_id} - {p.project_name ?? p.project_id}</TableCell>
                <TableCell>{p.opportunity_source_label ?? '—'}</TableCell>
                <MonthlyCostProjectMetricsCells metrics={p.metrics} />
                <TableCell className="text-right">{formatMoney(p.gross_profit_base)}</TableCell>
                <TableCell className="text-right">
                  {formatMoney(p.commission_pool_amount)}
                </TableCell>
                <TableCell>{p.account_manager_name ?? '—'}</TableCell>
              </TableRow>
              {isOpen && (
                <>
                  <TableRow className="bg-muted/10">
                    <TableCell />
                    <TableCell colSpan={3} className="text-muted-foreground text-xs font-medium">
                      基础数据明细
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
                    <TableCell colSpan={3} className="text-muted-foreground text-xs font-medium">
                      备注
                    </TableCell>
                  </TableRow>
                  <MonthlyCostProjectBaseLinesSubTable
                    billingPeriodId={billingPeriodId}
                    usageMonth={usageMonth}
                    projectId={p.project_id}
                    costBranch={costBranch}
                    enabled={isOpen}
                  />
                </>
              )}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}
