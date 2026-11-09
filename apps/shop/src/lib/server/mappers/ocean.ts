/**
 * 海运柜次 UI ↔ DB 状态映射（中文控制台 ↔ varchar）。
 * 主状态机：draft → booked → departed → arrived → customs → received
 * 兼容旧原型：in_transit / customs_clearing / received_local
 */

export const UI_OCEAN_STATUSES = [
  '草稿',
  '已订舱',
  '在途',
  '已到港',
  '清关中',
  '已入本地仓',
  '已取消',
] as const
export type UiOceanStatus = (typeof UI_OCEAN_STATUSES)[number]

export const OCEAN_STATUS_FLOW = [
  'draft',
  'booked',
  'departed',
  'arrived',
  'customs',
  'received',
] as const

const UI_TO_DB: Record<UiOceanStatus, string> = {
  草稿: 'draft',
  已订舱: 'booked',
  在途: 'departed',
  已到港: 'arrived',
  清关中: 'customs',
  已入本地仓: 'received',
  已取消: 'cancelled',
}

const DB_TO_UI: Record<string, UiOceanStatus> = {
  draft: '草稿',
  booked: '已订舱',
  departed: '在途',
  arrived: '已到港',
  customs: '清关中',
  customs_clearing: '清关中',
  received: '已入本地仓',
  received_local: '已入本地仓',
  in_transit: '在途',
  cancelled: '已取消',
}

/** 归一到规范状态（兼容旧值）。 */
export function normalizeOceanStatus(raw: string | null | undefined): string {
  const s = (raw || 'draft').trim()
  if (s === 'in_transit') return 'departed'
  if (s === 'customs_clearing') return 'customs'
  if (s === 'received_local') return 'received'
  return s
}

export function toDbOceanStatus(uiOrDb: string): string {
  if (uiOrDb in UI_TO_DB) return UI_TO_DB[uiOrDb as UiOceanStatus]
  return normalizeOceanStatus(uiOrDb)
}

export function toUiOceanStatus(db: string | null | undefined): UiOceanStatus {
  const n = normalizeOceanStatus(db)
  return DB_TO_UI[n] ?? DB_TO_UI[db || ''] ?? '草稿'
}

export function nextOceanStatus(current: string): string | null {
  const n = normalizeOceanStatus(current)
  if (n === 'cancelled' || n === 'received') return null
  const idx = OCEAN_STATUS_FLOW.indexOf(n as (typeof OCEAN_STATUS_FLOW)[number])
  if (idx < 0 || idx >= OCEAN_STATUS_FLOW.length - 1) return null
  return OCEAN_STATUS_FLOW[idx + 1]!
}

export function canCancelOceanStatus(current: string): boolean {
  const n = normalizeOceanStatus(current)
  return n === 'draft' || n === 'booked'
}

/** 库存投影用：在途桶 */
export function isInTransitBucket(status: string): boolean {
  const n = normalizeOceanStatus(status)
  return n === 'departed' || n === 'arrived'
}

/** 库存投影用：清关桶 */
export function isCustomsBucket(status: string): boolean {
  return normalizeOceanStatus(status) === 'customs'
}

/** 库存投影用：已入本地仓 */
export function isReceivedBucket(status: string): boolean {
  return normalizeOceanStatus(status) === 'received'
}

export const OCEAN_DEFAULT_WAREHOUSE = 'WH-LK-CMB-001'
export const OCEAN_STAGING_BIN = 'STAGING'
