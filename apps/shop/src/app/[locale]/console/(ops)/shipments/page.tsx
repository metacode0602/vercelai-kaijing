'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Button } from '@workspace/ui/components/button'
import { Badge } from '@workspace/ui/components/badge'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import {
  labelProviderType,
  labelShipmentStatus,
  SHIPMENT_PROVIDER_OPTIONS,
  TRACKING_EVENT_TYPES,
} from '@/lib/crossborder/shipment-store'

const EVENT_LABELS = TRACKING_EVENT_TYPES.map((item) => item.label)
const PROVIDER_LABELS = SHIPMENT_PROVIDER_OPTIONS.map((item) => item.label)
const SOURCE_OPTIONS = ['接口', '人工录入', '批量导入']

type DialogMode = 'event' | 'create' | null

export default function ShipmentsPage() {
  const utils = trpc.useUtils()
  const [selected, setSelected] = React.useState('')
  const [dialogMode, setDialogMode] = React.useState<DialogMode>(null)
  const [eventTarget, setEventTarget] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')

  const listQuery = trpc.logistics.list.useQuery({ page: 1, pageSize: 100, status: statusFilter })
  const statsQuery = trpc.logistics.stats.useQuery()
  const metaQuery = trpc.logistics.meta.useQuery()
  const detailQuery = trpc.logistics.get.useQuery(
    { id: selected },
    { enabled: Boolean(selected) },
  )

  const createMutation = trpc.logistics.createFromOrder.useMutation({
    onSuccess: async (row) => {
      await utils.logistics.list.invalidate()
      await utils.logistics.stats.invalidate()
      setSelected(row.id)
      setNotice(`包裹 ${row.externalPackageId} 已写入 PostgreSQL（${row.providerLabel}）`)
      setDialogMode(null)
    },
    onError: (e) => setNotice(e.message),
  })
  const appendMutation = trpc.logistics.appendTracking.useMutation({
    onSuccess: async (res) => {
      await utils.logistics.list.invalidate()
      await utils.logistics.get.invalidate({ id: res.shipment.id })
      setSelected(res.shipment.id)
      setNotice(
        res.duplicated
          ? `轨迹已存在（幂等跳过），状态 ${res.shipment.statusLabel}`
          : `已追加轨迹，包裹状态 ${res.shipment.statusLabel}`,
      )
      setDialogMode(null)
    },
    onError: (e) => setNotice(e.message),
  })
  const syncMutation = trpc.logistics.syncFromPlatform.useMutation({
    onSuccess: async (res) => {
      await utils.logistics.list.invalidate()
      await utils.logistics.get.invalidate({ id: res.shipment.id })
      setNotice(res.note)
    },
    onError: (e) => setNotice(e.message),
  })

  const shipments = listQuery.data?.items ?? []
  React.useEffect(() => {
    if (!selected && shipments[0]) setSelected(shipments[0].id)
  }, [selected, shipments])

  const current = detailQuery.data ?? shipments.find((row) => row.id === selected) ?? shipments[0]
  const rows = shipments.map((row) => ({
    ...row,
    platformLabel: row.platform.toUpperCase(),
  }))

  const dialog =
    dialogMode === 'event' ? (
      <UedDialog
        title="追加包裹履约事件"
        description="事件写入 tracking_events，必须标记 source（api / manual / import）。"
        fields={[
          { key: 'event', label: '履约事件', options: EVENT_LABELS, required: true },
          { key: 'eventAt', label: '事件时间', type: 'datetime-local', required: true },
          { key: 'source', label: '来源', options: SOURCE_OPTIONS, required: true },
          { key: 'location', label: '发生地点', placeholder: '如 Colombo / 厦门仓' },
          { key: 'description', label: '说明', type: 'textarea', fullWidth: true },
        ]}
        onClose={() => setDialogMode(null)}
        onSave={(values) => {
          const event = TRACKING_EVENT_TYPES.find((item) => item.label === values.event)
          if (!event) return
          const source =
            values.source === '接口' ? 'api' : values.source === '批量导入' ? 'import' : 'manual'
          appendMutation.mutate({
            shipmentId: eventTarget || selected,
            statusCode: event.code,
            title: event.label,
            description: values.description,
            location: values.location,
            eventTime: values.eventAt,
            source,
          })
        }}
      />
    ) : dialogMode === 'create' ? (
      <UedDialog
        title="从订单创建包裹"
        description="关联已过账/已出库订单的 orderId；真实平台运单仍为 stub，包裹写入 PostgreSQL。"
        fields={[
          { key: 'orderId', label: '订单 ID（DB）', placeholder: 'orders.id', required: true },
          { key: 'providerType', label: '物流类型', options: PROVIDER_LABELS, required: true },
          { key: 'providerCode', label: '物流渠道', placeholder: '如 DARAZ_LOGISTICS / LGS_MY' },
          { key: 'tracking', label: '运单号', placeholder: '留空则显示待生成' },
          { key: 'warehouse', label: '发货仓', options: ['WH-CN-XMN-001'], required: true },
          { key: 'weight', label: '包裹重量', placeholder: '如 460 g' },
          { key: 'skus', label: 'SKU 明细提示', placeholder: '如 HSY000001001 ×2' },
          { key: 'picker', label: '拣货人', placeholder: '默认当前用户' },
          { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
        ]}
        onClose={() => setDialogMode(null)}
        onSave={(values) => {
          const provider =
            SHIPMENT_PROVIDER_OPTIONS.find((item) => item.label === values.providerType) ??
            SHIPMENT_PROVIDER_OPTIONS[0]!
          createMutation.mutate({
            orderId: values.orderId.trim(),
            providerType: provider.value,
            providerCode: values.providerCode || provider.value.toUpperCase(),
            trackingNumber: values.tracking || undefined,
            warehouseCode: values.warehouse,
            weight: values.weight,
            skusHint: values.skus,
            picker: values.picker,
            remark: values.remark,
          })
        }}
      />
    ) : null

  return (
    <>
      {dialog}
      <UedWorkspace
        title="包裹与物流"
        description="按 shipments / shipment_items / tracking_events 展示一单多包裹、履约模式与平台轨迹（已接 PostgreSQL）。"
        rows={rows}
        detailHref={(row) => `/console/shipments/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'externalPackageId', 'order', 'shop', 'site', 'mode', 'tracking', 'providerCode', 'statusLabel']}
        filters={[
          {
            label: '状态',
            key: 'statusLabel',
            options: rows.map((row) => row.statusLabel).filter((value, index, list) => list.indexOf(value) === index),
          },
          { label: '平台', key: 'platformLabel', options: ['DARAZ', 'LAZADA', 'TIKTOK_SHOP'] },
        ]}
        addLabel="新建包裹"
        onAdd={() => setDialogMode('create')}
        columns={[
          { key: 'id', label: '包裹号', render: (row) => row.externalPackageId || row.id },
          { key: 'order', label: '订单号' },
          { key: 'shop', label: '店铺 / 站点', render: (row) => `${row.shop} · ${row.site}` },
          { key: 'mode', label: '履约模式', render: (row) => `${row.mode} · ${row.providerCode}` },
          { key: 'tracking', label: '运单号' },
          { key: 'items', label: '件数' },
          { key: 'lastSyncedAt', label: '最近同步' },
          {
            key: 'statusLabel',
            label: '当前状态',
            render: (row) => <Badge variant="secondary">{row.statusLabel}</Badge>,
          },
        ]}
      >
        <UedPrototypeNotice>
          已接 DB：包裹/轨迹经 tRPC 写入 PostgreSQL。平台 OpenAPI 仍为 stub（同步会写
          fulfillment_attempts）。共 {statsQuery.data?.total ?? rows.length} 个包裹 ·{' '}
          {metaQuery.data?.note}
        </UedPrototypeNotice>
        {listQuery.isLoading ? <p className="text-sm text-muted-foreground">加载中…</p> : null}
        {listQuery.isError ? (
          <p className="text-sm text-destructive">{listQuery.error.message}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={statusFilter === 'all' ? 'secondary' : 'outline'}
            onClick={() => setStatusFilter('all')}
          >
            全部
          </Button>
          {rows.map((row) => (
            <Button
              key={row.id}
              variant={selected === row.id ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setSelected(row.id)}
            >
              {row.externalPackageId} · {row.statusLabel}
            </Button>
          ))}
        </div>
        {current ? (
          <div className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-medium">
                  {current.externalPackageId} · {current.order}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {current.id} · {current.shop} · {current.mode} · {current.tracking}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{labelProviderType(current.providerType)}</Badge>
                <Badge variant="secondary">{labelShipmentStatus(current.status)}</Badge>
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <p>平台状态：{current.platformStatus}</p>
              <p>发货仓：{current.warehouse}</p>
              <p>最近同步：{current.lastSyncedAt || '—'}</p>
              <p>RTS：{current.rtsAt || '—'}</p>
              <p>出库：{current.shippedAt || '—'}</p>
              <p>签收：{current.deliveredAt || '—'}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setEventTarget(current.id)
                  setDialogMode('event')
                }}
              >
                追加履约事件
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={syncMutation.isPending}
                onClick={() => syncMutation.mutate({ id: current.id })}
              >
                {syncMutation.isPending ? '同步中…' : '同步平台轨迹（stub）'}
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <LocaleLink href={`/console/shipments/${encodeURIComponent(current.id)}`}>
                  查看完整详情
                </LocaleLink>
              </Button>
            </div>
            <ol className="mt-4 flex flex-col gap-2 border-l pl-4">
              {'events' in current && Array.isArray(current.events) && current.events.length > 0 ? (
                current.events.map((event) => (
                  <li key={event.id} className="text-sm">
                    <span className="font-medium">
                      {event.eventTime} · {event.title}
                    </span>
                    <span className="ml-2 text-muted-foreground">
                      {event.location} · {event.sourceLabel}
                    </span>
                    {event.description ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>
                    ) : null}
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted-foreground">
                  暂无履约轨迹，等待仓库出库或平台同步。
                </li>
              )}
            </ol>
            {'remark' in current && current.remark ? (
              <p className="mt-3 text-xs text-muted-foreground">备注：{current.remark}</p>
            ) : null}
          </div>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </UedWorkspace>
    </>
  )
}
