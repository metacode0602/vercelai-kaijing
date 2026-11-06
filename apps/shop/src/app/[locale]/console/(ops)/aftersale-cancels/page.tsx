'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { CANCEL_STATUSES } from '@/lib/crossborder/aftersale-store'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function statusVariant(status: string) {
  if (status === '已驳回') return 'destructive' as const
  if (status === '已审核') return 'secondary' as const
  return 'outline' as const
}

export default function AftersaleCancelsPage() {
  const utils = trpc.useUtils()
  const listQuery = trpc.aftersale.listCancels.useQuery({ page: 1, pageSize: 100 })
  const statsQuery = trpc.aftersale.cancelStats.useQuery()
  const createMutation = trpc.aftersale.createCancel.useMutation({
    onSuccess: async (row) => {
      await Promise.all([
        utils.aftersale.listCancels.invalidate(),
        utils.aftersale.cancelStats.invalidate(),
        utils.aftersale.list.invalidate(),
      ])
      setOpen(false)
      setNotice(`${row.id} 已登记，待审核`)
    },
    onError: (e) => setNotice(e.message),
  })
  const approveMutation = trpc.aftersale.approveCancel.useMutation({
    onSuccess: async (res) => {
      await Promise.all([
        utils.aftersale.listCancels.invalidate(),
        utils.aftersale.cancelStats.invalidate(),
        utils.aftersale.list.invalidate(),
      ])
      setNotice(`${res.row.id}：${res.note}`)
    },
    onError: (e) => setNotice(e.message),
  })

  const rows = listQuery.data?.items ?? []
  const kpi = statsQuery.data ?? { total: 0, pending: 0, approved: 0, rejected: 0 }
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
      description="取消订单审核通过后可释放预留库存（写 order_release 流水）；仅退款不释放。"
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
          options: ['A-01-01', 'A-01-02', 'A-01-01-01', 'A-01-01-02', 'B-02-01-01'],
        },
        { key: 'reason', label: '原因', required: true },
        { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        createMutation.mutate({
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
      }}
      saveLabel={createMutation.isPending ? '提交中…' : '登记'}
    />
  ) : null

  return (
    <UedWorkspace
      title="取消与退款"
      description="取消订单 / 仅退款：审核后记账；取消类可经库存流水释放预留库存。"
      rows={rows}
      detailHref={(row) => `/console/aftersale-cancels/${encodeURIComponent(row.id)}`}
      searchKeys={[
        'id',
        'reverseOrderId',
        'externalReverseId',
        'order',
        'shop',
        'sku',
        'type',
        'status',
        'platformStatus',
        'refundId',
        'refundStatus',
        'reason',
        'reasonCode',
      ]}
      searchPlaceholder="搜索单号、订单或 SKU"
      filters={[{ label: '状态', options: [...CANCEL_STATUSES], key: 'status' }]}
      emptyText={listQuery.isLoading ? '加载中…' : '暂无取消/退款单。'}
      addLabel="登记取消/退款"
      onAdd={() => setOpen(true)}
      columns={[
        { key: 'id', label: '单号' },
        { key: 'reverseOrderId', label: '逆向单 ID' },
        { key: 'externalReverseId', label: '平台逆向单号' },
        { key: 'order', label: '原订单' },
        { key: 'shop', label: '店铺' },
        { key: 'sku', label: 'SKU' },
        { key: 'type', label: '类型' },
        { key: 'reasonCode', label: '原因码' },
        {
          key: 'refund',
          label: '退款',
          render: (row) => `${row.refund} ${row.currency}`,
        },
        { key: 'refundId', label: '退款单号' },
        { key: 'refundStatus', label: '退款状态' },
        {
          key: 'releaseReserved',
          label: '释放锁定',
          render: (row) => String(row.releaseReserved),
        },
        { key: 'platformStatus', label: '平台状态' },
        {
          key: 'status',
          label: '审核状态',
          render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
        },
      ]}
    >
      <DetailKpiRow items={kpiItems} />
      <UedPrototypeNotice>
        {
          "审核「取消订单」且存在 active 占库时写 order_release（幂等键 ledger:aftersale_cancel_release:{ext}:{orderLineId}）；已出库不做冲销。"
        }
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        {rows
          .filter((row) => row.status === '待确认')
          .map((row) => (
            <Button
              key={row.id}
              size="sm"
              variant="outline"
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate({ id: row.id })}
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
