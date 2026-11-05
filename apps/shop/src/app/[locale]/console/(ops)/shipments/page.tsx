'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Button } from '@workspace/ui/components/button'
import { Badge } from '@workspace/ui/components/badge'
import { LocaleLink } from '@/lib/i18n/navigation'
import {
  appendTrackingEvent,
  createShipment,
  labelProviderType,
  labelShipmentStatus,
  SHIPMENT_EVENT_OPTIONS,
  SHIPMENT_PROVIDER_OPTIONS,
  syncShipmentFromPlatform,
  toShipmentListRow,
  TRACKING_EVENT_TYPES,
  useShipments,
} from '@/lib/crossborder/shipment-store'

const SHOP_OPTIONS = [
  { label: 'Daraz LK', value: 'Daraz LK', id: 'b5ofcwj2mzauov29y08m0q99', platform: 'daraz', site: 'LK' },
  { label: 'Lazada MY', value: 'Lazada MY', id: 's8v7xkqw0asyz4zhswxwzdd3', platform: 'lazada', site: 'MY' },
  { label: 'TikTok Shop', value: 'TikTok Shop', id: 'kqw7alhkgefjmffogbib1z79', platform: 'tiktok_shop', site: 'GLOBAL' },
]

const SHOP_LABELS = SHOP_OPTIONS.map((item) => item.label)
const EVENT_LABELS = SHIPMENT_EVENT_OPTIONS.map((item) => item.label)
const PROVIDER_LABELS = SHIPMENT_PROVIDER_OPTIONS.map((item) => item.label)
const SOURCE_OPTIONS = ['平台同步', '人工录入']

type DialogMode = 'event' | 'create' | null

export default function ShipmentsPage() {
  const shipments = useShipments()
  const rows = shipments.map(toShipmentListRow)
  const [selected, setSelected] = React.useState(shipments[0]?.id ?? '')
  const [dialogMode, setDialogMode] = React.useState<DialogMode>(null)
  const [eventTarget, setEventTarget] = React.useState(shipments[0]?.id ?? '')
  const [notice, setNotice] = React.useState('')
  const current = shipments.find((row) => row.id === selected) ?? shipments[0]

  const dialog =
    dialogMode === 'event' ? (
      <UedDialog
        title="追加包裹履约事件"
        description="事件会写入当前原型会话；真实实现按 tracking_events.source 区分平台同步与人工录入。"
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
          const result = appendTrackingEvent({
            shipmentId: eventTarget,
            statusCode: event.code,
            title: event.label,
            description: values.description,
            location: values.location,
            eventTime: values.eventAt,
            source: values.source === '平台同步' ? 'platform' : 'manual',
          })
          setNotice(result.ok ? `已追加「${event.label}」，包裹状态更新为 ${labelShipmentStatus(result.shipment.status)}。` : result.reason)
          if (result.ok) setSelected(result.shipment.id)
          setDialogMode(null)
        }}
      />
    ) : dialogMode === 'create' ? (
      <UedDialog
        title="创建包裹 / 履约记录"
        description="一单可多包裹；原型仅创建本地记录，不会向 Lazada / Daraz 申请真实运单。"
        fields={[
          { key: 'order', label: '关联订单', placeholder: '如 DZ-10021', required: true },
          { key: 'shop', label: '店铺', options: SHOP_LABELS, required: true },
          { key: 'warehouse', label: '发货仓', options: ['WH-CN-XMN-001'], required: true },
          { key: 'providerType', label: '物流类型', options: PROVIDER_LABELS, required: true },
          { key: 'providerCode', label: '物流渠道', placeholder: '如 DARAZ_LOGISTICS / LGS_MY', required: true },
          { key: 'tracking', label: '运单号', placeholder: '留空则显示待生成' },
          { key: 'weight', label: '包裹重量', placeholder: '如 460 g' },
          { key: 'items', label: '包裹件数', type: 'number', required: true },
          { key: 'skus', label: 'SKU 明细', placeholder: '如 HSY000001001 ×2', required: true },
          { key: 'picker', label: '拣货人', placeholder: '默认当前用户' },
          { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
        ]}
        onClose={() => setDialogMode(null)}
        onSave={(values) => {
          const shop = SHOP_OPTIONS.find((item) => item.value === values.shop) ?? SHOP_OPTIONS[0]!
          const provider = SHIPMENT_PROVIDER_OPTIONS.find((item) => item.label === values.providerType) ?? SHIPMENT_PROVIDER_OPTIONS[0]!
          const result = createShipment({
            order: values.order,
            shop: shop.value,
            shopId: shop.id,
            platform: shop.platform,
            site: shop.site,
            warehouse: values.warehouse,
            providerCode: values.providerCode || provider.value.toUpperCase(),
            providerType: provider.value,
            mode: provider.label,
            tracking: values.tracking,
            weight: values.weight,
            items: Number(values.items),
            skus: values.skus,
            picker: values.picker,
            remark: values.remark,
          })
          setNotice(result.ok ? `包裹 ${result.shipment.id} 已加入本次原型会话。` : result.reason)
          if (result.ok) setSelected(result.shipment.id)
          setDialogMode(null)
        }}
      />
    ) : null

  return (
    <>
      {dialog}
      <UedWorkspace
        title="包裹与物流"
        description="按 shipments / shipment_items / tracking_events 展示一单多包裹、履约模式与平台轨迹。"
        rows={rows}
        detailHref={(row) => `/console/shipments/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'externalPackageId', 'order', 'shop', 'site', 'mode', 'tracking', 'providerCode', 'statusLabel']}
        filters={[
          { label: '状态', key: 'statusLabel', options: rows.map((row) => row.statusLabel).filter((value, index, list) => list.indexOf(value) === index) },
          { label: '平台', key: 'platformLabel', options: ['DARAZ', 'LAZADA', 'TIKTOK_SHOP'] },
          { label: '店铺', key: 'shop', options: SHOP_LABELS },
        ]}
        addLabel="新建包裹"
        onAdd={() => setDialogMode('create')}
        columns={[
          { key: 'id', label: '包裹号' },
          { key: 'order', label: '订单号' },
          { key: 'shop', label: '店铺 / 站点', render: (row) => `${row.shop} · ${row.site}` },
          { key: 'mode', label: '履约模式', render: (row) => `${row.mode} · ${row.providerCode}` },
          { key: 'tracking', label: '运单号' },
          { key: 'items', label: '件数' },
          { key: 'lastSyncedAt', label: '最近同步' },
          { key: 'statusLabel', label: '当前状态', render: (row) => <Badge variant="secondary">{row.statusLabel}</Badge> },
        ]}
      >
        <UedPrototypeNotice>
          平台包裹状态与轨迹按统一事件模型展示；LGS / 平台物流 / JSB 仅改变 provider_type 与事件链，不改订单金额。映射异常订单可创建包裹，但确认占库会被阻断。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows.map((row) => (
            <Button key={row.id} variant={selected === row.id ? 'secondary' : 'outline'} size="sm" onClick={() => setSelected(row.id)}>
              {row.id} · {row.statusLabel}
            </Button>
          ))}
        </div>
        {current ? (
          <div className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-medium">{current.id} · {current.order}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {current.externalPackageId} · {current.shop} · {current.mode} · {current.tracking}
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
              <p>最近同步：{current.lastSyncedAt ?? '—'}</p>
              <p>RTS：{current.rtsAt ?? '—'}</p>
              <p>出库：{current.shippedAt ?? '—'}</p>
              <p>签收：{current.deliveredAt ?? '—'}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => { setEventTarget(current.id); setDialogMode('event') }}>追加履约事件</Button>
              <Button size="sm" variant="outline" onClick={() => { const result = syncShipmentFromPlatform(current.id); setNotice(result.ok ? result.note : result.reason) }}>同步平台轨迹</Button>
              <Button size="sm" variant="ghost" asChild>
                <LocaleLink href={`/console/shipments/${encodeURIComponent(current.id)}`}>查看完整详情</LocaleLink>
              </Button>
            </div>
            <ol className="mt-4 flex flex-col gap-2 border-l pl-4">
              {current.events.length > 0 ? current.events.map((event) => (
                <li key={event.id} className="text-sm">
                  <span className="font-medium">{event.eventTime} · {event.title}</span>
                  <span className="ml-2 text-muted-foreground">{event.location} · {event.source === 'platform' ? '平台同步' : '人工录入'}</span>
                  {event.description ? <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p> : null}
                </li>
              )) : <li className="text-sm text-muted-foreground">暂无履约轨迹，等待仓库出库或平台同步。</li>}
            </ol>
            {current.remark ? <p className="mt-3 text-xs text-muted-foreground">备注：{current.remark}</p> : null}
          </div>
        ) : null}
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
