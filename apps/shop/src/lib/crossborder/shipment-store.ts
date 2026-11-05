'use client'

/**
 * 包裹与物流原型 store（历史 localStorage）。
 * 主路径已切 tRPC → dataaccess/logistics → PostgreSQL（见 routers/logistics、console/shipments|logistics-*）。
 * 本文件仅保留类型 / 状态常量 / 中文 label，供未迁移页与 UI 选项引用；包裹主流程请勿再写 localStorage。
 */

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


/** @deprecated 主路径已禁用 localStorage；保留空实现避免误用编译失败。 */
export function useShipments(): ShopShipment[] {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[shipment-store] useShipments() 已停用 localStorage。请改用 trpc.logistics.list / get。',
    )
  }
  return []
}

export function getShipments(): ShopShipment[] {
  return []
}

export function getShipmentById(_id: string): ShopShipment | undefined {
  return undefined
}

export function getShipmentsByOrder(_order: string): ShopShipment[] {
  return []
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
      (event) =>
        `${event.eventTime} · ${event.title} · ${event.location}${event.description ? ` · ${event.description}` : ''}（${event.source === 'platform' ? '平台同步' : '人工录入'}）`,
    ),
  }
}

export function appendTrackingEvent(_input: {
  shipmentId: string
  statusCode: string
  title: string
  description?: string
  location?: string
  eventTime?: string
  source?: 'platform' | 'manual'
}): { ok: true; shipment: ShopShipment } | { ok: false; reason: string } {
  return { ok: false, reason: 'appendTrackingEvent 已迁移至 trpc.logistics.appendTracking' }
}

export function syncShipmentFromPlatform(
  _id: string,
): { ok: true; shipment: ShopShipment; note: string } | { ok: false; reason: string } {
  return { ok: false, reason: 'syncShipmentFromPlatform 已迁移至 trpc.logistics.syncFromPlatform' }
}

export function createShipment(_input: {
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
  return { ok: false, reason: 'createShipment 已迁移至 trpc.logistics.createFromOrder' }
}
