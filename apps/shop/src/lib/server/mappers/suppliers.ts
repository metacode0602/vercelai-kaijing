/**
 * 供应商 / 供应商货号 UI ↔ DB 映射（模块12）。
 */

export const UI_SUPPLIER_STATUSES = ['启用', '停用'] as const
export type UiSupplierStatus = (typeof UI_SUPPLIER_STATUSES)[number]

export const UI_SUPPLIER_SKU_STATUSES = ['启用', '待确认', '停用'] as const
export type UiSupplierSkuStatus = (typeof UI_SUPPLIER_SKU_STATUSES)[number]

const SUP_UI_TO_DB: Record<UiSupplierStatus, string> = {
  启用: 'active',
  停用: 'disabled',
}
const SUP_DB_TO_UI: Record<string, UiSupplierStatus> = {
  active: '启用',
  disabled: '停用',
}

const SSKU_UI_TO_DB: Record<UiSupplierSkuStatus, string> = {
  启用: 'active',
  待确认: 'pending',
  停用: 'disabled',
}
const SSKU_DB_TO_UI: Record<string, UiSupplierSkuStatus> = {
  active: '启用',
  pending: '待确认',
  disabled: '停用',
}

export function toDbSupplierStatus(ui?: string | null): string {
  if (!ui) return 'active'
  return SUP_UI_TO_DB[ui as UiSupplierStatus] ?? (ui === 'disabled' ? 'disabled' : 'active')
}

export function toUiSupplierStatus(db?: string | null): UiSupplierStatus {
  if (!db) return '启用'
  return SUP_DB_TO_UI[db] ?? (db === '停用' ? '停用' : '启用')
}

export function toDbSupplierSkuStatus(ui?: string | null): string {
  if (!ui) return 'active'
  return SSKU_UI_TO_DB[ui as UiSupplierSkuStatus] ?? (ui === 'pending' ? 'pending' : ui === 'disabled' ? 'disabled' : 'active')
}

export function toUiSupplierSkuStatus(db?: string | null): UiSupplierSkuStatus {
  if (!db) return '启用'
  return SSKU_DB_TO_UI[db] ?? (db === '待确认' ? '待确认' : db === '停用' ? '停用' : '启用')
}

export function formatStamp(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDateOnly(value: string | Date | null | undefined): string {
  if (!value) return '—'
  if (typeof value === 'string') return value.slice(0, 10)
  return formatStamp(value).slice(0, 10)
}

export function money(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value
  if (value == null || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
