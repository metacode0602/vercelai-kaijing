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
  cancelStockInbound,
  confirmStockInboundShelve,
  toRelatedInboundShape,
  updateStockInboundDraft,
  useStockInbounds,
} from '@/lib/crossborder/purchase-receipt-store'
import { getPurchaseOrder } from '@/lib/crossborder/purchase-order-store'
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function statusVariant(status: string) {
  if (status === '已上架') return 'secondary' as const
  if (status === '已取消') return 'destructive' as const
  return 'outline' as const
}

export default function StockInboundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const inbounds = useStockInbounds()
  const inbound = inbounds.find((item) => item.id === id)
  const router = useLocaleRouter()

  const [editOpen, setEditOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!inbound) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/stock-inbounds"
          title={mounted ? '未找到入库单' : '加载入库单…'}
          description={
            mounted
              ? `入库单 ${id} 不存在，或仅存在于其他浏览器会话的示例数据中。`
              : '正在读取本机原型会话中的入库单…'
          }
        />
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          请返回列表重新选择，或从到货质检完成后生成待上架入库单。
        </p>
      </div>
    )
  }

  const current = inbound
  const order = current.purchaseOrderId ? getPurchaseOrder(current.purchaseOrderId) : undefined
  const related = buildUedRelatedInfo(
    'stock-inbounds',
    toRelatedInboundShape(current) as Record<string, unknown>,
  )
  const parentFields = parentsToFields(related.parents)
  const canEdit = current.status === '待上架'
  const canShelve = current.status === '待上架'
  const canCancel = current.status === '待上架'

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbs
        items={[{ label: '入库单', href: '/console/stock-inbounds' }, { label: current.inboundNo }]}
      />

      <DetailPageHeader
        backHref="/console/stock-inbounds"
        title={current.inboundNo}
        description={`${current.sourceType} · ${current.sku} × ${current.quantity}`}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
            <Badge variant={statusVariant(current.status)}>{current.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                编辑库位
              </Button>
            ) : null}
            {canShelve ? (
              <Button
                size="sm"
                onClick={() => {
                  const result = confirmStockInboundShelve(inbounds, current.id)
                  setNotice(
                    result.ok
                      ? `${result.inbound.inboundNo} 已上架：库位 ${result.inbound.bin}；流水幂等键 ${result.inbound.idempotencyKey}`
                      : result.reason,
                  )
                }}
              >
                确认上架
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const result = cancelStockInbound(inbounds, current.id, '库内取消')
                  setNotice(result.ok ? `${current.inboundNo} 已取消。` : result.reason)
                }}
              >
                取消入库单
              </Button>
            ) : null}
            {current.sourceDoc.startsWith('RCV') ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  router.push(`/console/purchase-receipts/${encodeURIComponent(current.sourceDoc)}`)
                }
              >
                查看来源收货
              </Button>
            ) : null}
          </div>
        }
      />

      <Alert>
        <AlertTitle>确认上架写库存流水</AlertTitle>
        <AlertDescription>
          采购路径：收货质检合格 → 自动生成本单（待上架）→ 确认上架写 inventory_ledger（幂等键防重复）。库位与操作人可在上架前调整。
        </AlertDescription>
      </Alert>

      <UedPrototypeNotice>
        {current.status === '待上架'
          ? '核对 SKU、数量、质检结果与目标库位后点击「确认上架」。重复提交会被幂等键拦截。'
          : current.status === '已上架'
            ? `已上架；幂等键 ${current.idempotencyKey || '—'}。采购单 qty_stocked 已投影回写。`
            : '入库单已取消，不可再上架。'}
      </UedPrototypeNotice>

      <DetailKpiRow
        items={[
          { label: '入库数量', value: String(current.quantity) },
          { label: '质检结果', value: current.qcResult || '—' },
          { label: '目标库位', value: current.bin },
          {
            label: '状态',
            value: current.status,
          },
        ]}
      />

      <DetailFieldGrid
        title="入库主信息"
        description="stock_inbounds / 采购入库：来源单据、SKU、数量、库位、操作人"
        fields={[
          { label: '入库单号', value: current.inboundNo, mono: true },
          ...parentFields,
          { label: '入库类型', value: current.sourceType },
          {
            label: '来源单据',
            value: current.sourceDoc.startsWith('RCV') ? (
              <LocaleLink
                href={`/console/purchase-receipts/${encodeURIComponent(current.sourceDoc)}`}
                className="font-mono text-xs underline-offset-2 hover:underline"
              >
                {current.sourceDoc}
              </LocaleLink>
            ) : (
              current.sourceDoc
            ),
          },
          {
            label: '采购单',
            value: current.purchaseOrderId ? (
              <LocaleLink
                href={`/console/purchase-orders/${encodeURIComponent(current.purchaseOrderId)}`}
                className="font-mono text-xs underline-offset-2 hover:underline"
              >
                {current.purchaseOrderId}
              </LocaleLink>
            ) : (
              '—'
            ),
          },
          {
            label: '内部 SKU',
            value: (
              <LocaleLink
                href={`/console/master-skus/${encodeURIComponent(current.sku)}`}
                className="font-mono text-xs underline-offset-2 hover:underline"
              >
                {current.sku}
              </LocaleLink>
            ),
          },
          { label: '数量', value: String(current.quantity) },
          { label: '质检结果', value: current.qcResult || '—' },
          { label: '目标库位', value: current.bin, mono: true },
          { label: '仓库', value: current.warehouse, mono: true },
          { label: '操作人', value: current.operator },
          { label: '时间', value: current.at },
          {
            label: '状态',
            value: <Badge variant={statusVariant(current.status)}>{current.status}</Badge>,
          },
          { label: '幂等键', value: current.idempotencyKey || '—', mono: true },
          { label: '备注', value: current.remark || '—' },
        ]}
        columns={3}
        action={
          canEdit ? (
            <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
              编辑
            </Button>
          ) : null
        }
      />

      {order ? (
        <DetailFieldGrid
          title="关联采购单快照"
          description="决策辅助：订购 / 已收 / 合格 / 入库投影"
          fields={[
            { label: '采购状态', value: order.status },
            { label: '供应商', value: order.supplier },
            { label: '收货仓库', value: order.warehouse, mono: true },
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

      <DetailSection title="状态机">
        <p className="text-sm text-muted-foreground">
          待上架 → 已上架（确认上架写 inventory_ledger，回写采购 qty_stocked）/ 已取消。采购入库由到货质检合格自动生成；手工创建须绑定来源单号。
        </p>
      </DetailSection>

      {related.sections && related.sections.length > 0 ? (
        <DetailRelatedTables sections={related.sections} />
      ) : null}

      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {editOpen ? (
        <UedDialog
          title="编辑待上架入库单"
          description="仅待上架可改库位与备注；数量与来源单据由质检结果锁定。"
          fields={[
            {
              key: 'bin',
              label: '目标库位',
              options: [...BIN_OPTIONS],
              defaultValue: current.bin,
              required: true,
            },
            {
              key: 'operator',
              label: '操作人',
              defaultValue: current.operator,
              required: true,
            },
            {
              key: 'remark',
              label: '备注',
              type: 'textarea',
              fullWidth: true,
              defaultValue: current.remark || '',
            },
          ]}
          onClose={() => setEditOpen(false)}
          onSave={(values) => {
            const result = updateStockInboundDraft(inbounds, current.id, {
              bin: values.bin,
              operator: values.operator,
              remark: values.remark,
            })
            setEditOpen(false)
            setNotice(result.ok ? '已保存库位与备注。' : result.reason)
          }}
          saveLabel="保存"
        />
      ) : null}
    </div>
  )
}
