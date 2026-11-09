'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

function statusVariant(status: string) {
  if (status === '已完成') return 'secondary' as const
  if (status === '已取消') return 'destructive' as const
  return 'outline' as const
}

function todayDateInput() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export default function PurchaseReceiptsPage() {
  const router = useLocaleRouter()
  const utils = trpc.useUtils()
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const receiptsQuery = trpc.purchase.listReceipts.useQuery({ page: 1, pageSize: 100 })
  const ordersQuery = trpc.purchase.listOrders.useQuery({ page: 1, pageSize: 100 })
  const rows = receiptsQuery.data?.items ?? []
  const orders = ordersQuery.data?.items ?? []
  const receivable = orders.filter((row) => ['已下发', '部分到货'].includes(row.status))

  const counts = React.useMemo(() => {
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1
      return acc
    }, {})
  }, [rows])

  const kpiItems = React.useMemo(
    () => [
      { label: '收货批次', value: String(rows.length), hint: 'purchase_receipts' },
      { label: '待质检', value: String(counts['待质检'] ?? 0), hint: '需完成合格/残次录入' },
      { label: '草稿', value: String(counts['草稿'] ?? 0) },
      { label: '已完成', value: String(counts['已完成'] ?? 0), hint: '合格数已生成入库单' },
    ],
    [rows.length, counts],
  )

  const poOptions = React.useMemo(() => {
    if (receivable.length === 0) return ['（暂无可收货采购单）']
    return receivable.map((order) => `${order.poNo} · ${order.supplier}`)
  }, [receivable])

  const registerMutation = trpc.purchase.registerReceipt.useMutation({
    onSuccess: async (receipt) => {
      await utils.purchase.listReceipts.invalidate()
      await utils.purchase.listOrders.invalidate()
      setOpen(false)
      setNotice(`${receipt.receiptNo} 已创建，正在进入详情…`)
      router.push(`/console/purchase-receipts/${encodeURIComponent(receipt.id)}`)
    },
    onError: (error) => {
      setOpen(false)
      setNotice(error.message)
    },
  })

  const editor = open ? (
    <UedDialog
      title="登记到货批次 · 主信息"
      description="从已下发/部分到货的采购单创建 purchase_receipts。明细按采购行剩余可收数量自动带出。"
      fields={[
        {
          key: 'po',
          label: '采购单',
          options: poOptions,
          required: true,
          helper: '仅展示仍可收货的采购单；供应商/仓库随单带出',
        },
        {
          key: 'batchNo',
          label: '到货批次编号',
          placeholder: '如 BATCH-20261107-01',
          required: true,
        },
        {
          key: 'arrivedAt',
          label: '到货日期',
          type: 'date',
          defaultValue: todayDateInput(),
          required: true,
        },
        {
          key: 'carrier',
          label: '物流商',
          placeholder: '如 顺丰 / DHL / 货代名称',
        },
        {
          key: 'trackingNo',
          label: '物流单号',
          placeholder: '填写物流运单号',
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
          placeholder: '供应商送货单',
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
      onSave={async (values) => {
        const poNo = (values.po || '').split(' · ')[0]?.trim()
        if (!poNo || poNo.startsWith('（')) {
          setNotice('请选择可收货的采购单。')
          setOpen(false)
          return
        }
        try {
          const order = await utils.purchase.getOrder.fetch({ id: poNo })
          const lines = order.lines
            .map((line) => ({
              poLineId: line.id,
              sku: line.sku,
              qtyArrived: Math.max(0, line.qtyOrdered - line.qtyReceived),
            }))
            .filter((line) => line.qtyArrived > 0)
          if (!lines.length) {
            setNotice('该采购单已无待收数量')
            setOpen(false)
            return
          }
          registerMutation.mutate({
            purchaseOrderId: order.id,
            batchNo: values.batchNo?.trim() || undefined,
            arrivedAt: values.arrivedAt || undefined,
            carrier: values.carrier?.trim() || undefined,
            trackingNo: values.trackingNo?.trim() || undefined,
            receivedBy: values.receivedBy,
            deliveryNote: values.deliveryNote,
            remark: values.remark,
            lines,
          })
        } catch (error) {
          setNotice(error instanceof Error ? error.message : '加载采购单失败')
          setOpen(false)
        }
      }}
      saveLabel={registerMutation.isPending ? '创建中…' : '创建收货单并继续'}
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="到货质检入库"
        description="采购单分批到货 → 质检（合格/残次）→ 生成入库上架单。数据经 tRPC 写入 PostgreSQL。"
        rows={rows}
        detailHref={(row) => `/console/purchase-receipts/${encodeURIComponent(row.id)}`}
        searchKeys={[
          'id',
          'receiptNo',
          'purchaseOrderId',
          'firstSku',
          'supplier',
          'warehouse',
          'batchNo',
          'carrier',
          'trackingNo',
          'receivedBy',
          'status',
          'deliveryNote',
        ]}
        searchPlaceholder="搜索收货单号、采购单、SKU、批次或物流单号"
        filters={[{ label: '状态', options: ['草稿', '待质检', '已完成', '已取消'] }]}
        emptyText="暂无收货批次。请从可收货采购单登记到货。"
        addLabel="登记到货"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'receiptNo', label: '收货单号' },
          { key: 'batchNo', label: '批次编号' },
          { key: 'purchaseOrderId', label: '采购单' },
          { key: 'supplier', label: '供应商' },
          {
            key: 'trackingNo',
            label: '物流',
            render: (row) =>
              row.carrier || row.trackingNo
                ? [row.carrier, row.trackingNo].filter(Boolean).join(' · ')
                : '—',
          },
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
        {receiptsQuery.isError ? (
          <Alert variant="destructive">
            <AlertTitle>加载失败</AlertTitle>
            <AlertDescription>{receiptsQuery.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <DetailKpiRow items={kpiItems} />
        <UedPrototypeNotice>
          流程：收货 → 质检 → 仅合格数量生成入库单；确认上架会记账库存流水，重复提交按幂等键拦截。
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
          <Button size="sm" variant="ghost" onClick={() => router.push('/console/purchase-orders')}>
            打开采购单
          </Button>
          <Button size="sm" variant="ghost" onClick={() => router.push('/console/stock-inbounds')}>
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
