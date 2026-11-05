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
import { UedDialog, UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
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

function statusVariant(status: string) {
  if (status === '已收货' || status === '已关闭') return 'secondary' as const
  if (status === '已取消') return 'destructive' as const
  return 'outline' as const
}

export default function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const router = useLocaleRouter()
  const utils = trpc.useUtils()
  const [receiveOpen, setReceiveOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [qtyDraft, setQtyDraft] = React.useState<Record<string, string>>({})

  const detailQuery = trpc.purchase.getOrder.useQuery({ id })

  const registerMutation = trpc.purchase.registerReceipt.useMutation({
    onSuccess: async (receipt) => {
      await utils.purchase.getOrder.invalidate({ id })
      await utils.purchase.listOrders.invalidate()
      await utils.purchase.listReceipts.invalidate()
      setReceiveOpen(false)
      setNotice(`${detailQuery.data?.poNo || ''} 已创建到货批次 ${receipt.receiptNo}`)
      router.push(`/console/purchase-receipts/${encodeURIComponent(receipt.id)}`)
    },
    onError: (error) => setNotice(error.message),
  })

  React.useEffect(() => {
    if (!detailQuery.data) return
    const draft: Record<string, string> = {}
    for (const line of detailQuery.data.lines) {
      const remaining = Math.max(0, line.qtyOrdered - line.qtyReceived)
      draft[line.id] = String(remaining)
    }
    setQtyDraft(draft)
  }, [detailQuery.data?.id, detailQuery.data?.status, detailQuery.data?.lines.length])

  if (detailQuery.isLoading) {
    return (
      <DetailPageHeader
        backHref="/console/purchase-orders"
        title="加载采购单…"
        description="正在从数据库读取…"
      />
    )
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/purchase-orders"
          title="未找到采购单"
          description={detailQuery.error?.message || `采购单 ${id} 不存在。`}
        />
      </div>
    )
  }

  const current = detailQuery.data
  const canReceive =
    current.status === '已下发' || current.status === '部分到货' || current.status === '草稿'

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: '采购单', href: '/console/purchase-orders' }, { label: current.poNo }]}
      />

      <DetailPageHeader
        backHref="/console/purchase-orders"
        title={current.poNo}
        description={`采购单主信息 · ${current.supplier}`}
        badges={
          <>
            <Badge variant="outline">数据库</Badge>
            <Badge variant={statusVariant(current.status)}>{current.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {current.sourceRequest ? (
              <Button size="sm" variant="outline" asChild>
                <LocaleLink
                  href={`/console/purchase-requests/${encodeURIComponent(current.sourceRequest)}`}
                >
                  来源申请 {current.sourceRequest}
                </LocaleLink>
              </Button>
            ) : null}
          </div>
        }
      />

      <Alert>
        <AlertTitle>审批转单生成 · 对齐 purchase_orders / purchase_order_lines</AlertTitle>
        <AlertDescription>
          采购单由申请「通过并转采购单」生成，表头与明细只读。到货数量投影字段由收货与质检回写。
        </AlertDescription>
      </Alert>

      <UedPrototypeNotice>
        {current.lines.length === 0
          ? '当前尚无采购明细。'
          : '明细行金额汇总写入主信息 total_amount；到货数量投影字段 qty_received / qty_qc_passed / qty_stocked 由收货与质检回写。'}
      </UedPrototypeNotice>

      <DetailKpiRow
        items={[
          { label: '明细行数', value: String(current.lines.length) },
          { label: '合计金额', value: `${current.totalAmount} ${current.currency}` },
          {
            label: '订购数量',
            value: String(current.lines.reduce((sum, line) => sum + line.qtyOrdered, 0)),
          },
          {
            label: '已到货',
            value: String(current.lines.reduce((sum, line) => sum + line.qtyReceived, 0)),
          },
        ]}
      />

      <DetailFieldGrid
        title="主信息"
        description="purchase_orders：供应商、仓库、币种、预计到货等表头字段"
        fields={[
          { label: '采购单号', value: current.poNo, mono: true },
          { label: '来源申请', value: current.sourceRequest || '—', mono: true },
          { label: '供应商', value: current.supplier },
          { label: '收货仓库', value: current.warehouse, mono: true },
          { label: '币种', value: current.currency },
          { label: '合计金额', value: `${current.totalAmount} ${current.currency}` },
          { label: '预计到货', value: current.expectedAt },
          { label: '创建日期', value: current.createdAt },
          {
            label: '状态',
            value: <Badge variant={statusVariant(current.status)}>{current.status}</Badge>,
          },
        ]}
        columns={3}
      />

      <DetailSection title="采购明细" description="purchase_order_lines：内部 SKU、订购数量、锁定单价与到货投影">
        {current.lines.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            明细为空。
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>行号</TableHead>
                <TableHead>内部 SKU</TableHead>
                <TableHead className="text-right">订购数量</TableHead>
                <TableHead className="text-right">已到货</TableHead>
                <TableHead className="text-right">质检合格</TableHead>
                <TableHead className="text-right">已入库</TableHead>
                <TableHead className="text-right">单价</TableHead>
                <TableHead className="text-right">金额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {current.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="tabular-nums">{line.lineNo}</TableCell>
                  <TableCell className="font-mono text-xs">
                    <LocaleLink
                      href={`/console/master-skus/${encodeURIComponent(line.sku)}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {line.sku}
                    </LocaleLink>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{line.qtyOrdered}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.qtyReceived}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.qtyQcPassed}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.qtyStocked}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.unitPrice} {current.currency}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.amount} {current.currency}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DetailSection>

      <div className="flex flex-wrap gap-2">
        {canReceive && current.lines.length > 0 ? (
          <Button size="sm" onClick={() => setReceiveOpen(true)} disabled={registerMutation.isPending}>
            登记到货
          </Button>
        ) : null}
        {canReceive ? (
          <Button size="sm" variant="secondary" onClick={() => router.push('/console/purchase-receipts')}>
            查看到货质检
          </Button>
        ) : null}
      </div>

      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {receiveOpen ? (
        <UedDialog
          title="登记到货批次"
          description="按行填写本批到货数量；提交后生成待质检收货单并回写采购单到货投影。"
          fields={current.lines.map((line) => ({
            key: line.id,
            label: `${line.sku}（订 ${line.qtyOrdered} / 已收 ${line.qtyReceived}）`,
            type: 'number' as const,
            defaultValue: qtyDraft[line.id] || '0',
            required: false,
          }))}
          initialValues={qtyDraft}
          onClose={() => setReceiveOpen(false)}
          onSave={(values) => {
            const lines = current.lines
              .map((line) => ({
                poLineId: line.id,
                sku: line.sku,
                qtyArrived: Number(values[line.id] || 0),
              }))
              .filter((line) => line.qtyArrived > 0)
            if (!lines.length) {
              setNotice('请至少填写一行到货数量。')
              return
            }
            registerMutation.mutate({
              purchaseOrderId: current.id,
              receivedBy: '当前用户',
              lines,
            })
          }}
          saveLabel="确认登记到货"
        />
      ) : null}
    </div>
  )
}
