'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { useLocaleRouter, LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

function statusVariant(status: string) {
  if (status === '已出库') return 'secondary' as const
  if (status === '已取消') return 'destructive' as const
  return 'outline' as const
}

type OutboundRow = {
  id: string
  outboundNo: string
  outboundType: string
  warehouse: string
  orderId?: string | null
  externalOrderId?: string
  order?: string
  packageId: string
  firstSku: string
  totalQty: number
  picker: string
  status: string
  source: 'order' | 'wms'
}

export default function StockOutboundsPage() {
  const utils = trpc.useUtils()
  const router = useLocaleRouter()
  const [notice, setNotice] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [tab, setTab] = React.useState<'all' | 'order' | 'wms'>('all')

  const orderList = trpc.order.listOutbounds.useQuery({ page: 1, pageSize: 100 })
  const orderStats = trpc.order.outboundStats.useQuery()
  const wmsList = trpc.wms.listOutbounds.useQuery({ page: 1, pageSize: 100 })
  const wmsStats = trpc.wms.outboundStats.useQuery()
  const meta = trpc.wms.meta.useQuery()
  const warehouses = trpc.wms.listWarehouses.useQuery({ page: 1, pageSize: 50, status: '启用' })
  const bins = trpc.wms.listBins.useQuery({ page: 1, pageSize: 100 })

  const invalidateAll = async () => {
    await Promise.all([
      utils.order.listOutbounds.invalidate(),
      utils.order.outboundStats.invalidate(),
      utils.wms.listOutbounds.invalidate(),
      utils.wms.outboundStats.invalidate(),
      utils.wms.listBalances.invalidate(),
      utils.wms.listMovements.invalidate(),
    ])
  }

  const advanceOrder = trpc.order.advanceOutbound.useMutation({
    onSuccess: async (row) => {
      await invalidateAll()
      setNotice(`${row.outboundNo} → ${row.status}`)
    },
    onError: (e) => setNotice(e.message),
  })
  const cancelOrder = trpc.order.cancelOutbound.useMutation({
    onSuccess: async (row) => {
      await invalidateAll()
      setNotice(`${row.outboundNo} 已取消`)
    },
    onError: (e) => setNotice(e.message),
  })
  const advanceWms = trpc.wms.advanceOutbound.useMutation({
    onSuccess: async (row) => {
      await invalidateAll()
      setNotice(`${row.outboundNo} → ${row.status}`)
    },
    onError: (e) => setNotice(e.message),
  })
  const postWms = trpc.wms.postOutbound.useMutation({
    onSuccess: async (row) => {
      await invalidateAll()
      setNotice(`${row.outboundNo} 已过账（ledger:wms_outbound:*）`)
    },
    onError: (e) => setNotice(e.message),
  })
  const cancelWms = trpc.wms.cancelOutbound.useMutation({
    onSuccess: async (row) => {
      await invalidateAll()
      setNotice(`${row.outboundNo} 已取消`)
    },
    onError: (e) => setNotice(e.message),
  })
  const createWms = trpc.wms.createOutbound.useMutation({
    onSuccess: async (row) => {
      await invalidateAll()
      setOpen(false)
      setNotice(`已创建非订单出库 ${row.outboundNo}`)
    },
    onError: (e) => setNotice(e.message),
  })

  const orderRows: OutboundRow[] = (orderList.data?.items ?? []).map((row) => ({
    id: row.id,
    outboundNo: row.outboundNo,
    outboundType: row.outboundType,
    warehouse: row.warehouse,
    orderId: row.orderId,
    externalOrderId: row.externalOrderId,
    packageId: row.packageId,
    firstSku: row.firstSku,
    totalQty: row.totalQty,
    picker: row.picker,
    status: row.status,
    source: 'order',
  }))
  const wmsRows: OutboundRow[] = (wmsList.data?.items ?? []).map((row) => ({
    id: row.id,
    outboundNo: row.outboundNo,
    outboundType: row.outboundType,
    warehouse: row.warehouse,
    order: row.order,
    packageId: row.packageId,
    firstSku: row.firstSku,
    totalQty: row.totalQty,
    picker: row.picker,
    status: row.status,
    source: 'wms',
  }))

  const rows =
    tab === 'order' ? orderRows : tab === 'wms' ? wmsRows : [...wmsRows, ...orderRows]

  const orderCounts = orderStats.data?.byStatus ?? {}
  const wmsCounts = wmsStats.data?.byStatus ?? {}
  const kpiItems = [
    {
      label: '出库单',
      value: String((orderStats.data?.total ?? 0) + (wmsStats.data?.total ?? 0)),
    },
    {
      label: '待拣货',
      value: String((orderCounts['待拣货'] ?? 0) + (wmsCounts['待拣货'] ?? 0)),
    },
    {
      label: '非订单',
      value: String(wmsStats.data?.total ?? 0),
      hint: '领用/调拨/报损等',
    },
    {
      label: '已出库',
      value: String((orderCounts['已出库'] ?? 0) + (wmsCounts['已出库'] ?? 0)),
    },
  ]

  const warehouseOptions = (warehouses.data?.items ?? []).map((w) => w.code)
  const binOptions = (bins.data?.items ?? []).map((b) => b.code)

  const editor = open ? (
    <UedDialog
      title="新建非订单出库"
      description="领用 / 调拨出 / 盘亏报损等。过账写 ledger:wms_outbound:*，不释放销售订单占库。"
      fields={[
        {
          key: 'outboundType',
          label: '出库类型',
          options: meta.data?.outboundTypes ?? ['样品出库', '调拨出库', '盘亏出库', '其他出库'],
          required: true,
        },
        {
          key: 'warehouse',
          label: '仓库',
          options: warehouseOptions.length ? warehouseOptions : ['WH-CN-XMN-001'],
          required: true,
        },
        { key: 'sku', label: 'SKU', required: true, placeholder: 'HSY000001001' },
        {
          key: 'bin',
          label: '库位',
          options: binOptions.length ? binOptions : ['A-01-01-01'],
          required: true,
        },
        { key: 'quantity', label: '数量', required: true },
        { key: 'reason', label: '原因', required: true },
        { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) =>
        createWms.mutate({
          outboundType: values.outboundType,
          warehouse: values.warehouse,
          reason: values.reason,
          remark: values.remark,
          lines: [
            {
              sku: values.sku,
              bin: values.bin,
              quantity: Number(values.quantity || 0),
            },
          ],
        })
      }
    />
  ) : null

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>出库单已接 PostgreSQL</AlertTitle>
        <AlertDescription>
          订单出库走 `order.*`；非订单出库走 `wms.*`（幂等 ledger:wms_outbound:*，不改 reserved）。
          {notice ? ` ${notice}` : ''}
        </AlertDescription>
      </Alert>
      <DetailKpiRow items={kpiItems} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={tab === 'all' ? 'default' : 'outline'} onClick={() => setTab('all')}>
          全部
        </Button>
        <Button size="sm" variant={tab === 'order' ? 'default' : 'outline'} onClick={() => setTab('order')}>
          订单出库
        </Button>
        <Button size="sm" variant={tab === 'wms' ? 'default' : 'outline'} onClick={() => setTab('wms')}>
          非订单出库
        </Button>
        <Button size="sm" onClick={() => setOpen(true)}>
          新建非订单出库
        </Button>
        <Button size="sm" variant="outline" asChild>
          <LocaleLink href="/console/orders">订单</LocaleLink>
        </Button>
        <Button size="sm" variant="outline" onClick={() => router.push('/console/inventory-ledger')}>
          库存流水
        </Button>
      </div>
      {editor}
      <UedWorkspace
        title="出库单"
        description="stock_outbounds · 订单 + WMS 非订单"
        rows={rows}
        detailHref={(row) => `/console/stock-outbounds/${encodeURIComponent(row.id)}`}
        searchKeys={['outboundNo', 'externalOrderId', 'order', 'packageId', 'firstSku', 'status', 'picker', 'outboundType']}
        searchPlaceholder="出库单号 / 订单 / 包裹 / SKU"
        filters={[{ label: '状态', options: ['待拣货', '拣货中', '已复核', '已出库', '已取消'] }]}
        emptyText={orderList.isLoading || wmsList.isLoading ? '加载中…' : '暂无出库单'}
        columns={[
          { key: 'outboundNo', label: '出库单号' },
          { key: 'outboundType', label: '类型' },
          {
            key: 'externalOrderId',
            label: '订单',
            render: (row) =>
              row.orderId ? (
                <LocaleLink
                  href={`/console/orders/${encodeURIComponent(row.orderId)}`}
                  className="underline-offset-2 hover:underline"
                >
                  {row.externalOrderId || '—'}
                </LocaleLink>
              ) : (
                row.order || row.externalOrderId || '—'
              ),
          },
          { key: 'packageId', label: '包裹' },
          { key: 'firstSku', label: '首行 SKU' },
          { key: 'totalQty', label: '数量', render: (row) => String(row.totalQty) },
          { key: 'warehouse', label: '仓库' },
          { key: 'picker', label: '拣货人' },
          {
            key: 'status',
            label: '状态',
            render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
          },
          {
            key: 'id',
            label: '操作',
            render: (row) => (
              <div className="flex gap-1">
                {row.source === 'order' && row.status !== '已出库' && row.status !== '已取消' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.preventDefault()
                      advanceOrder.mutate({ id: row.id })
                    }}
                  >
                    推进
                  </Button>
                ) : null}
                {row.source === 'wms' && row.status !== '已出库' && row.status !== '已取消' ? (
                  <>
                    {row.status !== '已复核' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault()
                          advanceWms.mutate({ id: row.id })
                        }}
                      >
                        推进
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault()
                        postWms.mutate({ id: row.id })
                      }}
                    >
                      过账
                    </Button>
                  </>
                ) : null}
                {row.status === '待拣货' || row.status === '拣货中' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.preventDefault()
                      if (row.source === 'wms') cancelWms.mutate({ id: row.id, reason: '人工取消' })
                      else cancelOrder.mutate({ id: row.id, reason: '人工取消' })
                    }}
                  >
                    取消
                  </Button>
                ) : null}
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
