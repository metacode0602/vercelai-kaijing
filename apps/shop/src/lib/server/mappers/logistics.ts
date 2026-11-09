/**
 * 物流履约域 UI ↔ DB 状态映射（中文控制台 ↔ varchar 枚举）。
 * 对齐 shipment-store 的 labelShipmentStatus / TRACKING_EVENT_TYPES / SHIPMENT_PROVIDER_TYPES。
 */

export const UI_SHIPMENT_STATUSES = [
  '待出库',
  '待揽收',
  '已出库',
  '运输中',
  '已签收',
  '物流异常',
  '已取消',
] as const
export type UiShipmentStatus = (typeof UI_SHIPMENT_STATUSES)[number]

export const UI_PROVIDER_TYPES = [
  '平台物流',
  'LGS 官方物流',
  'JSB 灰清',
  '三方物流',
  '人工补录',
] as const
export type UiProviderType = (typeof UI_PROVIDER_TYPES)[number]

export const UI_BATCH_STATUSES = [
  '开放中',
  '已提交',
  '已受理',
  '已驳回',
  '已关闭',
  '运输中',
  '已签收',
  '物流异常',
] as const
export type UiBatchStatus = (typeof UI_BATCH_STATUSES)[number]

export const UI_TRACKING_SOURCES = ['接口', '人工录入', '批量导入'] as const
export type UiTrackingSource = (typeof UI_TRACKING_SOURCES)[number]

export const TRACKING_EVENT_TYPES = [
  { code: 'READY_TO_SHIP', label: '仓库拣货完成', status: 'ready_to_ship' },
  { code: 'SHIPPED', label: '仓库出库', status: 'shipped' },
  { code: 'COLLECTED', label: '平台 / LGS 揽收', status: 'in_transit' },
  { code: 'HANDOVER_JSB', label: '交接 JSB', status: 'in_transit' },
  { code: 'CUSTOMS_CLEARING', label: '清关中', status: 'in_transit' },
  { code: 'CUSTOMS_CLEARED', label: '清关完成', status: 'in_transit' },
  { code: 'OUT_FOR_DELIVERY', label: '官方尾程派送', status: 'in_transit' },
  { code: 'DELIVERED', label: '已签收', status: 'delivered' },
  { code: 'EXCEPTION', label: '物流异常', status: 'exception' },
] as const

export const SHIPMENT_PROVIDER_OPTIONS = [
  { label: '平台物流', value: 'platform' },
  { label: 'LGS 官方物流', value: 'lgs' },
  { label: 'JSB 灰清', value: 'jsb' },
  { label: '三方物流', value: 'third_party' },
  { label: '人工补录', value: 'manual' },
] as const

const SHIP_UI_TO_DB: Record<UiShipmentStatus, string> = {
  待出库: 'pending',
  待揽收: 'ready_to_ship',
  已出库: 'shipped',
  运输中: 'in_transit',
  已签收: 'delivered',
  物流异常: 'exception',
  已取消: 'cancelled',
}
const SHIP_DB_TO_UI: Record<string, UiShipmentStatus> = {
  pending: '待出库',
  ready_to_ship: '待揽收',
  shipped: '已出库',
  in_transit: '运输中',
  delivered: '已签收',
  exception: '物流异常',
  cancelled: '已取消',
}

const PROVIDER_UI_TO_DB: Record<UiProviderType, string> = {
  平台物流: 'platform',
  'LGS 官方物流': 'lgs',
  'JSB 灰清': 'jsb',
  三方物流: 'third_party',
  人工补录: 'manual',
}
const PROVIDER_DB_TO_UI: Record<string, UiProviderType> = {
  platform: '平台物流',
  lgs: 'LGS 官方物流',
  jsb: 'JSB 灰清',
  jsb_th: 'JSB 灰清',
  third_party: '三方物流',
  manual: '人工补录',
}

const BATCH_UI_TO_DB: Record<UiBatchStatus, string> = {
  开放中: 'open',
  已提交: 'submitted',
  已受理: 'accepted',
  已驳回: 'rejected',
  已关闭: 'closed',
  运输中: 'in_transit',
  已签收: 'delivered',
  物流异常: 'exception',
}
const BATCH_DB_TO_UI: Record<string, UiBatchStatus> = {
  open: '开放中',
  submitted: '已提交',
  accepted: '已受理',
  rejected: '已驳回',
  closed: '已关闭',
  in_transit: '运输中',
  delivered: '已签收',
  exception: '物流异常',
}

const SOURCE_UI_TO_DB: Record<UiTrackingSource, string> = {
  接口: 'api',
  人工录入: 'manual',
  批量导入: 'import',
}
const SOURCE_DB_TO_UI: Record<string, UiTrackingSource> = {
  api: '接口',
  platform: '接口',
  manual: '人工录入',
  import: '批量导入',
}

export function toUiShipmentStatus(db: string): UiShipmentStatus {
  return SHIP_DB_TO_UI[db] ?? '待出库'
}
export function toDbShipmentStatus(ui: string): string {
  return SHIP_UI_TO_DB[ui as UiShipmentStatus] ?? ui
}

export function toUiProviderType(db: string): UiProviderType {
  return PROVIDER_DB_TO_UI[db] ?? '平台物流'
}
export function toDbProviderType(ui: string): string {
  return PROVIDER_UI_TO_DB[ui as UiProviderType] ?? ui
}

export function toUiBatchStatus(db: string): UiBatchStatus {
  return BATCH_DB_TO_UI[db] ?? '开放中'
}
export function toDbBatchStatus(ui: string): string {
  return BATCH_UI_TO_DB[ui as UiBatchStatus] ?? ui
}

export function toUiTrackingSource(db: string): UiTrackingSource {
  return SOURCE_DB_TO_UI[db] ?? '人工录入'
}
export function toDbTrackingSource(ui: string): string {
  return SOURCE_UI_TO_DB[ui as UiTrackingSource] ?? ui
}

export function labelShipmentStatus(status: string) {
  return toUiShipmentStatus(status)
}

export function labelProviderType(type: string) {
  return toUiProviderType(type)
}

/** Lazada 四国 → lgs；Daraz LK → platform；TH → jsb */
export function defaultProviderTypeForPlatform(platform: string, site?: string | null): string {
  const p = (platform || '').toLowerCase()
  const s = (site || '').toUpperCase()
  if (p === 'lazada' && ['MY', 'PH', 'SG', 'VN'].includes(s)) return 'lgs'
  if (p === 'lazada' && s === 'TH') return 'jsb'
  if (p === 'daraz') return 'platform'
  if (p.includes('jsb')) return 'jsb'
  return 'platform'
}

export function formatStamp(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return typeof d === 'string' ? d : ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function parseEventTime(input?: string | null): Date {
  if (!input?.trim()) return new Date()
  const normalized = input.trim().replace(' ', 'T')
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return new Date()
  return d
}

export function eventMeta(statusCode: string) {
  return TRACKING_EVENT_TYPES.find((item) => item.code === statusCode)
}
