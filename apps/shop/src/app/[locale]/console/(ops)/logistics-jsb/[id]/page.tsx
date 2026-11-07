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

const eventOptions = ['自营仓出库', '交接 JSB', '清关资料提交', '清关中', '清关完成', '官方尾程派送', '已签收', '物流异常']

export default function LogisticsJsbDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const query = trpc.logistics.getBatch.useQuery({ id })
  const carriersQuery = trpc.carriers.list.useQuery({ page: 1, pageSize: 100, status: '启用' })
  const [notice, setNotice] = React.useState('')
  const [eventOpen, setEventOpen] = React.useState(false)
  const [submitConfirmOpen, setSubmitConfirmOpen] = React.useState(false)
  const [closeConfirmOpen, setCloseConfirmOpen] = React.useState(false)
  const [carrierDraft, setCarrierDraft] = React.useState('')

  const appendMutation = trpc.logistics.appendBatchEvent.useMutation({
    onSuccess: async (row) => {
      await utils.logistics.getBatch.invalidate({ id })
      await utils.logistics.listBatches.invalidate()
      setNotice(`已追加节点到 ${row.batchNo}`)
      setEventOpen(false)
    },
    onError: (e) => setNotice(e.message),
  })
  const submitMutation = trpc.logistics.submitBatch.useMutation({
    onSuccess: async (row) => {
      await utils.logistics.getBatch.invalidate({ id })
      await utils.logistics.listBatches.invalidate()
      setNotice(`批次 ${row.batchNo} 已提交交接`)
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
  const carrierMutation = trpc.logistics.updateBatchCarrier.useMutation({
    onSuccess: async (row) => {
      await utils.logistics.getBatch.invalidate({ id })
      await utils.logistics.listBatches.invalidate()
      setNotice(`批次 ${row.batchNo} 承运商已更新`)
    },
    onError: (e) => setNotice(e.message),
  })
  React.useEffect(() => {
    if (query.data?.carrierId != null) setCarrierDraft(query.data.carrierId || '')
  }, [query.data?.id, query.data?.carrierId])

  if (query.isLoading) {
    return <DetailPageHeader backHref="/console/logistics-jsb" title="加载 JSB 批次…" description="PostgreSQL" />
  }
  if (!query.data) {
    return <DetailPageHeader backHref="/console/logistics-jsb" title="未找到批次" description={id} />
  }
  const row = query.data
  const canSubmit = row.statusLabel === '开放中' || row.statusLabel === '已驳回'
  const canClose = row.statusLabel !== '已关闭' && row.statusLabel !== '已提交'

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: 'JSB 与 TH 物流', href: '/console/logistics-jsb' }, { label: row.batchNo }]}
      />
      {eventOpen ? (
        <UedDialog
          title="补录 TH 链路节点"
          description="JSB 无可靠 API（Q17）：节点以 source=import/manual 写入。"
          fields={[
            { key: 'event', label: '链路节点', options: eventOptions, required: true },
            { key: 'eventAt', label: '节点时间', type: 'datetime-local', required: true },
            { key: 'fee', label: '费用（含币种）', placeholder: '如 THB 1,240' },
            { key: 'operator', label: '操作人', options: ['杨洁', '黄发聪'], required: true },
            { key: 'exception', label: '异常说明', type: 'textarea', fullWidth: true },
          ]}
          onClose={() => setEventOpen(false)}
          onSave={(values) => {
            const status =
              values.event === '已签收'
                ? 'delivered'
                : values.event === '物流异常'
                  ? 'exception'
                  : values.event.includes('清关') || values.event.includes('尾程') || values.event.includes('交接')
                    ? 'in_transit'
                    : undefined
            appendMutation.mutate({
              batchId: row.id,
              event: values.event,
              eventAt: values.eventAt,
              operator: values.operator,
              exception: values.exception,
              status,
            })
          }}
        />
      ) : null}
      <DetailPageHeader
        backHref="/console/logistics-jsb"
        title={row.batchNo}
        description={`TH · ${(carriersQuery.data?.items ?? []).find((c) => c.id === row.carrierId)?.code || row.carrier || '—'} · ${row.statusLabel}`}
        badges={<Badge variant="secondary">{row.statusLabel}</Badge>}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEventOpen(true)}>
              补录链路节点
            </Button>
            {canSubmit ? (
              <Button
                size="sm"
                disabled={submitMutation.isPending}
                onClick={() => setSubmitConfirmOpen(true)}
              >
                提交交接
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
          { label: '出库', value: row.departedAt || row.createdAt || '—' },
          { label: 'JSB 交接', value: row.jsbHandover || row.handedOverAt || '—' },
          { label: '签收', value: row.signedAt || '—' },
        ]}
      />
      <DetailSection title="批次信息">
        <DetailFieldGrid
          fields={[
            { label: '渠道', value: row.channel },
            {
              label: '承运商',
              value:
                (carriersQuery.data?.items ?? []).find((c) => c.id === row.carrierId)?.name ||
                row.carrier ||
                '—',
            },
            { label: '清关', value: row.customs || '—' },
            { label: '官方尾程', value: row.lastMile || '—' },
            { label: '费用', value: row.fee || '—' },
            { label: '发货仓', value: row.warehouseCode },
            { label: '运单摘要', value: row.trackingSummary || '—' },
          ]}
        />
      </DetailSection>

      <DetailSection title="承运商">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">关联主档</span>
            <select
              className="h-9 min-w-[220px] rounded-md border bg-background px-2"
              value={carrierDraft}
              onChange={(e) => setCarrierDraft(e.target.value)}
            >
              <option value="">不指定</option>
              {(carriersQuery.data?.items ?? [])
                .filter((c) => c.status === '启用' || c.id === row.carrierId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
            </select>
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={carrierMutation.isPending || carrierDraft === (row.carrierId || '')}
            onClick={() =>
              carrierMutation.mutate({ batchId: row.id, carrierId: carrierDraft || null })
            }
          >
            保存承运商
          </Button>
        </div>
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
      <DetailSection title="链路事件">
        {row.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无事件</p>
        ) : (
          <StatusTimeline
            steps={row.events.map((e, i) => {
              const [status, ...rest] = e.split(' · ')
              return {
                at: rest[0] || '',
                status: status || e,
                note: rest.slice(1).join(' · '),
                current: i === row.events.length - 1,
              }
            })}
          />
        )}
      </DetailSection>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      <SyncConfirmDialog
        open={submitConfirmOpen}
        onOpenChange={setSubmitConfirmOpen}
        title="提交 JSB 交接"
        description="将批次标记为已交接给 JSB 物流。"
        scope={{
          label: '作用批次',
          value: `批次 ${row.batchNo} · ${row.packageCount} 个包裹`,
        }}
        impacts={[
          'JSB 无可靠平台 API，仅更新本地批次状态为已交接',
          '实际物流节点需在批次详情手工补录',
          '提交后批次状态不可自动回退',
        ]}
        confirmLabel="确认提交交接"
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
        description="关闭该批次，后续不可再追加包裹或补录节点。"
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
