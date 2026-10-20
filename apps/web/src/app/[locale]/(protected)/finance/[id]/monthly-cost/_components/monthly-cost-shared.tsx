'use client'

import { formatMoney } from '@/app/[locale]/(protected)/finance/_lib/display'
import type { MonthlyCostBranch } from '@/lib/monthly-cost/constants'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

type Props = {
  billingPeriodId: string
  usageMonth: string
  projectId: string
  costBranch: MonthlyCostBranch
  enabled: boolean
}

export function MonthlyCostProjectBaseLinesSubTable({
  billingPeriodId,
  usageMonth,
  projectId,
  costBranch,
  enabled,
}: Props) {
  const { data, isLoading } = trpc.finance.monthlyCost.listProjectBaseLines.useQuery(
    { billingPeriodId, usageMonth, projectId },
    { enabled: enabled && Boolean(billingPeriodId && usageMonth && projectId) },
  )

  if (!enabled) return null

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={12} className="bg-muted/30 text-muted-foreground text-sm">
          加载明细…
        </TableCell>
      </TableRow>
    )
  }

  if ((data?.rows.length ?? 0) === 0) {
    return (
      <TableRow>
        <TableCell colSpan={12} className="bg-muted/30 text-muted-foreground text-sm">
          无基础数据明细
        </TableCell>
      </TableRow>
    )
  }

  return (
    <>
      {data!.rows.map((row) => (
        <TableRow key={row.id} className="border-l-2 border-l-primary/30 bg-muted/20">
          <TableCell />
          <TableCell className="text-muted-foreground text-xs">{row.region_code}</TableCell>
          <TableCell className="text-xs">{row.gpu_card_type_name ?? '—'}</TableCell>
          <TableCell className="text-xs">{row.product_line}</TableCell>
          <TableCell className="text-right text-xs">
            {formatMoney(row.balance_consumption)}
          </TableCell>
          <TableCell className="text-right text-xs">{row.balance_card_hours}</TableCell>
          <TableCell className="text-right text-xs">{row.voucher_card_hours}</TableCell>
          <TableCell className="text-right text-xs">
            {formatMoney(row.confirmed_revenue_excl_tax)}
          </TableCell>
          <TableCell className="text-right text-xs">
            {formatMoney(
              costBranch === 'platform_cost'
                ? row.pc_sold_duration_cost_excl_tax
                : row.sp_sold_duration_cost_excl_tax,
            )}
          </TableCell>
          <TableCell className="text-right text-xs">
            {formatMoney(
              costBranch === 'platform_cost'
                ? row.pc_gifted_duration_cost_excl_tax
                : row.sp_gifted_duration_cost_excl_tax,
            )}
          </TableCell>
          <TableCell className="text-right text-xs">
            {formatMoney(
              costBranch === 'platform_cost' ? row.pc_gross_profit : row.sp_gross_profit,
            )}
          </TableCell>
          <TableCell className="text-muted-foreground max-w-[160px] truncate text-xs">
            {row.remark ?? '—'}
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}

export function MonthlyCostProjectMetricsCells({
  metrics,
}: {
  metrics: {
    balance_consumption: string
    balance_card_hours: string
    voucher_card_hours: string
    confirmed_revenue_excl_tax: string
    sold_duration_cost_excl_tax: string
    gifted_duration_cost_excl_tax: string
  }
}) {
  return (
    <>
      <TableCell className="text-right">{formatMoney(metrics.balance_consumption)}</TableCell>
      <TableCell className="text-right">{metrics.balance_card_hours}</TableCell>
      <TableCell className="text-right">{metrics.voucher_card_hours}</TableCell>
      <TableCell className="text-right">
        {formatMoney(metrics.confirmed_revenue_excl_tax)}
      </TableCell>
      <TableCell className="text-right">
        {formatMoney(metrics.sold_duration_cost_excl_tax)}
      </TableCell>
      <TableCell className="text-right">
        {formatMoney(metrics.gifted_duration_cost_excl_tax)}
      </TableCell>
    </>
  )
}

export function MonthlyCostIssueLevelBadge({ level }: { level: 'warning' | 'error' }) {
  if (level === 'error') {
    return (
      <Badge variant="destructive" className="font-normal">
        错误
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="font-normal">
      警告
    </Badge>
  )
}
