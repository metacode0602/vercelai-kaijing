'use client'

import * as React from 'react'
import {
  ConsoleBreadcrumbs,
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailRelatedTables,
  DetailSection,
  parentsToFields,
} from '@/components/console/detail'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedDialog, UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { buildUedRelatedInfo } from '@/lib/console/related-info'
import {
  BIN_OPTIONS,
  cancelPurchaseReceipt,
  completeReceiptQc,
  listInboundsForReceipt,
  submitReceiptForQc,
  toRelatedReceiptShape,
  updateReceiptHeader,
  updateReceiptLineQty,
  usePurchaseReceipts,
  useStockInbounds,
  type QcLineResultInput,
} from '@/lib/crossborder/purchase-receipt-store'
import { getPurchaseOrder } from '@/lib/crossborder/purchase-order-store'
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { NativeSelect, NativeSelectOption } from '@workspace/ui/components/native-select'
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
  const receipts = usePurchaseReceipts()
  const inbounds = useStockInbounds()
  const receipt = receipts.find((item) => item.id === id)
  const router = useLocaleRouter()

  const [headerOpen, setHeaderOpen] = React.useState(false)
  const [qcOpen, setQcOpen] = React.useState(false)
  const [lineEditId, setLineEditId] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState('')
  const [mounted, setMounted] = React.useState(false)
  const [qcDraft, setQcDraft] = React.useState<Record<string, { passed: string; failed: string; bin: string; note: string }>>(
    {},
  )

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (!receipt) return
    const draft: Record<string, { passed: string; failed: string; bin: string; note: string }> = {}
    for (const line of receipt.lines) {
      draft[line.id] = {
        passed: String(line.qtyPassed || line.qtyArrived),
        failed: String(line.qtyFailed || 0),
        bin: line.suggestedBin || BIN_OPTIONS[0]!,
        note: line.note || '',
      }
    }
    setQcDraft(draft)
  }, [receipt?.id, receipt?.status, receipt?.lines.length])

  if (!receipt) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/purchase-receipts"
          title={mounted ? '未找到收货单' : '加载收货单…'}
          description={
            mounted
              ? `收货单 ${id} 不存在，或仅存在于其他浏览器会话。`
              : '正在读取本机原型会话中的收货单…'
          }
        />
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          请返回列表重新选择，或从采购单登记到货。
        </p>
      </div>
    )
  }

  const current = receipt
  const order = getPurchaseOrder(current.purchaseOrderId)
  const relatedInbounds = listInboundsForReceipt(current.receiptNo)
  const related = buildUedRelatedInfo('purchase-receipts', toRelatedReceiptShape(current) as Record<string, unknown>)
  const parentFields = parentsToFields(related.parents)

  const lineEdit = lineEditId ? current.lines.find((line) => line.id === lineEditId) : undefined

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbs
        items={[
          { label: '到货质检入库', href: '/console/purchase-receipts' },
          { label: current.receiptNo },
        ]}
      />

      <DetailPageHeader
        backHref="/console/purchase-receipts"
        title={current.receiptNo}
        description={`采购收货 · ${current.supplier} · ${current.warehouse}`}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
            <Badge variant={statusVariant(current.status)}>{current.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {(current.status === '草稿' || current.status === '待质检') && (
              <Button size="sm" variant="outline" onClick={() => setHeaderOpen(true)}>
                编辑主信息
              </Button>
            )}
            {current.status === '草稿' && (
              <Button
                size="sm"
                onClick={() => {
                  const result = submitReceiptForQc(receipts, current.id)
                  setNotice(result.ok ? `${current.receiptNo} 已提交质检（待质检）。` : result.reason)
                }}
              >
                提交质检
              </Button>
            )}
            {current.status === '待质检' && (
              <Button size="sm" onClick={() => setQcOpen(true)}>
                录入质检结果
              </Button>
            )}
            {relatedInbounds.some((item) => item.status === '待上架') && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => router.push('/console/stock-inbounds')}
              >
                去确认上架
              </Button>
            )}
          </div>
        }
      />

      <Alert>
        <AlertTitle>收货 → 质检 → 入库连贯操作</AlertTitle>
        <AlertDescription>
          主信息与明细来自采购单自动带出（供应商、仓库、SKU、订购量）。质检合格数生成入库单；确认上架后才写库存流水（幂等键防重复记账）。
        </AlertDescription>
      </Alert>

      <UedPrototypeNotice>
        {current.status === '草稿'
          ? '请核对到货数量与库位建议，然后「提交质检」。'
          : current.status === '待质检'
            ? '录入每行合格/残次（合计须等于到货），完成后自动生成待上架入库单并回写采购单到货投影。'
            : current.status === '已完成'
              ? `质检单 ${current.qcNo || '—'} 已完成；请到入库单确认上架以回写 qty_stocked。`
              : '收货单已取消。'}
      </UedPrototypeNotice>

      <DetailKpiRow
        items={[
          { label: '明细行', value: String(current.lines.length) },
          {
            label: '到货合计',
            value: String(current.lines.reduce((sum, line) => sum + line.qtyArrived, 0)),
          },
          {
            label: '质检合格',
            value: String(current.lines.reduce((sum, line) => sum + line.qtyPassed, 0)),
          },
          {
            label: '关联入库单',
            value: String(current.inboundIds.length || relatedInbounds.length),
          },
        ]}
      />

      <DetailFieldGrid
        title="收货主信息"
        description="purchase_receipts：采购单、仓库、到货时间、操作人"
        fields={[
          { label: '收货单号', value: current.receiptNo, mono: true },
          ...parentFields,
          {
            label: '采购单',
            value: (
              <LocaleLink
                href={`/console/purchase-orders/${encodeURIComponent(current.purchaseOrderId)}`}
                className="font-mono text-xs underline-offset-2 hover:underline"
              >
                {current.purchaseOrderId}
              </LocaleLink>
            ),
          },
          { label: '供应商', value: current.supplier },
          { label: '收货仓库', value: current.warehouse, mono: true },
          { label: '到货时间', value: current.arrivedAt },
          { label: '操作人', value: current.receivedBy },
          { label: '送货单号', value: current.deliveryNote || '—' },
          { label: '备注', value: current.remark || '—' },
          {
            label: '状态',
            value: <Badge variant={statusVariant(current.status)}>{current.status}</Badge>,
          },
          { label: '质检单号', value: current.qcNo || '—', mono: true },
          { label: '质检人', value: current.qcInspector || '—' },
          { label: '质检完成', value: current.qcCompletedAt || '—' },
        ]}
        columns={3}
        action={
          current.status === '草稿' || current.status === '待质检' ? (
            <Button size="sm" variant="ghost" onClick={() => setHeaderOpen(true)}>
              编辑
            </Button>
          ) : null
        }
      />

      {order ? (
        <DetailFieldGrid
          title="来源采购单快照"
          description="决策辅助：订购/已收/合格/入库投影，避免二次查找"
          fields={[
            { label: '采购状态', value: order.status },
            { label: '预计到货', value: order.expectedAt },
            {
              label: '订购合计',
              value: String(order.lines.reduce((sum, line) => sum + line.qtyOrdered, 0)),
            },
            {
              label: '已到货投影',
              value: String(order.lines.reduce((sum, line) => sum + line.qtyReceived, 0)),
            },
            {
              label: '合格投影',
              value: String(order.lines.reduce((sum, line) => sum + line.qtyQcPassed, 0)),
            },
            {
              label: '已入库投影',
              value: String(order.lines.reduce((sum, line) => sum + line.qtyStocked, 0)),
            },
          ]}
          columns={3}
        />
      ) : null}

      <DetailSection
        title="收货明细"
        description="purchase_receipt_lines：到货数量、质检结果、建议库位"
        action={
          current.status === '待质检' ? (
            <Button size="sm" variant="outline" onClick={() => setQcOpen(true)}>
              录入质检结果
            </Button>
          ) : null
        }
      >
        {current.lines.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            无收货明细。请从含明细的采购单重新登记到货。
          </div>
        ) : (
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
                <TableHead className="text-right">操作</TableHead>
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
                  <TableCell className="text-right tabular-nums">{line.qtyArrived}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.qtyPendingQc}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.qtyPassed}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.qtyFailed}</TableCell>
                  <TableCell className="font-mono text-xs">{line.suggestedBin || '—'}</TableCell>
                  <TableCell className="max-w-[12rem] truncate text-sm text-muted-foreground">
                    {line.note || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {current.status === '草稿' ? (
                      <Button size="sm" variant="ghost" onClick={() => setLineEditId(line.id)}>
                        改数量
                      </Button>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DetailSection>

      <DetailSection
        title="本批入库单"
        description="质检合格后自动生成；确认上架后回写采购单 qty_stocked 并记账"
      >
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

      {related.sections && related.sections.length > 0 ? (
        <DetailRelatedTables sections={related.sections} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {current.status === '草稿' || current.status === '待质检' ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const result = cancelPurchaseReceipt(receipts, current.id)
              setNotice(result.ok ? `${current.receiptNo} 已取消。` : result.reason)
            }}
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

      {headerOpen ? (
        <UedDialog
          title="编辑收货主信息"
          description="修改操作人、送货单号与备注；供应商与仓库随采购单锁定。"
          fields={[
            {
              key: 'receivedBy',
              label: '收货操作人',
              required: true,
              defaultValue: current.receivedBy,
            },
            {
              key: 'deliveryNote',
              label: '送货单号',
              defaultValue: current.deliveryNote,
            },
            {
              key: 'remark',
              label: '收货备注',
              type: 'textarea',
              fullWidth: true,
              defaultValue: current.remark,
            },
          ]}
          initialValues={{
            receivedBy: current.receivedBy,
            deliveryNote: current.deliveryNote,
            remark: current.remark,
          }}
          onClose={() => setHeaderOpen(false)}
          onSave={(values) => {
            updateReceiptHeader(receipts, current.id, {
              receivedBy: values.receivedBy || current.receivedBy,
              deliveryNote: values.deliveryNote ?? current.deliveryNote,
              remark: values.remark ?? current.remark,
            })
            setHeaderOpen(false)
            setNotice('收货主信息已更新（原型会话）。')
          }}
          saveLabel="保存"
        />
      ) : null}

      {lineEdit ? (
        <UedDialog
          title={`修改到货数量 · ${lineEdit.sku}`}
          description="草稿阶段可调整本批到货数量与建议库位；提交质检后不可改。"
          fields={[
            {
              key: 'qtyArrived',
              label: '本批到货数量',
              type: 'number',
              required: true,
              defaultValue: String(lineEdit.qtyArrived),
            },
            {
              key: 'suggestedBin',
              label: '建议库位',
              options: [...BIN_OPTIONS],
              defaultValue: lineEdit.suggestedBin,
              required: true,
            },
          ]}
          onClose={() => setLineEditId(null)}
          onSave={(values) => {
            const result = updateReceiptLineQty(
              receipts,
              current.id,
              lineEdit.id,
              Number(values.qtyArrived || lineEdit.qtyArrived),
              values.suggestedBin,
            )
            setLineEditId(null)
            setNotice(result.ok ? `已更新 ${lineEdit.sku} 到货数量。` : result.reason)
          }}
          saveLabel="保存明细"
        />
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
                  bin: line.suggestedBin,
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
                        <NativeSelect
                          id={`bin-${line.id}`}
                          value={draft.bin}
                          onChange={(event) =>
                            setQcDraft((prev) => ({
                              ...prev,
                              [line.id]: { ...draft, bin: event.target.value },
                            }))
                          }
                        >
                          {BIN_OPTIONS.map((bin) => (
                            <NativeSelectOption key={bin} value={bin}>
                              {bin}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
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
                onClick={() => {
                  const lineResults: QcLineResultInput[] = current.lines.map((line) => {
                    const draft = qcDraft[line.id]
                    return {
                      lineId: line.id,
                      qtyPassed: Number(draft?.passed || 0),
                      qtyFailed: Number(draft?.failed || 0),
                      suggestedBin: draft?.bin,
                      note: draft?.note,
                    }
                  })
                  const result = completeReceiptQc(
                    receipts,
                    inbounds,
                    current.id,
                    lineResults,
                    current.receivedBy,
                  )
                  if (!result.ok) {
                    setNotice(result.reason)
                    return
                  }
                  setQcOpen(false)
                  setNotice(
                    `质检完成（${result.receipt.qcNo}）。已生成入库单 ${result.createdInbounds.map((item) => item.inboundNo).join('、') || '无（合格为 0）'}；采购单到货投影已回写。`,
                  )
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
