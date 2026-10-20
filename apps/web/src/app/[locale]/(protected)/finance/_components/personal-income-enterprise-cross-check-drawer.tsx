'use client'

import { formatMoney } from '@/app/[locale]/(protected)/finance/_lib/display'
import { downloadPersonalIncomeEnterpriseCrossCheckExcel } from '@/lib/finance/personal-income-enterprise-cross-check-export'
import { PERSONAL_INCOME_AMOUNT_TOLERANCE } from '@/lib/finance/personal-income-core'
import { parseMoney } from '@/lib/finance/income-row-utils'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@workspace/ui/components/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { IconLoader2 } from '@tabler/icons-react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'

export type PersonalIncomeEnterpriseCrossCheckDrawerProps = {
  billingPeriodId: string
  periodCode: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function isMismatch(delta: string): boolean {
  return Math.abs(parseMoney(delta)) > PERSONAL_INCOME_AMOUNT_TOLERANCE
}

export function PersonalIncomeEnterpriseCrossCheckDrawer({
  billingPeriodId,
  periodCode,
  open,
  onOpenChange,
}: PersonalIncomeEnterpriseCrossCheckDrawerProps) {
  const { data, isLoading } =
    trpc.finance.periods.listPersonalIncomeEnterpriseCrossCheck.useQuery(
      { billingPeriodId },
      { enabled: open && Boolean(billingPeriodId) },
    )

  const handleExport = () => {
    if (!data?.rows.length) {
      toast.error('暂无数据可导出')
      return
    }
    const ok = downloadPersonalIncomeEnterpriseCrossCheckExcel({
      rows: data.rows,
      periodCode,
      summary: data.summary,
    })
    if (ok) toast.success('交叉核对 Excel 已下载')
    else toast.error('导出失败')
  }

  const mismatchCount =
    data?.rows.filter((r) => isMismatch(r.delta_total)).length ?? 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-5xl min-w-[50vw] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>B 端 vs CRM 企业收入交叉核对</SheetTitle>
          <SheetDescription>
            按租户对比 Excel B 端分段与 CRM 企业收入（platform_income_monthly）；共{' '}
            {data?.rows.length ?? 0} 个租户
            {mismatchCount > 0 ? `，${mismatchCount} 个存在差额` : ''}
          </SheetDescription>
        </SheetHeader>

        {data?.summary ? (
          <div className="mt-4 grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground">Excel B 端合计</p>
              <p className="font-medium tabular-nums">{formatMoney(data.summary.excel_total)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">CRM 企业收入合计</p>
              <p className="font-medium tabular-nums">{formatMoney(data.summary.crm_total)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">差额</p>
              <p
                className={
                  isMismatch(data.summary.delta)
                    ? 'font-medium tabular-nums text-amber-600'
                    : 'font-medium tabular-nums'
                }
              >
                {formatMoney(data.summary.delta)}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!data?.rows.length}
            onClick={handleExport}
          >
            <Download className="size-4" />
            下载 Excel
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <IconLoader2 className="size-5 animate-spin mr-2" />
            加载中…
          </div>
        ) : (
          <div className="mt-4 rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>平台租户 ID</TableHead>
                  <TableHead>客户名</TableHead>
                  <TableHead>关联项目</TableHead>
                  <TableHead className="text-right">Excel 总消费</TableHead>
                  <TableHead className="text-right">CRM 总消费</TableHead>
                  <TableHead className="text-right">差额</TableHead>
                  <TableHead className="text-right">余额差额</TableHead>
                  <TableHead className="text-right">裸金属差额</TableHead>
                  <TableHead>CRM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!data?.rows.length ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      暂无 B 端租户明细（请先计算个人收入）
                    </TableCell>
                  </TableRow>
                ) : (
                  data.rows.map((row) => (
                    <TableRow key={row.platform_tenant_id}>
                      <TableCell className="font-mono text-xs">
                        {row.platform_tenant_id}
                      </TableCell>
                      <TableCell>{row.customer_name ?? '—'}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-xs">
                        {row.project_names.join('、') || '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        <div>{formatMoney(row.excel_total_consumption)}</div>
                        <div className="text-muted-foreground">
                          余 {formatMoney(row.excel_balance_consumption)} / 裸{' '}
                          {formatMoney(row.excel_bare_metal_consumption)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        <div>{formatMoney(row.crm_total_consumption)}</div>
                        <div className="text-muted-foreground">
                          余 {formatMoney(row.crm_balance_consumption)} / 裸{' '}
                          {formatMoney(row.crm_bare_metal_consumption)}
                        </div>
                      </TableCell>
                      <TableCell
                        className={
                          isMismatch(row.delta_total)
                            ? 'text-right tabular-nums font-medium text-amber-600'
                            : 'text-right tabular-nums'
                        }
                      >
                        {formatMoney(row.delta_total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {formatMoney(row.delta_balance)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        {formatMoney(row.delta_bare_metal)}
                      </TableCell>
                      <TableCell>
                        {row.has_crm_row ? (
                          <Badge variant="secondary" className="font-normal">
                            有
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="font-normal text-destructive">
                            无
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
