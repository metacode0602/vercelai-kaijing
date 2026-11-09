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
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

function statusVariant(status: string) {
  if (status === '已完成') return 'secondary' as const
  if (status === '已取消') return 'destructive' as const
  return 'outline' as const
}

export default function PurchaseReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const router = useLocaleRouter()
  const utils = trpc.useUtils()
  const [qcOpen, setQcOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [qcDraft, setQcDraft] = React.useState<
    Record<string, { passed: string; failed: string; bin: string; note: string }>
  >({})

  const detailQuery = trpc.purchase.getReceipt.useQuery({ id })
  const inboundsQuery = trpc.purchase.listInbounds.useQuery({ page: 1, pageSize: 100 })
  const binsQuery = trpc.wms.listBins.useQuery(
    {
      page: 1,
      pageSize: 100,
      warehouse: detailQuery.data?.warehouse || undefined,
      status: undefined,
    },
    { enabled: Boolean(detailQuery.data?.warehouse) },
  )
  const binOptions = React.useMemo(() => {
    const codes = (binsQuery.data?.items ?? [])
      .filter((bin) => bin.status !== '停用')
      .map((bin) => bin.code)
    return Array.from(new Set(codes))
  }, [binsQuery.data?.items])

  const invalidate = async () => {
    await utils.purchase.getReceipt.invalidate({ id })
    await utils.purchase.listReceipts.invalidate()
    await utils.purchase.listInbounds.invalidate()
    await utils.purchase.listOrders.invalidate()
  }

  const qcMutation = trpc.purchase.submitQc.useMutation({
    onSuccess: async (result) => {
      await invalidate()
      setQcOpen(false)
      setNotice(
        `质检完成（${result.receipt.qcNo}）。已生成入库单 ${result.inbounds.map((item) => item.inboundNo).join('、') || '无（合格为 0）'}。`,
      )
      if (result.inbounds[0]) {
        router.push(`/console/stock-inbounds/${encodeURIComponent(result.inbounds[0].id)}`)
      }
    },
    onError: (error) => setNotice(error.message),
  })
  const cancelMutation = trpc.purchase.cancelReceipt.useMutation({
    onSuccess: async (row) => {
      await invalidate()
      setNotice(`${row.receiptNo} 已取消。`)
    },
    onError: (error) => setNotice(error.message),
  })

  React.useEffect(() => {
    if (!detailQuery.data) return
    const draft: Record<string, { passed: string; failed: string; bin: string; note: string }> = {}
    for (const line of detailQuery.data.lines) {
      draft[line.id] = {
        passed: String(line.qtyPassed || line.qtyArrived),
        failed: String(line.qtyFailed || 0),
        bin: line.suggestedBin || binOptions[0] || '',
        note: line.note || '',
      }
    }
    setQcDraft(draft)
  }, [detailQuery.data?.id, detailQuery.data?.status, detailQuery.data?.lines.length, binOptions.join("|")])

  if (detailQuery.isLoading) {
    return (
      <DetailPageHeader
        backHref="/console/purchase-receipts"
        title="加载收货单…"
        description="正在从数据库读取…"
      />
    )
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/purchase-receipts"
          title="未找到收货单"
          description={detailQuery.error?.message || `收货单 ${id} 不存在。`}
        />
      </div>
    )
  }

  const current = detailQuery.data
  const relatedInbounds = (inboundsQuery.data?.items || []).filter(
    (item) =>
      current.inboundIds.includes(item.inboundNo) ||
      item.sourceDoc === current.receiptNo ||
      item.sourceDoc === current.id,
  )

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '到货质检', href: '/console/purchase-receipts' },
          { label: current.receiptNo },
        ]}
      />

      <DetailPageHeader
        backHref="/console/purchase-receipts"
        title={current.receiptNo}
        description={`${current.supplier} · ${current.warehouse} · 操作人 ${current.receivedBy || '—'}`}
        badges={
          <>
            <Badge variant="outline">数据库</Badge>
            <Badge variant={statusVariant(current.status)}>{current.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {current.status === '待质检' || current.status === '草稿' ? (
              <Button size="sm" onClick={() => setQcOpen(true)} disabled={qcMutation.isPending}>
                录入质检结果
              </Button>
            ) : null}
            {current.purchaseOrderId ? (
              <Button size="sm" variant="secondary" asChild>
                <LocaleLink
                  href={`/console/purchase-orders/${encodeURIComponent(current.purchaseOrderId)}`}
                >
                  查看采购单 {current.purchaseOrderId}
                </LocaleLink>
              </Button>
            ) : null}
          </div>
        }
      />

      <Alert>
        <AlertTitle>到货 → 质检 → 生成入库单</AlertTitle>
        <AlertDescription>
          登记到货后进入待质检。完成质检后合格数量自动生成待上架入库单，并回写采购单投影。
        </AlertDescription>
      </Alert>

      <UedPrototypeNotice>
        {current.status === '待质检'
          ? '请录入每行合格/残次数量（合计须等于到货）。合格 &gt; 0 时生成待上架入库单。'
          : current.status === '已完成'
            ? `质检单 ${current.qcNo || '—'} 已完成；入库单见下方。`
            : '收货单状态已结束，不可再质检。'}
      </UedPrototypeNotice>

      <DetailKpiRow
        items={[
          { label: '明细行数', value: String(current.lines.length) },
          {
            label: '到货合计',
            value: String(current.lines.reduce((sum, line) => sum + line.qtyArrived, 0)),
          },
          {
            label: '合格合计',
            value: String(current.lines.reduce((sum, line) => sum + line.qtyPassed, 0)),
          },
          {
            label: '残次合计',
            value: String(current.lines.reduce((sum, line) => sum + line.qtyFailed, 0)),
          },
        ]}
      />

      <DetailFieldGrid
        title="收货主信息"
        description="purchase_receipts：到货批次与质检摘要"
        fields={[
          { label: '收货单号', value: current.receiptNo, mono: true },
          { label: '采购单', value: current.purchaseOrderId, mono: true },
          { label: '供应商', value: current.supplier },
          { label: '仓库', value: current.warehouse, mono: true },
          { label: '到货批次编号', value: current.batchNo || '—', mono: true },
          { label: '到货时间', value: current.arrivedAt || '—' },
          { label: '物流商', value: current.carrier || '—' },
          { label: '物流单号', value: current.trackingNo || '—', mono: true },
          { label: '收货人', value: current.receivedBy || '—' },
          { label: '送货单号', value: current.deliveryNote || '—' },
          { label: '质检单号', value: current.qcNo || '—', mono: true },
          { label: '质检人', value: current.qcInspector || '—' },
          { label: '质检完成', value: current.qcCompletedAt || '—' },
          {
            label: '状态',
            value: <Badge variant={statusVariant(current.status)}>{current.status}</Badge>,
          },
          { label: '备注', value: current.remark || '—' },
        ]}
        columns={3}
      />

      <DetailSection title="到货明细" description="purchase_receipt_lines">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>行号</TableHead>
              <TableHead>内部 SKU</TableHead>
              <TableHead className="text-right">订购</TableHead>
              <TableHead className="text-right">本批到货</TableHead>
              <TableHead className="text-right">待检</TableHead>
              <TableHead className="text-right">合格</TableHead>
              <TableHead className="text-right">残次</TableHead>
              <TableHead>建议库位</TableHead>
              <TableHead>备注</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {current.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="tabular-nums">{line.lineNo}</TableCell>
                <TableCell className="font-mono text-xs">{line.sku}</TableCell>
                <TableCell className="text-right tabular-nums">{line.qtyOrdered}</TableCell>
                <TableCell className="text-right tabular-nums">{line.qtyArrived}</TableCell>
                <TableCell className="text-right tabular-nums">{line.qtyPendingQc}</TableCell>
                <TableCell className="text-right tabular-nums">{line.qtyPassed}</TableCell>
                <TableCell className="text-right tabular-nums">{line.qtyFailed}</TableCell>
                <TableCell className="font-mono text-xs">{line.suggestedBin || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{line.note || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DetailSection>

      <DetailSection title="关联入库单" description="质检合格后自动生成">
        {relatedInbounds.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            尚未生成入库单。完成质检且合格数 &gt; 0 后会出现在此。
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>入库单</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead>库位</TableHead>
                <TableHead>质检摘要</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relatedInbounds.map((inbound) => (
                <TableRow key={inbound.id}>
                  <TableCell className="font-mono text-xs">
                    <LocaleLink
                      href={`/console/stock-inbounds/${encodeURIComponent(inbound.id)}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {inbound.inboundNo}
                    </LocaleLink>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{inbound.sku}</TableCell>
                  <TableCell className="text-right tabular-nums">{inbound.quantity}</TableCell>
                  <TableCell className="font-mono text-xs">{inbound.bin}</TableCell>
                  <TableCell className="text-sm">{inbound.qcResult}</TableCell>
                  <TableCell>
                    <Badge variant={inbound.status === '已上架' ? 'secondary' : 'outline'}>
                      {inbound.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DetailSection>

      <div className="flex flex-wrap gap-2">
        {current.status === '草稿' || current.status === '待质检' ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate({ id: current.id })}
          >
            取消收货单
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            router.push(`/console/purchase-orders/${encodeURIComponent(current.purchaseOrderId)}`)
          }
        >
          查看采购单
        </Button>
      </div>

      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {qcOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setQcOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-background shadow-lg"
          >
            <header className="border-b px-5 py-4">
              <h2 className="text-base font-semibold">录入质检结果 · {current.receiptNo}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                每行合格 + 残次必须等于到货数量；合格数 &gt; 0 时须指定上架库位。完成后生成待上架入库单。
              </p>
            </header>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {current.lines.map((line) => {
                const draft = qcDraft[line.id] || {
                  passed: String(line.qtyArrived),
                  failed: '0',
                  bin: line.suggestedBin || binOptions[0] || '',
                  note: '',
                }
                return (
                  <div key={line.id} className="rounded-lg border p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-medium">{line.sku}</p>
                        <p className="text-xs text-muted-foreground">本批到货 {line.qtyArrived}</p>
                      </div>
                      <Badge variant="outline">行 {line.lineNo}</Badge>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`pass-${line.id}`}>合格数量</Label>
                        <Input
                          id={`pass-${line.id}`}
                          type="number"
                          value={draft.passed}
                          onChange={(event) =>
                            setQcDraft((prev) => ({
                              ...prev,
                              [line.id]: { ...draft, passed: event.target.value },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`fail-${line.id}`}>残次数量</Label>
                        <Input
                          id={`fail-${line.id}`}
                          type="number"
                          value={draft.failed}
                          onChange={(event) =>
                            setQcDraft((prev) => ({
                              ...prev,
                              [line.id]: { ...draft, failed: event.target.value },
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`bin-${line.id}`}>上架库位</Label>
                        <Select
                          value={draft.bin}
                          onValueChange={(value) =>
                            setQcDraft((prev) => ({
                              ...prev,
                              [line.id]: { ...draft, bin: value },
                            }))
                          }
                        >
                          <SelectTrigger id={`bin-${line.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {binOptions.length === 0 ? (
                              <SelectItem value="__empty__" disabled>
                                暂无可用库位（请先在仓库中心维护）
                              </SelectItem>
                            ) : (
                              binOptions.map((bin) => (
                                <SelectItem key={bin} value={bin}>
                                  {bin}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`note-${line.id}`}>残次/差异说明</Label>
                        <Input
                          id={`note-${line.id}`}
                          value={draft.note}
                          placeholder="残次原因或短少说明"
                          onChange={(event) =>
                            setQcDraft((prev) => ({
                              ...prev,
                              [line.id]: { ...draft, note: event.target.value },
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <footer className="flex justify-end gap-2 border-t px-5 py-3">
              <Button variant="outline" onClick={() => setQcOpen(false)}>
                取消
              </Button>
              <Button
                disabled={qcMutation.isPending}
                onClick={() => {
                  qcMutation.mutate({
                    receiptId: current.id,
                    inspector: current.receivedBy || '质检员',
                    lines: current.lines.map((line) => {
                      const draft = qcDraft[line.id]
                      return {
                        lineId: line.id,
                        qtyPassed: Number(draft?.passed || 0),
                        qtyFailed: Number(draft?.failed || 0),
                        suggestedBin: draft?.bin,
                        note: draft?.note,
                      }
                    }),
                  })
                }}
              >
                完成质检并生成入库单
              </Button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  )
}
