'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
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
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

export default function SettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const [notice, setNotice] = React.useState('')
  const [pendingNext, setPendingNext] = React.useState<string | null>(null)
  const utils = trpc.useUtils()
  const detailQuery = trpc.finance.getSettlement.useQuery({ id })
  const updateMutation = trpc.finance.updateSettlementStatus.useMutation({
    onSuccess: async (row) => {
      await utils.finance.getSettlement.invalidate({ id })
      setPendingNext(null)
      setNotice(`状态已更新为 ${row.status}（本地 ERP，非平台回写）`)
    },
    onError: (error) => setNotice(error.message),
  })

  if (detailQuery.isLoading) return <p className="text-sm text-muted-foreground">加载结算…</p>
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>未找到结算</AlertTitle>
        <AlertDescription>{detailQuery.error?.message ?? id}</AlertDescription>
      </Alert>
    )
  }
  const row = detailQuery.data
  const fees = row.fees

  return (
    <div className="space-y-4">
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '平台结算对账', href: '/console/settlements' },
          { label: row.externalSettlementId },
        ]}
      />
      <DetailPageHeader
        backHref="/console/settlements"
        backLabel="结算列表"
        title={row.externalSettlementId}
        description={`${row.platform} · ${row.shop} · ${row.period}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {(row.status === '待匹配' || row.status === '差异待处理') && (
              <Button
                size="sm"
                disabled={updateMutation.isPending}
                onClick={() => setPendingNext('已确认')}
              >
                确认账单
              </Button>
            )}
            {row.status === '已确认' && (
              <Button
                size="sm"
                variant="outline"
                disabled={updateMutation.isPending}
                onClick={() => setPendingNext('已打款')}
              >
                标记已打款
              </Button>
            )}
            {row.status === '已打款' && (
              <Badge variant="secondary">已打款</Badge>
            )}
          </div>
        }
      />
      <UedPrototypeNotice>本地 ERP 状态；非平台结算 API 回写。</UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '账单额', value: `${row.billAmount.toLocaleString()} ${row.currency}` },
          { label: '费用合计', value: row.feesTotal.toLocaleString() },
          { label: '打款', value: row.payoutAmount.toLocaleString() },
          { label: '匹配行', value: String(row.matchedOrders) },
        ]}
      />
      <DetailFieldGrid
        fields={[
          { label: '外部结算号', value: row.externalSettlementId, mono: true },
          { label: '平台', value: row.platform },
          { label: '店铺', value: row.shop },
          { label: '账期', value: row.period },
          { label: '打款状态', value: row.payoutStatus },
          { label: '打款时间', value: row.paidAt },
          {
            label: '费用拆分',
            value: `平台 ${fees.platform} / 物流 ${fees.logistics} / 推广 ${fees.ads} / JSB ${fees.jsb} / 退款 ${fees.refunds} / 汇兑 ${fees.fx}`,
          },
          { label: '状态', value: <Badge variant="secondary">{row.status}</Badge> },
        ]}
        columns={3}
      />
      <DetailSection title="结算明细" description="settlement_lines">
        {row.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无明细行。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>订单</TableHead>
                <TableHead>费用类型</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>税额</TableHead>
                <TableHead>Seller SKU</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {row.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="font-mono text-xs">{line.order}</TableCell>
                  <TableCell>
                    {line.feeKind} / {line.feeType}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {line.amount} {line.currency}
                  </TableCell>
                  <TableCell className="tabular-nums">{line.taxAmount}</TableCell>
                  <TableCell className="font-mono text-xs">{line.sellerSku}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{line.note || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DetailSection>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}

      <AlertDialog open={pendingNext != null} onOpenChange={(o) => !o && setPendingNext(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认推进结算状态？</AlertDialogTitle>
            <AlertDialogDescription>
              将把 {row.externalSettlementId} 状态改为「{pendingNext}」。此为本地 ERP 软状态，不会回写平台。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingNext) return
                updateMutation.mutate({ id: row.id, status: pendingNext })
              }}
            >
              确认改为「{pendingNext}」
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
