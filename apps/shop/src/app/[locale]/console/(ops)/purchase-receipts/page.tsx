'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  listReceivablePurchaseOrders,
  usePurchaseOrders,
} from '@/lib/crossborder/purchase-order-store'
import {
  countReceiptsByStatus,
  createReceiptFromPurchaseOrder,
  toReceiptListRow,
  usePurchaseReceipts,
} from '@/lib/crossborder/purchase-receipt-store'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function statusVariant(status: string) {
  if (status === '已完成') return 'secondary' as const
  if (status === '已取消') return 'destructive' as const
  return 'outline' as const
}

export default function PurchaseReceiptsPage() {
  const receipts = usePurchaseReceipts()
  const orders = usePurchaseOrders()
  const rows = React.useMemo(() => receipts.map(toReceiptListRow), [receipts])
  const counts = React.useMemo(() => countReceiptsByStatus(receipts), [receipts])
  const receivable = React.useMemo(() => listReceivablePurchaseOrders(orders), [orders])
  const router = useLocaleRouter()
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const poOptions = React.useMemo(() => {
    if (receivable.length === 0) return ['（暂无可收货采购单）']
    return receivable.map((order) => {
      const openQty = order.lines.reduce((sum, line) => sum + Math.max(0, line.qtyOrdered - line.qtyReceived), 0)
      return `${order.poNo} · ${order.supplier} · 待收 ${openQty}`
    })
  }, [receivable])

  const kpiItems = React.useMemo(
    () => [
      { label: '收货批次', value: String(rows.length), hint: 'purchase_receipts' },
      { label: '待质检', value: String(counts.待质检), hint: '需完成合格/残次录入' },
      { label: '草稿', value: String(counts.草稿) },
      { label: '已完成', value: String(counts.已完成), hint: '合格数已生成入库单' },
    ],
    [rows.length, counts],
  )

  const editor = open ? (
    <UedDialog
      title="登记到货批次 · 主信息"
      description="从已下发/部分到货的采购单创建 purchase_receipts。明细按采购行剩余可收数量自动带出；保存后进入详情清点数量并提交质检。"
      fields={[
        {
          key: 'po',
          label: '采购单',
          options: poOptions,
          required: true,
          helper: '仅展示仍有未收数量的采购单；供应商/仓库随单带出',
        },
        {
          key: 'receivedBy',
          label: '收货操作人',
          required: true,
          defaultValue: '兰雨晨',
        },
        {
          key: 'deliveryNote',
          label: '送货单号',
          placeholder: '供应商送货单 / 物流单号',
        },
        {
          key: 'remark',
          label: '收货备注',
          type: 'textarea',
          fullWidth: true,
          placeholder: '破损、短少、分批说明等',
        },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const poNo = (values.po || '').split(' · ')[0]?.trim()
        if (!poNo || poNo.startsWith('（')) {
          setNotice('请选择可收货的采购单。')
          setOpen(false)
          return
        }
        const result = createReceiptFromPurchaseOrder(receipts, poNo, {
          receivedBy: values.receivedBy,
          deliveryNote: values.deliveryNote,
          remark: values.remark,
        })
        setOpen(false)
        if (!result.ok) {
          setNotice(result.reason)
          return
        }
        setNotice(
          `${result.receipt.receiptNo} 已创建（草稿），供应商「${result.receipt.supplier}」、仓库「${result.receipt.warehouse}」已带出。正在进入详情…`,
        )
        router.push(`/console/purchase-receipts/${encodeURIComponent(result.receipt.id)}`)
      }}
      saveLabel="创建收货单并继续"
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="到货质检入库"
        description="采购单分批到货 → 质检（合格/残次）→ 生成入库上架单。仅合格数量进入可用库存；残次进不可售并要求原因。"
        rows={rows}
        detailHref={(row) => `/console/purchase-receipts/${encodeURIComponent(row.id)}`}
        searchKeys={[
          'id',
          'receiptNo',
          'purchaseOrderId',
          'firstSku',
          'supplier',
          'warehouse',
          'receivedBy',
          'status',
          'deliveryNote',
        ]}
        searchPlaceholder="搜索收货单号、采购单、SKU 或供应商"
        filters={[{ label: '状态', options: [...['草稿', '待质检', '已完成', '已取消']] }]}
        emptyText="暂无收货批次。请从可收货采购单登记到货，或到「采购单」详情点击登记到货。"
        addLabel="登记到货"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'receiptNo', label: '收货单号' },
          { key: 'purchaseOrderId', label: '采购单' },
          { key: 'supplier', label: '供应商' },
          {
            key: 'firstSku',
            label: '首行 SKU',
            render: (row) => (row.lineCount > 0 ? row.firstSku : '—'),
          },
          {
            key: 'totalArrived',
            label: '到货',
            render: (row) => String(row.totalArrived),
          },
          {
            key: 'totalPassed',
            label: '合格',
            render: (row) => String(row.totalPassed),
          },
          {
            key: 'totalFailed',
            label: '残次',
            render: (row) => String(row.totalFailed),
          },
          { key: 'warehouse', label: '仓库' },
          { key: 'receivedBy', label: '操作人' },
          { key: 'arrivedAt', label: '到货时间' },
          {
            key: 'status',
            label: '状态',
            render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
          },
        ]}
      >
        <DetailKpiRow items={kpiItems} />
        <UedPrototypeNotice>
          对齐 schema：purchase_receipts（分批）→ 质检行结果 → 仅 qty_passed 生成入库/库存流水（幂等键）。采购申请未批准不得生成
          PO/收货。列表与详情共享本地会话 store，可与采购单、入库单互相跳转。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">可收货采购单 {receivable.length}</Badge>
          {rows
            .filter((row) => row.status === '待质检')
            .slice(0, 4)
            .map((row) => (
              <Button
                key={row.id}
                size="sm"
                variant="outline"
                onClick={() => router.push(`/console/purchase-receipts/${encodeURIComponent(row.id)}`)}
              >
                去质检 · {row.receiptNo}
              </Button>
            ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => router.push('/console/purchase-orders')}
          >
            打开采购单
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => router.push('/console/stock-inbounds')}
          >
            打开入库单
          </Button>
        </div>
        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </UedWorkspace>
    </>
  )
}
