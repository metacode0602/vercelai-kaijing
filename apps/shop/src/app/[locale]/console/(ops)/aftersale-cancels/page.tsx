'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function statusVariant(status: string) {
  if (status === '已驳回') return 'destructive' as const
  if (status === '已审核') return 'secondary' as const
  return 'outline' as const
}

function releaseVariant(status: string) {
  if (status === 'released') return 'secondary' as const
  if (status === 'skipped' || status === 'failed') return 'outline' as const
  return 'outline' as const
}

function refundVariant(decision: string) {
  if (decision === 'agreed') return 'secondary' as const
  if (decision === 'rejected') return 'destructive' as const
  if (decision === 'scheduled') return 'default' as const
  if (decision === 'unsupported' || decision === 'skipped') return 'outline' as const
  return 'outline' as const
}

export default function AftersaleCancelsPage() {
  const utils = trpc.useUtils()
  const listQuery = trpc.aftersale.listCancels.useQuery({ page: 1, pageSize: 100 })
  const statsQuery = trpc.aftersale.cancelStats.useQuery()
  const metaQuery = trpc.aftersale.meta.useQuery()

  const invalidateAll = async () =>
    Promise.all([
      utils.aftersale.listCancels.invalidate(),
      utils.aftersale.cancelStats.invalidate(),
      utils.aftersale.list.invalidate(),
    ])

  const createMutation = trpc.aftersale.createCancel.useMutation({
    onSuccess: async (row) => {
      await invalidateAll()
      setOpen(false)
      setNotice(`${row.id} 已登记，待审核`)
    },
    onError: (e) => setNotice(e.message),
  })
  const releaseMutation = trpc.aftersale.releaseReserved.useMutation({
    onSuccess: async (res) => {
      await invalidateAll()
      setNotice(`${res.row.id}：${res.note}`)
    },
    onError: (e) => setNotice(e.message),
  })
  const agreeMutation = trpc.aftersale.decideRefund.useMutation({
    onSuccess: async (row) => {
      await invalidateAll()
      setNotice(`${row.id} 已同意退款`)
    },
    onError: (e) => setNotice(e.message),
  })
  const rejectMutation = trpc.aftersale.decideRefund.useMutation({
    onSuccess: async (row) => {
      await invalidateAll()
      setNotice(`${row.id} 已拒绝退款`)
    },
    onError: (e) => setNotice(e.message),
  })
  const toManualMutation = trpc.aftersale.cancelScheduledRefund.useMutation({
    onSuccess: async (row) => {
      await invalidateAll()
      setNotice(`${row.id} 已改为人工处理`)
    },
    onError: (e) => setNotice(e.message),
  })

  const rows = listQuery.data?.items ?? []
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const kpiItems = React.useMemo(
    () => [
      { label: '取消/退款单', value: String(statsQuery.data?.total ?? 0) },
      { label: '待确认', value: String(statsQuery.data?.pending ?? 0) },
      { label: '已审核', value: String(statsQuery.data?.approved ?? 0) },
      { label: '已驳回', value: String(statsQuery.data?.rejected ?? 0) },
    ],
    [statsQuery.data],
  )

  const editor = open ? (
    <UedDialog
      title="登记取消 / 退款"
      description="人工补录例外单据；正常取消由平台同步建档，按店铺策略自动处理。"
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
      description="买家在平台发起取消 / 仅退款，系统同步建档并按店铺策略释放未发货占库、按等待天数处理退款。占库释放与退款分开执行。"
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
      filters={[{ label: '状态', options: [...(metaQuery.data?.cancelStatuses ?? [])], key: 'status' }]}
      emptyText={listQuery.isLoading ? '加载中…' : '暂无取消/退款单。'}
      addLabel="登记取消/退款"
      onAdd={() => setOpen(true)}
      columns={[
        { key: 'id', label: '单号' },
        { key: 'externalReverseId', label: '平台逆向单号' },
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
          key: 'inventoryReleaseStatus',
          label: '占库释放',
          render: (row) => (
            <Badge variant={releaseVariant(row.inventoryReleaseStatus)}>
              {row.inventoryReleaseStatusLabel}
            </Badge>
          ),
        },
        {
          key: 'refundDecision',
          label: '退款决定',
          render: (row) => (
            <Badge variant={refundVariant(row.refundDecision)}>
              {row.refundDecisionLabel}
              {row.refundDueAt && row.refundDecision === 'scheduled'
                ? ` · ${row.refundDueAt}`
                : ''}
            </Badge>
          ),
        },
        {
          key: 'platformStatus',
          label: '平台状态',
          render: (row) => <Badge variant="outline">{row.platformStatus}</Badge>,
        },
        {
          key: 'status',
          label: '审核状态',
          render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
        },
        {
          key: 'actions',
          label: '操作',
          render: (row) => (
            <div className="flex flex-wrap justify-end gap-1">
              {row.inventoryReleaseStatus === 'pending_manual' && row.type !== '仅退款' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={releaseMutation.isPending}
                  onClick={() => releaseMutation.mutate({ id: row.id })}
                >
                  释放占库
                </Button>
              ) : null}
              {(row.refundDecision === 'pending_manual' || row.refundDecision === 'scheduled') ? (
                <>
                  <Button
                    size="sm"
                    disabled={agreeMutation.isPending}
                    onClick={() => agreeMutation.mutate({ id: row.id, action: 'agree' })}
                  >
                    同意退款
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate({ id: row.id, action: 'reject', reason: '人工拒绝' })}
                  >
                    拒绝
                  </Button>
                </>
              ) : null}
              {row.refundDecision === 'scheduled' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={toManualMutation.isPending}
                  onClick={() => toManualMutation.mutate({ id: row.id })}
                >
                  改为人工
                </Button>
              ) : null}
            </div>
          ),
        },
      ]}
    >
      <DetailKpiRow items={kpiItems} />
      <UedPrototypeNotice>
        {'占库释放与退款分开：买家取消入库后按策略释放未发货占库（order_release 流水）；退款按等待天数处理，平台支持时自动同意。详见 docs/design/aftersale-cancel-ingest-and-policy.md。'}
      </UedPrototypeNotice>
      {editor}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </UedWorkspace>
  )
}
