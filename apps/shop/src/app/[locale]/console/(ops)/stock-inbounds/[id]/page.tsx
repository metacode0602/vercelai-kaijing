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
import { useStockAdjustmentDialog } from '@/components/console/stock-adjustment-create-dialog'
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
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
  const router = useLocaleRouter()
  const utils = trpc.useUtils()
  const [editOpen, setEditOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const { openWith: openAdjustWith, dialog: adjustDialog, notice: adjustNotice } =
    useStockAdjustmentDialog()

  const detailQuery = trpc.purchase.getInbound.useQuery({ id })
  const orderQuery = trpc.purchase.getOrder.useQuery(
    { id: detailQuery.data?.purchaseOrderId || '' },
    { enabled: Boolean(detailQuery.data?.purchaseOrderId) },
  )
  const binsQuery = trpc.wms.listBins.useQuery(
    {
      page: 1,
      pageSize: 100,
      warehouse: detailQuery.data?.warehouse || undefined,
    },
    { enabled: Boolean(detailQuery.data?.warehouse) },
  )
  const binOptions = React.useMemo(() => {
    const codes = (binsQuery.data?.items ?? [])
      .filter((bin) => bin.status !== '停用')
      .map((bin) => bin.code)
    const set = Array.from(new Set(codes))
    if (detailQuery.data?.bin && !set.includes(detailQuery.data.bin)) {
      set.unshift(detailQuery.data.bin)
    }
    return set
  }, [binsQuery.data?.items, detailQuery.data?.bin])

  const invalidate = async () => {
    await utils.purchase.getInbound.invalidate({ id })
    await utils.purchase.listInbounds.invalidate()
    if (detailQuery.data?.purchaseOrderId) {
      await utils.purchase.getOrder.invalidate({ id: detailQuery.data.purchaseOrderId })
    }
  }

  const updateMutation = trpc.purchase.updateInbound.useMutation({
    onSuccess: async () => {
      await invalidate()
      setEditOpen(false)
      setNotice('已保存库位与备注。')
    },
    onError: (error) => setNotice(error.message),
  })
  const shelveMutation = trpc.purchase.confirmShelve.useMutation({
    onSuccess: async (inbound) => {
      await invalidate()
      setNotice(
        `${inbound.inboundNo} 已上架：库位 ${inbound.bin}；流水幂等键 ${inbound.idempotencyKey}`,
      )
    },
    onError: (error) => setNotice(error.message),
  })
  const cancelMutation = trpc.purchase.cancelInbound.useMutation({
    onSuccess: async (inbound) => {
      await invalidate()
      setNotice(`${inbound.inboundNo} 已取消。`)
    },
    onError: (error) => setNotice(error.message),
  })

  if (detailQuery.isLoading) {
    return (
      <DetailPageHeader
        backHref="/console/stock-inbounds"
        title="加载入库单…"
        description="正在从数据库读取…"
      />
    )
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/stock-inbounds"
          title="未找到入库单"
          description={detailQuery.error?.message || `入库单 ${id} 不存在。`}
        />
      </div>
    )
  }

  const current = detailQuery.data
  const order = orderQuery.data
  const canEdit = current.status === '待上架'
  const canShelve = current.status === '待上架'
  const canCancel = current.status === '待上架'

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: '入库单', href: '/console/stock-inbounds' }, { label: current.inboundNo }]}
      />

      <DetailPageHeader
        backHref="/console/stock-inbounds"
        title={current.inboundNo}
        description={`${current.sourceType} · ${current.sku} × ${current.quantity}`}
        badges={
          <>
            <Badge variant="outline">数据库</Badge>
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
                disabled={shelveMutation.isPending}
                onClick={() => shelveMutation.mutate({ id: current.id, operator: current.operator || '库管' })}
              >
                确认上架
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate({ id: current.id, reason: '库内取消' })}
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
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                openAdjustWith({
                  sku: current.sku,
                  warehouse: current.warehouse,
                  bin: current.bin,
                  qtySystem: current.quantity,
                })
              }
            >
              发起调整
            </Button>
          </div>
        }
      />

      <Alert>
        <AlertTitle>确认上架写库存流水</AlertTitle>
        <AlertDescription>
          采购路径：收货质检合格 → 自动生成本单（待上架）→ 确认上架写 inventory_movements（幂等键防重复）。
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
          { label: '状态', value: current.status },
        ]}
      />

      <DetailFieldGrid
        title="入库主信息"
        description="stock_inbounds / 采购入库：来源单据、SKU、数量、库位、操作人"
        fields={[
          { label: '入库单号', value: current.inboundNo, mono: true },
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
          待上架 → 已上架（确认上架写 inventory_movements，回写采购 qty_stocked）/ 已取消。采购入库由到货质检合格自动生成。
        </p>
      </DetailSection>

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
              options: binOptions.length > 0 ? binOptions : [current.bin || ''].filter(Boolean),
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
            updateMutation.mutate({
              id: current.id,
              bin: values.bin,
              operator: values.operator,
              remark: values.remark,
            })
          }}
          saveLabel="保存"
        />
      ) : null}

      {adjustDialog}
      {adjustNotice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {adjustNotice}
        </p>
      ) : null}
    </div>
  )
}
