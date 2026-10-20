'use client'

import { formatMoney } from '@/app/[locale]/(protected)/finance/_lib/display'
import { downloadPersonalIncomeTenantDetailExcel } from '@/lib/finance/personal-income-summary-export'
import {
  personalIncomeSummaryKindLabel,
  type PersonalIncomeSummaryKind,
} from '@/lib/finance/personal-income-labels'
import { trpc } from '@/lib/trpc/client'
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

export type PersonalIncomeTenantDetailDrawerProps = {
  billingPeriodId: string
  periodCode: string
  segment: PersonalIncomeSummaryKind | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PersonalIncomeTenantDetailDrawer({
  billingPeriodId,
  periodCode,
  segment,
  open,
  onOpenChange,
}: PersonalIncomeTenantDetailDrawerProps) {
  const { data: rows, isLoading } = trpc.finance.periods.listPersonalIncomeTenantLines.useQuery(
    {
      billingPeriodId,
      segment: segment ?? 'non_project',
    },
    { enabled: open && Boolean(segment) && Boolean(billingPeriodId) },
  )

  const handleExport = () => {
    if (!segment || !rows?.length) {
      toast.error('暂无数据可导出')
      return
    }
    const ok = downloadPersonalIncomeTenantDetailExcel({
      rows,
      periodCode,
      summaryKind: segment,
    })
    if (ok) toast.success('租户明细 Excel 已下载')
    else toast.error('导出失败')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-5xl min-w-[50vw] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {segment ? personalIncomeSummaryKindLabel(segment) : '租户明细'}
          </SheetTitle>
          <SheetDescription>
            共 {rows?.length ?? 0} 个租户（总消费 &gt; 0）
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!rows?.length}
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
                  <TableHead>客户类型</TableHead>
                  <TableHead>客户名</TableHead>
                  <TableHead className="text-right">余额消费</TableHead>
                  <TableHead className="text-right">线上裸金属</TableHead>
                  <TableHead className="text-right">总消费</TableHead>
                  <TableHead className="text-right">券消费</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!rows?.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      暂无明细
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.platform_tenant_id}>
                      <TableCell className="font-mono text-xs">
                        {row.platform_tenant_id}
                      </TableCell>
                      <TableCell>{row.customer_type_label ?? '—'}</TableCell>
                      <TableCell>{row.customer_name ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(row.balance_consumption)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(row.bare_metal_consumption)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(row.total_consumption)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(row.voucher_consumption)}
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
