'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
  StatusTimeline,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedDialog } from '@/components/console/erp-ued-workspace'
import { SyncConfirmDialog } from '@/components/console/sync-confirm-dialog'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

const eventOptions = ['LGS 揽收', '出境干线', '清关中', '清关完成', '官方尾程派送', '已签收', '物流异常']

export default function LogisticsLgsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const query = trpc.logistics.getBatch.useQuery({ id })
  const [notice, setNotice] = React.useState('')
  const [eventOpen, setEventOpen] = React.useState(false)
  const [submitConfirmOpen, setSubmitConfirmOpen] = React.useState(false)
  const [closeConfirmOpen, setCloseConfirmOpen] = React.useState(false)

  const appendMutation = trpc.logistics.appendBatchEvent.useMutation({
    onSuccess: async (row) => {
      await utils.logistics.getBatch.invalidate({ id })
      await utils.logistics.listBatches.invalidate()
      setNotice(`已追加事件到 ${row.batchNo}`)
      setEventOpen(false)
    },
    onError: (e) => setNotice(e.message),
  })
  const submitMutation = trpc.logistics.submitBatch.useMutation({
    onSuccess: async (row) => {
      await utils.logistics.getBatch.invalidate({ id })
      await utils.logistics.listBatches.invalidate()
      setNotice(`批次 ${row.batchNo} 已提交交运`)
    },
    onError: (e) => setNotice(e.message),
  })
  const closeMutation = trpc.logistics.closeBatch.useMutation({
    onSuccess: async (row) => {
      await utils.logistics.getBatch.invalidate({ id })
      await utils.logistics.listBatches.invalidate()
      setNotice(`批次 ${row.batchNo} 已关闭`)
    },
    onError: (e) => setNotice(e.message),
  })

  if (query.isLoading) {
    return <DetailPageHeader backHref="/console/logistics-lgs" title="加载 LGS 批次…" description="PostgreSQL" />
  }
  if (!query.data) {
    return <DetailPageHeader backHref="/console/logistics-lgs" title="未找到批次" description={id} />
  }
  const row = query.data
  const canSubmit = row.statusLabel === '开放中' || row.statusLabel === '已驳回'
  const canClose = row.statusLabel !== '已关闭' && row.statusLabel !== '已提交'

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: 'LGS 物流', href: '/console/logistics-lgs' }, { label: row.batchNo }]}
      />
      {eventOpen ? (
        <UedDialog
          title="追加 LGS 履约事件"
          description="事件写入批次 raw.events；可同步标记状态。"
          fields={[
            { key: 'event', label: '履约事件', options: eventOptions, required: true },
            { key: 'eventAt', label: '事件时间', type: 'datetime-local', required: true },
            { key: 'tracking', label: '运单号', placeholder: '可填写单个运单或批次号' },
            { key: 'carrier', label: '承运商', options: ['LGS', 'Daraz Express', '平台官方尾程'], required: true },
            { key: 'operator', label: '操作人', required: true },
            { key: 'exception', label: '异常说明', type: 'textarea', fullWidth: true },
          ]}
          onClose={() => setEventOpen(false)}
          onSave={(values) => {
            const status =
              values.event === '已签收'
                ? 'delivered'
                : values.event === '物流异常'
                  ? 'exception'
                  : values.event.includes('清关') || values.event.includes('揽收') || values.event.includes('干线')
                    ? 'in_transit'
                    : undefined
            appendMutation.mutate({
              batchId: row.id,
              event: values.event,
              eventAt: values.eventAt,
              tracking: values.tracking,
              carrier: values.carrier,
              operator: values.operator,
              exception: values.exception,
              status,
            })
          }}
        />
      ) : null}
      <DetailPageHeader
        backHref="/console/logistics-lgs"
        title={row.batchNo}
        description={`${row.site || '—'} · ${row.carrier} · ${row.statusLabel}`}
        badges={<Badge variant="secondary">{row.statusLabel}</Badge>}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEventOpen(true)}>
              录入履约事件
            </Button>
            {canSubmit ? (
              <Button
                size="sm"
                disabled={submitMutation.isPending}
                onClick={() => setSubmitConfirmOpen(true)}
              >
                提交交运
              </Button>
            ) : null}
            {canClose ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={closeMutation.isPending}
                onClick={() => setCloseConfirmOpen(true)}
              >
                关闭批次
              </Button>
            ) : null}
          </div>
        }
      />
      <DetailKpiRow
        items={[
          { label: '包裹数', value: String(row.packageCount) },
          { label: '站点', value: row.site || '—' },
          { label: '交接', value: row.handedOverAt || '—' },
          { label: '提交', value: row.submittedAt || '—' },
        ]}
      />
      <DetailSection title="批次信息">
        <DetailFieldGrid
          fields={[
            { label: '渠道', value: row.channel },
            { label: '承运商', value: row.carrier },
            { label: '发货仓', value: row.warehouseCode },
            { label: '运单摘要', value: row.trackingSummary || '—' },
          ]}
        />
      </DetailSection>
      <DetailSection title="包裹清单">
        {row.packages.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚未加入包裹</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {row.packages.map((p) => (
              <li key={p.shipmentId}>
                {p.externalPackageId} · {p.trackingNumber} · {p.order} · {p.statusLabel}
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
      <DetailSection title="事件">
        {row.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无事件</p>
        ) : (
          <StatusTimeline
            steps={row.events.map((e, i) => {
              const [status, ...rest] = e.split(' · ')
              return { at: rest[0] || '', status: status || e, note: rest.slice(1).join(' · '), current: i === row.events.length - 1 }
            })}
          />
        )}
      </DetailSection>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      <SyncConfirmDialog
        open={submitConfirmOpen}
        onOpenChange={setSubmitConfirmOpen}
        title="提交 LGS 交运"
        description="将批次内所有包裹提交到平台，标记为已发货。"
        scope={{
          label: '作用批次',
          value: `批次 ${row.batchNo} · ${row.packageCount} 个包裹 · ${row.carrier}`,
        }}
        impacts={[
          '提交后平台侧会标记这些订单为已发货，不可撤销',
          '成功包裹的 shipment 状态会推进为 shipped',
          '全部成功 → 批次状态 accepted；部分失败 → rejected（可修正后重提）',
        ]}
        platformCall={{
          label: '将调用平台 OpenAPI',
          detail: 'Lazop /order/fulfill/pack + /order/package/rts',
        }}
        confirmLabel="确认提交交运"
        destructive
        pending={submitMutation.isPending}
        onConfirm={() => {
          setSubmitConfirmOpen(false)
          submitMutation.mutate({ id: row.id })
        }}
      />
      <SyncConfirmDialog
        open={closeConfirmOpen}
        onOpenChange={setCloseConfirmOpen}
        title="关闭批次"
        description="关闭该批次，后续不可再追加包裹或提交交运。"
        scope={{
          label: '作用批次',
          value: `批次 ${row.batchNo} · ${row.packageCount} 个包裹`,
        }}
        impacts={[
          '批次状态变更为 closed，不可逆',
          '已关联的 shipment 不受影响',
        ]}
        confirmLabel="确认关闭"
        destructive
        pending={closeMutation.isPending}
        onConfirm={() => {
          setCloseConfirmOpen(false)
          closeMutation.mutate({ id: row.id })
        }}
      />
    </div>
  )
}
