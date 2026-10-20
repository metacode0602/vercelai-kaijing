'use client'

import { Fragment, useCallback, useMemo, useState } from 'react'
import { AlertTriangle, Download, RefreshCw } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@workspace/ui/components/button'
import { Badge } from '@workspace/ui/components/badge'
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
import { Skeleton } from '@workspace/ui/components/skeleton'
import { toast } from '@workspace/ui/hooks/use-toast'

/** 金额一律 4 位定点展示：金额是 BigInt 定点算出来的，展示层不能再截断。 */
function money(v: string | null | undefined): string {
  if (v == null || v === '') return '—'
  return Number(v).toLocaleString('zh-CN', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })
}

const CURRENT_MONTH = new Date().toISOString().slice(0, 7)

export function SupplierReconciliationClient() {
  const [billMonth, setBillMonth] = useState<string>(CURRENT_MONTH)
  const [expanded, setExpanded] = useState<string | null>(null)

  const monthsQuery = trpc.supplier.reconciliationMonths.useQuery()
  const reportQuery = trpc.supplier.reconciliationReport.useQuery(
    { billMonth },
    { placeholderData: (prev) => prev },
  )

  const months = useMemo(() => {
    const list = monthsQuery.data ?? []
    // 当前月可能还没出账，务必在候选里保留，否则用户第一次进来只能看到空态。
    return list.includes(CURRENT_MONTH) ? list : [CURRENT_MONTH, ...list]
  }, [monthsQuery.data])

  const report = reportQuery.data
  const issueCount = report?.totals.issueCount ?? 0

  const handleExport = useCallback(() => {
    if (!report) return
    if (report.rows.length === 0) {
      toast({ title: '该账期没有可导出的账单' })
      return
    }

    const esc = (v: string | number | null | undefined) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }

    const header = [
      '账期',
      '供应商',
      '账单数',
      '待确认数',
      '已确认数',
      '已结算数',
      '总卡时',
      '账单金额',
      '网络费',
      '管控费',
      '存储费',
      '应结金额',
      '租户消费',
      '毛利',
      '已开票金额',
      '已结算金额',
      '差异数',
      '差异明细',
    ]

    const lines = report.rows.map((r) =>
      [
        report.billMonth,
        r.supplierName,
        r.billCount,
        r.pendingCount,
        r.confirmedCount,
        r.paidCount,
        r.totalUsageHours,
        r.totalAmount,
        r.networkFee,
        r.managementFee,
        r.storageFee,
        r.finalAmount,
        r.tenantConsumption,
        r.grossProfit,
        r.invoicedAmount,
        r.paidAmount,
        r.issueCount,
        r.issues.join(' ; '),
      ]
        .map(esc)
        .join(','),
    )

    // 合计行：导出后直接可在 Excel 里对数，不用再手工加一遍。
    const t = report.totals
    lines.push(
      [
        report.billMonth,
        '合计',
        t.billCount,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        t.finalAmount,
        t.tenantConsumption,
        t.grossProfit,
        t.invoicedAmount,
        t.paidAmount,
        t.issueCount,
        '',
      ]
        .map(esc)
        .join(','),
    )

    // BOM：没有它 Excel 打开中文表头会乱码。
    const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `供应商对账-${report.billMonth}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [report])

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <CardTitle>平台侧供应商对账</CardTitle>
              <CardDescription>
                按账期列出各供应商应付、已结算、已开票金额，并重算明细金额、分形态金额、
                应结金额与毛利的一致性。出现差异的账单不应直接付款。
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Select value={billMonth} onValueChange={setBillMonth}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="选择账期" />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => void reportQuery.refetch()}
                disabled={reportQuery.isFetching}
                title="刷新"
              >
                <RefreshCw
                  className={reportQuery.isFetching ? 'size-4 animate-spin' : 'size-4'}
                />
              </Button>
              <Button
                variant="outline"
                onClick={handleExport}
                disabled={!report || report.rows.length === 0}
              >
                <Download className="size-4" />
                导出对账表
              </Button>
            </div>
          </div>
        </CardHeader>

        {report && (
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="账单数" value={String(report.totals.billCount)} />
              <Stat label="供应商数" value={String(report.totals.supplierCount)} />
              <Stat label="应结金额" value={money(report.totals.finalAmount)} />
              <Stat label="已结算" value={money(report.totals.paidAmount)} />
              <Stat label="已开票" value={money(report.totals.invoicedAmount)} />
              <Stat
                label="一致性差异"
                value={String(issueCount)}
                tone={issueCount > 0 ? 'danger' : undefined}
              />
            </div>

            {issueCount > 0 && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p>
                  本账期检出 {issueCount}{' '}
                  处金额不一致，涉及的账单在修正前不应付款。点击供应商行可查看逐条差异。
                </p>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>供应商明细</CardTitle>
        </CardHeader>
        <CardContent>
          {reportQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : report && report.rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>供应商</TableHead>
                  <TableHead className="text-right">账单</TableHead>
                  <TableHead className="text-right">待确认/已确认/已结算</TableHead>
                  <TableHead className="text-right">应结金额</TableHead>
                  <TableHead className="text-right">租户消费</TableHead>
                  <TableHead className="text-right">毛利</TableHead>
                  <TableHead className="text-right">已开票</TableHead>
                  <TableHead className="text-right">已结算</TableHead>
                  <TableHead className="text-right">差异</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((r) => (
                  // 必须用带 key 的 Fragment：展开行是「供应商行」的兄弟节点，
                  // 直接用 <>...</> 会让 React 报「list child 缺 key」。
                  <Fragment key={r.supplierId}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() =>
                        setExpanded((prev) => (prev === r.supplierId ? null : r.supplierId))
                      }
                    >
                      <TableCell className="font-medium">{r.supplierName}</TableCell>
                      <TableCell className="text-right">{r.billCount}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {r.pendingCount} / {r.confirmedCount} / {r.paidCount}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {money(r.finalAmount)}
                      </TableCell>
                      <TableCell className="text-right">{money(r.tenantConsumption)}</TableCell>
                      <TableCell className="text-right">{money(r.grossProfit)}</TableCell>
                      <TableCell className="text-right">{money(r.invoicedAmount)}</TableCell>
                      <TableCell className="text-right">{money(r.paidAmount)}</TableCell>
                      <TableCell className="text-right">
                        {r.issueCount > 0 ? (
                          <Badge variant="destructive">{r.issueCount} 处</Badge>
                        ) : (
                          <Badge variant="secondary">正常</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                    {expanded === r.supplierId && (
                      <TableRow>
                        <TableCell colSpan={9}>
                          {r.issues.length > 0 && (
                            <ul className="mb-3 flex flex-col gap-1 text-sm text-destructive">
                              {r.issues.map((issue, i) => (
                                <li key={i}>{issue}</li>
                              ))}
                            </ul>
                          )}
                          <ContractBreakdown attributions={r.contractAttributions} unattributed={r.unattributedAmount} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">
              {billMonth} 没有供应商账单。请确认出账任务已执行。
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** W-12：合同归因明细。合同只在设备粒度唯一，残差与机房费用归因不到单份合同。 */
function ContractBreakdown({
  attributions,
  unattributed,
}: {
  attributions:
    | { contractId: string; contractNo: string | null; amount: string; usageHours: string }[]
    | undefined
  unattributed: string
}) {
  if (!attributions || attributions.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        本账期没有可归因到合同的金额（该供应商设备未挂合同，或全部走整租/机房费用口径）。
        应结金额 {money(unattributed)} 无法追溯到具体合同。
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">合同归因（W-12）</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b">
            <th className="py-1 text-left font-normal">合同号</th>
            <th className="py-1 text-right font-normal">卡时</th>
            <th className="py-1 text-right font-normal">归因金额</th>
          </tr>
        </thead>
        <tbody>
          {attributions.map((a) => (
            <tr key={a.contractId} className="border-b last:border-0">
              <td className="py-1 font-mono">
                {a.contractNo ?? a.contractId.slice(0, 8)}
              </td>
              <td className="py-1 text-right">{Number(a.usageHours).toFixed(2)}</td>
              <td className="py-1 text-right">{money(a.amount)}</td>
            </tr>
          ))}
          <tr>
            <td className="text-muted-foreground py-1">未归因（残差 / 机房费用）</td>
            <td className="text-muted-foreground py-1 text-right">—</td>
            <td className="text-muted-foreground py-1 text-right">{money(unattributed)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={tone === 'danger' ? 'text-destructive font-medium' : 'font-medium'}>
        {value}
      </p>
    </div>
  )
}
