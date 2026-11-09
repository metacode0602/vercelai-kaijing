/**
 * 刊登 / Seller SKU 映射 / 映射异常 UI ↔ DB 状态映射（模块11）。
 */

export const UI_LISTING_STATUSES = ['草稿', '待审', '在售', '失败', '下架'] as const
export type UiListingStatus = (typeof UI_LISTING_STATUSES)[number]

export const UI_LISTING_PUBLISH_STATES = ['未发布', '待同步', '已发布', '同步失败'] as const
export type UiListingPublishState = (typeof UI_LISTING_PUBLISH_STATES)[number]

export const UI_MAPPING_STATUSES = ['待确认', '启用', '异常', '停用'] as const
export type UiMappingStatus = (typeof UI_MAPPING_STATUSES)[number]

export const UI_MAPPING_EXCEPTION_STATUSES = ['开放', '已修复', '已忽略', '阻断扣库', '已重试待验证'] as const
export type UiMappingExceptionStatus = (typeof UI_MAPPING_EXCEPTION_STATUSES)[number]

export const UI_MAPPING_EXCEPTION_KINDS = ['未映射', '冲突', '停用 SKU', '重复 Seller SKU'] as const
export type UiMappingExceptionKind = (typeof UI_MAPPING_EXCEPTION_KINDS)[number]

const LISTING_UI_TO_DB: Record<UiListingStatus, string> = {
  草稿: 'draft',
  待审: 'pending_review',
  在售: 'live',
  失败: 'failed',
  下架: 'offline',
}
const LISTING_DB_TO_UI: Record<string, UiListingStatus> = {
  draft: '草稿',
  pending_review: '待审',
  pending: '待审',
  live: '在售',
  active: '在售',
  failed: '失败',
  error: '失败',
  offline: '下架',
  delisted: '下架',
  inactive: '下架',
}

const PUBLISH_UI_TO_DB: Record<UiListingPublishState, string> = {
  未发布: 'unpublished',
  待同步: 'pending_sync',
  已发布: 'published',
  同步失败: 'sync_failed',
}
const PUBLISH_DB_TO_UI: Record<string, UiListingPublishState> = {
  unpublished: '未发布',
  pending_sync: '待同步',
  published: '已发布',
  sync_failed: '同步失败',
  failed: '同步失败',
}

const MAPPING_UI_TO_DB: Record<UiMappingStatus, string> = {
  待确认: 'pending',
  启用: 'active',
  异常: 'exception',
  停用: 'disabled',
}
const MAPPING_DB_TO_UI: Record<string, UiMappingStatus> = {
  pending: '待确认',
  active: '启用',
  enabled: '启用',
  exception: '异常',
  abnormal: '异常',
  disabled: '停用',
}

const EX_STATUS_UI_TO_DB: Record<string, string> = {
  开放: 'open',
  阻断扣库: 'open',
  已重试待验证: 'open',
  已修复: 'resolved',
  已忽略: 'ignored',
}
const EX_STATUS_DB_TO_UI: Record<string, UiMappingExceptionStatus> = {
  open: '开放',
  resolved: '已修复',
  ignored: '已忽略',
}

const EX_KIND_UI_TO_DB: Record<UiMappingExceptionKind, string> = {
  未映射: 'unmapped',
  冲突: 'conflict',
  '停用 SKU': 'disabled_variant',
  '重复 Seller SKU': 'duplicate_seller_sku',
}
const EX_KIND_DB_TO_UI: Record<string, UiMappingExceptionKind> = {
  unmapped: '未映射',
  conflict: '冲突',
  disabled_variant: '停用 SKU',
  disabled_sku: '停用 SKU',
  duplicate_seller_sku: '重复 Seller SKU',
}

export function toDbListingStatus(ui: string): string {
  if (ui in LISTING_UI_TO_DB) return LISTING_UI_TO_DB[ui as UiListingStatus]
  if (Object.values(LISTING_UI_TO_DB).includes(ui)) return ui
  return 'draft'
}

export function toUiListingStatus(db: string | null | undefined): UiListingStatus {
  return LISTING_DB_TO_UI[db ?? ''] ?? '草稿'
}

export function toDbPublishState(ui: string): string {
  if (ui in PUBLISH_UI_TO_DB) return PUBLISH_UI_TO_DB[ui as UiListingPublishState]
  if (Object.values(PUBLISH_UI_TO_DB).includes(ui)) return ui
  return 'unpublished'
}

export function toUiPublishState(db: string | null | undefined): UiListingPublishState {
  return PUBLISH_DB_TO_UI[db ?? ''] ?? '未发布'
}

export function publishStateForListingStatus(status: UiListingStatus): UiListingPublishState {
  if (status === '在售') return '已发布'
  if (status === '失败') return '同步失败'
  if (status === '待审') return '待同步'
  return '未发布'
}

export function toDbMappingStatus(ui: string): string {
  if (ui in MAPPING_UI_TO_DB) return MAPPING_UI_TO_DB[ui as UiMappingStatus]
  if (Object.values(MAPPING_UI_TO_DB).includes(ui)) return ui
  return 'pending'
}

export function toUiMappingStatus(db: string | null | undefined): UiMappingStatus {
  return MAPPING_DB_TO_UI[db ?? ''] ?? '待确认'
}

export function toDbExceptionStatus(ui: string): string {
  if (ui in EX_STATUS_UI_TO_DB) return EX_STATUS_UI_TO_DB[ui]
  if (['open', 'resolved', 'ignored'].includes(ui)) return ui
  return 'open'
}

export function toUiExceptionStatus(
  db: string | null | undefined,
  blocksReservation?: boolean,
): UiMappingExceptionStatus {
  if (db === 'open' && blocksReservation) return '阻断扣库'
  return EX_STATUS_DB_TO_UI[db ?? ''] ?? '开放'
}

export function toDbExceptionKind(ui: string): string {
  if (ui in EX_KIND_UI_TO_DB) return EX_KIND_UI_TO_DB[ui as UiMappingExceptionKind]
  if (Object.values(EX_KIND_UI_TO_DB).includes(ui)) return ui
  return 'unmapped'
}

export function toUiExceptionKind(db: string | null | undefined): UiMappingExceptionKind {
  return EX_KIND_DB_TO_UI[db ?? ''] ?? '未映射'
}

export function formatDateOnly(d: Date | string | null | undefined): string {
  if (!d) return ''
  if (typeof d === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10)
    const parsed = new Date(d)
    if (Number.isNaN(parsed.getTime())) return ''
    return parsed.toISOString().slice(0, 10)
  }
  return d.toISOString().slice(0, 10)
}

export function formatStamp(d: Date | string | null | undefined): string {
  if (!d) return ''
  if (typeof d === 'string') return d
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function platformLabel(platform: string | null | undefined): string {
  const p = (platform ?? '').toLowerCase()
  if (p === 'daraz') return 'Daraz'
  if (p === 'lazada') return 'Lazada'
  if (p === 'tiktok' || p === 'tiktok_shop') return 'TikTok'
  if (!platform) return '—'
  return platform
}
