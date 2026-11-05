'use client'

/**
 * 包裹与物流原型 store（localStorage）。
 * 字段对齐 commerce-schema：shipments / shipment_items / tracking_events。
 * 真实同步应经 packages/marketplace 连接器拉取 package + tracking events，
 * 这里保留同一套字段与状态，便于后续替换为 tRPC/dataaccess。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'

export const SHIPMENT_STATUSES = [
  'pending',
  'ready_to_ship',
  'shipped',
  'in_transit',
  'delivered',
  'exception',
  'cancelled',
] as const
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number]

export const SHIPMENT_PROVIDER_TYPES = ['platform', 'lgs', 'jsb', 'third_party', 'manual'] as const
export type ShipmentProviderType = (typeof SHIPMENT_PROVIDER_TYPES)[number]

export const TRACKING_EVENT_TYPES = [
  { code: 'READY_TO_SHIP', label: '仓库拣货完成', status: 'ready_to_ship', source: 'manual' },
  { code: 'SHIPPED', label: '仓库出库', status: 'shipped', source: 'manual' },
  { code: 'COLLECTED', label: '平台 / LGS 揽收', status: 'in_transit', source: 'platform' },
  { code: 'HANDOVER_JSB', label: '交接 JSB', status: 'in_transit', source: 'manual' },
  { code: 'CUSTOMS_CLEARING', label: '清关中', status: 'in_transit', source: 'platform' },
  { code: 'CUSTOMS_CLEARED', label: '清关完成', status: 'in_transit', source: 'platform' },
  { code: 'OUT_FOR_DELIVERY', label: '官方尾程派送', status: 'in_transit', source: 'platform' },
  { code: 'DELIVERED', label: '已签收', status: 'delivered', source: 'platform' },
  { code: 'EXCEPTION', label: '物流异常', status: 'exception', source: 'platform' },
] as const

export const SHIPMENT_PROVIDER_OPTIONS = [
  { label: '平台物流', value: 'platform' },
  { label: 'LGS 官方物流', value: 'lgs' },
  { label: 'JSB 灰清', value: 'jsb' },
  { label: '三方物流', value: 'third_party' },
  { label: '人工补录', value: 'manual' },
] as const

export const SHIPMENT_EVENT_OPTIONS = TRACKING_EVENT_TYPES.map((item) => ({
  label: item.label,
  value: item.code,
}))

export type TrackingEvent = {
  id: string
  statusCode: string
  title: string
  description: string
  location: string
  eventTime: string
  source: 'platform' | 'manual'
}

export type ShopShipment = {
  id: string
  externalPackageId: string
  packageId: string
  orderId: string
  order: string
  shopId: string
  shop: string
  platform: string
  site: string
  tracking: string
  trackingNumber: string
  carrier: string
  providerCode: string
  providerType: ShipmentProviderType
  mode: string
  warehouse: string
  status: ShipmentStatus
  platformStatus: string
  rtsAt: string | null
  shippedAt: string | null
  deliveredAt: string | null
  weight: string
  items: number
  skus: string
  picker: string
  remark: string
  lastSyncedAt: string | null
  integrationStatus: 'synced' | 'pending' | 'error'
  events: TrackingEvent[]
}

export function labelShipmentStatus(status: string) {
  const labels: Record<string, string> = {
    pending: '待出库',
    ready_to_ship: '待揽收',
    shipped: '已出库',
    in_transit: '运输中',
    delivered: '已签收',
    exception: '物流异常',
    cancelled: '已取消',
  }
  return labels[status] ?? status
}

export function labelProviderType(type: string) {
  const labels: Record<string, string> = {
    platform: '平台物流',
    lgs: 'LGS 官方物流',
    jsb: 'JSB 灰清',
    third_party: '三方物流',
    manual: '人工补录',
  }
  return labels[type] ?? type
}

const DEMO_SHIPMENTS: ShopShipment[] = [
  {
    id: 'PKG-2026-0051',
    externalPackageId: 'DZ-PKG-2026-0051',
    packageId: 'PKG-2026-0051',
    orderId: 'ord-10021',
    order: 'DZ-10021',
    shopId: 'b5ofcwj2mzauov29y08m0q99',
    shop: 'Daraz LK',
    platform: 'daraz',
    site: 'LK',
    tracking: '待生成',
    trackingNumber: '待生成',
    carrier: 'Daraz Logistics',
    providerCode: 'DARAZ_LOGISTICS',
    providerType: 'platform',
    mode: '平台物流',
    warehouse: 'WH-CN-XMN-001',
    status: 'pending',
    platformStatus: 'PENDING',
    rtsAt: null,
    shippedAt: null,
    deliveredAt: null,
    weight: '待称重',
    items: 2,
    skus: 'HSY000001001 ×2',
    picker: '—',
    remark: '',
    lastSyncedAt: '2026-10-20 20:40',
    integrationStatus: 'synced',
    events: [],
  },
  {
    id: 'PKG-2026-0044',
    externalPackageId: 'DZ-PKG-2026-0044',
    packageId: 'PKG-2026-0044',
    orderId: 'ord-10018',
    order: 'DZ-10018',
    shopId: 'b5ofcwj2mzauov29y08m0q99',
    shop: 'Daraz LK',
    platform: 'daraz',
    site: 'LK',
    tracking: 'DZLK9981',
    trackingNumber: 'DZLK9981',
    carrier: 'Daraz Express',
    providerCode: 'DARAZ_EXPRESS',
    providerType: 'platform',
    mode: '平台物流',
    warehouse: 'WH-CN-XMN-001',
    status: 'in_transit',
    platformStatus: 'SHIPPED',
    rtsAt: '2026-10-20 10:05',
    shippedAt: '2026-10-20 14:10',
    deliveredAt: null,
    weight: '460 g',
    items: 1,
    skus: 'HSY000002001 ×1',
    picker: '兰雨晨',
    remark: '',
    lastSyncedAt: '2026-10-20 20:40',
    integrationStatus: 'synced',
    events: [
      {
        id: 'TE-10018-1',
        statusCode: 'READY_TO_SHIP',
        title: '仓库拣货完成',
        description: '出库单 OUT-2026-0084 复核完成',
        location: 'WH-CN-XMN-001',
        eventTime: '2026-10-20 10:18',
        source: 'manual',
      },
      {
        id: 'TE-10018-2',
        statusCode: 'SHIPPED',
        title: '仓库出库',
        description: '交接 Daraz Express',
        location: 'Xiamen',
        eventTime: '2026-10-20 14:10',
        source: 'manual',
      },
      {
        id: 'TE-10018-3',
        statusCode: 'COLLECTED',
        title: '平台揽收',
        description: 'Daraz Express 已揽收',
        location: 'Colombo',
        eventTime: '2026-10-20 18:30',
        source: 'platform',
      },
    ],
  },
  {
    id: 'PKG-2026-0050',
    externalPackageId: 'LZ-PKG-2026-0050',
    packageId: 'PKG-2026-0050',
    orderId: 'ord-lz-2201',
    order: 'LZ-2201',
    shopId: 's8v7xkqw0asyz4zhswxwzdd3',
    shop: 'Lazada MY',
    platform: 'lazada',
    site: 'MY',
    tracking: 'THJSB-8821',
    trackingNumber: 'THJSB-8821',
    carrier: 'LGS MY',
    providerCode: 'LGS_MY',
    providerType: 'lgs',
    mode: 'LGS 官方物流',
    warehouse: 'WH-CN-XMN-001',
    status: 'ready_to_ship',
    platformStatus: 'READY_TO_SHIP',
    rtsAt: '2026-10-28 09:10',
    shippedAt: null,
    deliveredAt: null,
    weight: '480 g',
    items: 1,
    skus: 'HSY000002001 ×1',
    picker: '兰雨晨',
    remark: '映射异常订单 · 人工补建拣货',
    lastSyncedAt: '2026-10-28 09:10',
    integrationStatus: 'pending',
    events: [
      {
        id: 'TE-2201-1',
        statusCode: 'READY_TO_SHIP',
        title: '仓库拣货完成',
        description: '等待 LGS 揽收；Seller SKU 映射异常待修复',
        location: 'WH-CN-XMN-001',
        eventTime: '2026-10-28 09:10',
        source: 'manual',
      },
    ],
  },
]

type ShipmentState = {
  shipments: ShopShipment[]
}

const store = createDemoStore<ShipmentState>('open-shop.console.demo.shipments.v2', {
  shipments: structuredClone(DEMO_SHIPMENTS),
})

function mutate(updater: (state: ShipmentState) => ShipmentState) {
  store.set(updater(store.get()))
}

function nowStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function useShipments() {
  return store.useStore().shipments
}

export function getShipments() {
  return store.get().shipments
}

export function getShipmentById(id: string) {
  return store
    .get()
    .shipments.find((item) => item.id === id || item.externalPackageId === id)
}

export function getShipmentsByOrder(order: string) {
  return store.get().shipments.filter((item) => item.order === order || item.orderId === order)
}

export function toShipmentListRow(shipment: ShopShipment) {
  return {
    ...shipment,
    statusLabel: labelShipmentStatus(shipment.status),
    platformLabel: shipment.platform.toUpperCase(),
    providerLabel: labelProviderType(shipment.providerType),
    eventCount: shipment.events.length,
    lastEvent: shipment.events.at(-1)?.title ?? '暂无轨迹',
  }
}

export function toShipmentDetailRow(shipment: ShopShipment): Record<string, unknown> {
  return {
    id: shipment.id,
    externalPackageId: shipment.externalPackageId,
    order: shipment.order,
    shop: shipment.shop,
    platform: shipment.platform,
    site: shipment.site,
    status: labelShipmentStatus(shipment.status),
    platformStatus: shipment.platformStatus,
    mode: shipment.mode,
    providerType: labelProviderType(shipment.providerType),
    providerCode: shipment.providerCode,
    tracking: shipment.tracking,
    carrier: shipment.carrier,
    warehouse: shipment.warehouse,
    weight: shipment.weight,
    items: shipment.items,
    skus: shipment.skus,
    picker: shipment.picker,
    rtsAt: shipment.rtsAt ?? '—',
    shippedAt: shipment.shippedAt ?? '—',
    deliveredAt: shipment.deliveredAt ?? '—',
    lastSyncedAt: shipment.lastSyncedAt ?? '—',
    integrationStatus: shipment.integrationStatus,
    remark: shipment.remark || '—',
    events: shipment.events.map(
      (event) => `${event.eventTime} · ${event.title} · ${event.location}${event.description ? ` · ${event.description}` : ''}（${event.source === 'platform' ? '平台同步' : '人工录入'}）`,
    ),
  }
}

export function appendTrackingEvent(input: {
  shipmentId: string
  statusCode: string
  title: string
  description?: string
  location?: string
  eventTime?: string
  source?: 'platform' | 'manual'
}): { ok: true; shipment: ShopShipment } | { ok: false; reason: string } {
  const current = getShipmentById(input.shipmentId)
  if (!current) return { ok: false, reason: '包裹不存在' }
  if (current.status === 'cancelled') return { ok: false, reason: '包裹已取消，不能追加轨迹' }
  if (!input.statusCode.trim()) return { ok: false, reason: '请选择履约事件' }

  const option = TRACKING_EVENT_TYPES.find((item) => item.code === input.statusCode)
  const eventTime = input.eventTime || nowStamp()
  const nextStatus = (option?.status ?? current.status) as ShipmentStatus
  const event: TrackingEvent = {
    id: `TE-${current.id}-${current.events.length + 1}`,
    statusCode: input.statusCode,
    title: input.title || option?.label || input.statusCode,
    description: input.description || '',
    location: input.location || current.warehouse,
    eventTime,
    source: input.source || (option?.source === 'platform' ? 'platform' : 'manual'),
  }

  let updated!: ShopShipment
  mutate((state) => ({
    ...state,
    shipments: state.shipments.map((item) => {
      if (item.id !== current.id) return item
      updated = {
        ...item,
        status: nextStatus,
        platformStatus: option?.code || item.platformStatus,
        rtsAt: item.rtsAt || (nextStatus === 'ready_to_ship' ? eventTime : null),
        shippedAt: item.shippedAt || (nextStatus === 'shipped' || nextStatus === 'in_transit' ? eventTime : null),
        deliveredAt: nextStatus === 'delivered' ? eventTime : item.deliveredAt,
        events: [...item.events, event],
      }
      return updated
    }),
  }))
  return { ok: true, shipment: updated }
}

/**
 * 模拟从 Lazada / Daraz 拉取最新包裹状态。
 * 真接口接入后应由连接器返回 package + tracking events，再复用同一投影。
 */
export function syncShipmentFromPlatform(
  id: string,
): { ok: true; shipment: ShopShipment; note: string } | { ok: false; reason: string } {
  const current = getShipmentById(id)
  if (!current) return { ok: false, reason: '包裹不存在' }
  const stamp = nowStamp()
  const nextByPlatform: Record<string, ShipmentStatus> = {
    pending: 'pending',
    ready_to_ship: 'ready_to_ship',
    shipped: 'in_transit',
    in_transit: 'in_transit',
    delivered: 'delivered',
    exception: 'exception',
  }
  const nextStatus = nextByPlatform[current.status] ?? current.status
  const event: TrackingEvent = {
    id: `TE-${current.id}-sync-${current.events.length + 1}`,
    statusCode: current.platformStatus || nextStatus.toUpperCase(),
    title: '平台轨迹同步',
    description: `${current.platform.toUpperCase()} 返回 ${current.platformStatus || nextStatus}`,
    location: current.site,
    eventTime: stamp,
    source: 'platform',
  }
  let updated!: ShopShipment
  mutate((state) => ({
    ...state,
    shipments: state.shipments.map((item) => {
      if (item.id !== current.id) return item
      updated = {
        ...item,
        status: nextStatus,
        lastSyncedAt: stamp,
        integrationStatus: 'synced',
        events: [...item.events, event],
      }
      return updated
    }),
  }))
  return {
    ok: true,
    shipment: updated,
    note: `已模拟从 ${updated.platform.toUpperCase()} 同步包裹 ${updated.externalPackageId}`,
  }
}

export function createShipment(input: {
  id?: string
  order: string
  shop: string
  shopId?: string
  platform: string
  site: string
  warehouse: string
  providerCode: string
  providerType: ShipmentProviderType
  mode: string
  tracking?: string
  weight?: string
  items: number
  skus: string
  picker?: string
  remark?: string
}): { ok: true; shipment: ShopShipment } | { ok: false; reason: string } {
  if (!input.order.trim()) return { ok: false, reason: '请选择订单' }
  if (!input.shop.trim()) return { ok: false, reason: '请选择店铺' }
  if (!input.warehouse.trim()) return { ok: false, reason: '请选择发货仓' }
  if (!Number.isFinite(input.items) || input.items <= 0) return { ok: false, reason: '包裹件数必须大于 0' }
  const id = input.id || `PKG-2026-${String(store.get().shipments.length + 52).padStart(4, '0')}`
  const existing = store.get().shipments.find((item) => item.id === id)
  if (existing) return { ok: true, shipment: existing }
  const shipment: ShopShipment = {
    id,
    externalPackageId: `${input.platform.toUpperCase()}-${id}`,
    packageId: id,
    orderId: '',
    order: input.order.trim(),
    shopId: input.shopId || '',
    shop: input.shop.trim(),
    platform: input.platform,
    site: input.site,
    tracking: input.tracking?.trim() || '待生成',
    trackingNumber: input.tracking?.trim() || '待生成',
    carrier: input.providerCode,
    providerCode: input.providerCode,
    providerType: input.providerType,
    mode: input.mode,
    warehouse: input.warehouse,
    status: 'pending',
    platformStatus: 'PENDING',
    rtsAt: null,
    shippedAt: null,
    deliveredAt: null,
    weight: input.weight?.trim() || '待称重',
    items: Math.floor(input.items),
    skus: input.skus.trim() || '—',
    picker: input.picker?.trim() || '当前用户',
    remark: input.remark?.trim() || '',
    lastSyncedAt: nowStamp(),
    integrationStatus: 'pending',
    events: [],
  }
  mutate((state) => ({ ...state, shipments: [shipment, ...state.shipments] }))
  return { ok: true, shipment }
}
