/** UI 中文状态 ↔ DB 英文状态（products / product_variants）。 */

export const UI_PRODUCT_STATUSES = ['待确认', '启用', '停用'] as const
export type UiProductStatus = (typeof UI_PRODUCT_STATUSES)[number]

export type DbProductStatus = 'draft' | 'active' | 'disabled'

const UI_TO_DB: Record<UiProductStatus, DbProductStatus> = {
  待确认: 'draft',
  启用: 'active',
  停用: 'disabled',
}

const DB_TO_UI: Record<string, UiProductStatus> = {
  draft: '待确认',
  pending: '待确认',
  active: '启用',
  disabled: '停用',
  archived: '停用',
}

export function toDbStatus(ui: string | undefined | null, fallback: DbProductStatus = 'draft'): DbProductStatus {
  if (!ui) return fallback
  if (ui in UI_TO_DB) return UI_TO_DB[ui as UiProductStatus]
  if (ui === 'draft' || ui === 'active' || ui === 'disabled') return ui
  return fallback
}

export function toUiStatus(db: string | null | undefined): UiProductStatus {
  if (!db) return '待确认'
  return DB_TO_UI[db] ?? '待确认'
}

export type ProductImageRef = { url: string }

export function normalizeImages(input: unknown): ProductImageRef[] {
  if (!Array.isArray(input)) return []
  const out: ProductImageRef[] = []
  for (const item of input) {
    if (typeof item === 'string' && item.trim()) {
      out.push({ url: item.trim() })
      continue
    }
    if (item && typeof item === 'object' && 'url' in item) {
      const url = String((item as { url: unknown }).url ?? '').trim()
      if (url) out.push({ url })
    }
  }
  return out
}

export function imagesToUrls(images: ProductImageRef[] | null | undefined): string[] {
  return (images ?? []).map((item) => item.url).filter(Boolean)
}

export type VariantAttrs = {
  color?: string
  size?: string
  pack?: string
  remark?: string
  coverImage?: string
  images?: string[]
  [key: string]: unknown
}

export function readVariantAttrs(attrs: unknown): VariantAttrs {
  if (!attrs || typeof attrs !== 'object') return {}
  return attrs as VariantAttrs
}

export type ProductPayload = {
  ownerName?: string
  [key: string]: unknown
}

export function readProductPayload(payload: unknown): ProductPayload {
  if (!payload || typeof payload !== 'object') return {}
  return payload as ProductPayload
}
