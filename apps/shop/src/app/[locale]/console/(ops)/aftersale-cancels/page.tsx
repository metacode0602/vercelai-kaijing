'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  CANCEL_STATUSES,
  approveCancel,
  countCancelsByStatus,
  createCancel,
  useAftersaleCancels,
} from '@/lib/crossborder/aftersale-store'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function statusVariant(status: string) {
  if (status === '已驳回') return 'destructive' as const
  if (status === '已审核') return 'secondary' as const
  return 'outline' as const
}

export default function AftersaleCancelsPage() {
  const rows = useAftersaleCancels()
  const kpi = React.useMemo(() => countCancelsByStatus(rows), [rows])
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const kpiItems = React.useMemo(
    () => [
      { label: '取消/退款单', value: String(kpi.total) },
      { label: '待确认', value: String(kpi.pending) },
      { label: '已审核', value: String(kpi.approved) },
      { label: '已驳回', value: String(kpi.rejected) },
    ],
    [kpi],
  )

  const editor = open ? (
    <UedDialog
      title="登记取消 / 退款"
      description="取消订单审核通过后可释放预留库存（经 WMS 流水）；仅退款不释放。"
      fields={[
        { key: 'order', label: '原订单', required: true },
        { key: 'shop', label: '店铺', options: ['Daraz LK', 'Lazada MY', 'Lazada PH'] },
        {
          key: 'sku',
          label: '内部 SKU',
          options: ['HSY000001001', 'HSY000001002', 'HSY000002001'],
          required: true,
        },
        {
          key: 'type',
          label: '类型',
          options: ['取消订单', '仅退款', '退货退款'],
          required: true,
        },
        { key: 'refund', label: '退款金额', type: 'number', required: true },
        { key: 'currency', label: '币种', options: ['LKR', 'MYR', 'PHP', 'USD'], required: true },
        {
          key: 'releaseReserved',
          label: '释放锁定数量',
          type: 'number',
          helper: '取消订单时填写；仅退款填 0',
        },
        {
          key: 'warehouse',
          label: '仓库',
          options: ['WH-CN-XMN-001'],
        },
        {
          key: 'bin',
          label: '库位',
          options: ['A-01-01-01', 'A-01-01-02', 'B-02-01-01'],
        },
        { key: 'reason', label: '原因', required: true },
        { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const result = createCancel({
          order: values.order || '',
          shop: values.shop || 'Daraz LK',
          sku: values.sku || '',
          type: values.type || '取消订单',
          refund: Number(values.refund),
          currency: values.currency || 'LKR',
          releaseReserved: Number(values.releaseReserved || 0),
          warehouse: values.warehouse,
          bin: values.bin,
          reason: values.reason || '',
          remark: values.remark,
        })
        if (!result.ok) {
          setNotice(result.reason)
          return
        }
        setNotice(`${result.row.id} 已登记，待审核`)
        setOpen(false)
      }}
    />
  ) : null

  return (
    <UedWorkspace
      title="取消与退款"
      description="取消订单 / 仅退款：审核后记账；取消类可经 WMS 流水释放预留库存。"
      rows={rows}
      detailHref={(row) => `/console/aftersale-cancels/${encodeURIComponent(row.id)}`}
      searchKeys={['id', 'order', 'shop', 'sku', 'type', 'status', 'reason']}
      searchPlaceholder="搜索单号、订单或 SKU"
      filters={[{ label: '状态', options: [...CANCEL_STATUSES], key: 'status' }]}
      emptyText="暂无取消/退款单。"
      addLabel="登记取消/退款"
      onAdd={() => setOpen(true)}
      columns={[
        { key: 'id', label: '单号' },
        { key: 'order', label: '原订单' },
        { key: 'shop', label: '店铺' },
        { key: 'sku', label: 'SKU' },
        { key: 'type', label: '类型' },
        {
          key: 'refund',
          label: '退款',
          render: (row) => `${row.refund} ${row.currency}`,
        },
        {
          key: 'releaseReserved',
          label: '释放锁定',
          render: (row) => String(row.releaseReserved),
        },
        { key: 'platformSync', label: '平台同步' },
        {
          key: 'status',
          label: '状态',
          render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
        },
      ]}
    >
      <DetailKpiRow items={kpiItems} />
      <UedPrototypeNotice>
        审核「取消订单」且释放数量 &gt; 0 时写 order_release 流水；禁止直改锁定余额。
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        {rows
          .filter((row) => row.status === '待确认')
          .map((row) => (
            <Button
              key={row.id}
              size="sm"
              variant="outline"
              onClick={() => {
                const result = approveCancel(row.id)
                setNotice(result.ok ? `${row.id}：${result.note}` : result.reason)
              }}
            >
              审核通过 · {row.id}
            </Button>
          ))}
      </div>
      {editor}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </UedWorkspace>
  )
}
