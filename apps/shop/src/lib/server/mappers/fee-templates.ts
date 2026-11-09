/**
 * 费用模板 UI ↔ DB 状态映射（中文控制台 ↔ varchar 枚举）。
 * 模板头：草稿/启用/停用 ↔ draft/active/disabled
 * 版本审核（UED v1.1 C8）：草稿/审核中/已发布/已停用 ↔ draft/in_review/published/disabled
 */

export const UI_FEE_TEMPLATE_HEADER_STATUSES = ['草稿', '启用', '停用'] as const
export type UiFeeTemplateHeaderStatus = (typeof UI_FEE_TEMPLATE_HEADER_STATUSES)[number]

export const UI_FEE_TEMPLATE_VERSION_STATUSES = [
  '草稿',
  '审核中',
  '已发布',
  '已停用',
] as const
export type UiFeeTemplateVersionStatus = (typeof UI_FEE_TEMPLATE_VERSION_STATUSES)[number]

export const UI_FEE_TEMPLATE_TYPES = ['进口税', '平台费', '海运运费'] as const
export type UiFeeTemplateType = (typeof UI_FEE_TEMPLATE_TYPES)[number]

export const FEE_TEMPLATE_TYPE_OPTIONS = [
  { label: '进口税', value: 'import_tax' },
  { label: '平台费', value: 'platform_fee' },
  { label: '海运运费', value: 'ocean_freight' },
] as const

export const FULFILLMENT_POOL_OPTIONS = [
  'daraz_lk_sea_lot',
  'lazada_cn_spot_xmn',
  'lazada_cn_spot_sz',
] as const

export const FULFILLMENT_LOGISTICS_OPTIONS = [
  '',
  'FCL',
  'LCL',
  'AIR_DDP',
  'FCL20',
  'FCL40',
] as const

const HEADER_UI_TO_DB: Record<UiFeeTemplateHeaderStatus, string> = {
  草稿: 'draft',
  启用: 'active',
  停用: 'disabled',
}
const HEADER_DB_TO_UI: Record<string, UiFeeTemplateHeaderStatus> = {
  draft: '草稿',
  active: '启用',
  disabled: '停用',
}

const VERSION_UI_TO_DB: Record<UiFeeTemplateVersionStatus, string> = {
  草稿: 'draft',
  审核中: 'in_review',
  已发布: 'published',
  已停用: 'disabled',
}
const VERSION_DB_TO_UI: Record<string, UiFeeTemplateVersionStatus> = {
  draft: '草稿',
  in_review: '审核中',
  published: '已发布',
  disabled: '已停用',
}

const TYPE_UI_TO_DB: Record<UiFeeTemplateType, string> = {
  进口税: 'import_tax',
  平台费: 'platform_fee',
  海运运费: 'ocean_freight',
}
const TYPE_DB_TO_UI: Record<string, UiFeeTemplateType> = {
  import_tax: '进口税',
  platform_fee: '平台费',
  ocean_freight: '海运运费',
}

export function toDbHeaderStatus(ui: string): string {
  if (ui in HEADER_UI_TO_DB) return HEADER_UI_TO_DB[ui as UiFeeTemplateHeaderStatus]
  if (['draft', 'active', 'disabled'].includes(ui)) return ui
  // 兼容旧原型 label
  if (ui === '启用') return 'active'
  return 'draft'
}

export function toUiHeaderStatus(db: string | null | undefined): UiFeeTemplateHeaderStatus {
  return HEADER_DB_TO_UI[db ?? ''] ?? '草稿'
}

export function toDbVersionStatus(ui: string): string {
  if (ui in VERSION_UI_TO_DB) return VERSION_UI_TO_DB[ui as UiFeeTemplateVersionStatus]
  if (['draft', 'in_review', 'published', 'disabled'].includes(ui)) return ui
  return 'draft'
}

export function toUiVersionStatus(db: string | null | undefined): UiFeeTemplateVersionStatus {
  return VERSION_DB_TO_UI[db ?? ''] ?? '草稿'
}

export function toDbFeeType(uiOrDb: string): 'import_tax' | 'platform_fee' | 'ocean_freight' {
  if (uiOrDb in TYPE_UI_TO_DB) return TYPE_UI_TO_DB[uiOrDb as UiFeeTemplateType] as 'import_tax' | 'platform_fee' | 'ocean_freight'
  if (uiOrDb === 'platform_fee') return 'platform_fee'
  if (uiOrDb === 'ocean_freight') return 'ocean_freight'
  return 'import_tax'
}

export function toUiFeeType(db: string | null | undefined): UiFeeTemplateType {
  return TYPE_DB_TO_UI[db ?? ''] ?? '进口税'
}

export function feeTypeLabel(db: string): string {
  return toUiFeeType(db)
}

/** status ↔ published 同步：仅 published 参与解析 */
export function publishedFromStatus(status: string): boolean {
  return status === 'published'
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
  return d.toISOString()
}

export function parseDateInput(value: string | null | undefined): Date | null {
  if (!value || !value.trim()) return null
  const raw = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00.000Z`)
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}
