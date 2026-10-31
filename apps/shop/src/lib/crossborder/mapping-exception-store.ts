'use client'

/**
 * mapping_exceptions 原型会话 store（schema §3.3）— Phase 4。
 * kind: unmapped / conflict / disabled_variant / duplicate_seller_sku
 * 未映射/冲突订单行必须进本表且禁止自动占库。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'

export const EXCEPTION_KINDS = ['未映射', '冲突', '停用 SKU', '重复 Seller SKU'] as const
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number]

export const EXCEPTION_STATUSES = ['开放', '已修复', '已忽略', '阻断扣库', '已重试待验证'] as const
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number]

/** 映射异常（对齐 mapping_exceptions + 订单异常运营面） */
export type MappingException = {
  id: string
  shop: string
  platform: string
  order: string
  sellerSku: string
  internalSku: string
  itemId: string
  kind: ExceptionKind
  reason: string
  status: ExceptionStatus | string
  /** 是否阻断自动占库（UI 明示） */
  blocksReservation: boolean
  payloadSummary: string
  updatedAt: string
  createdAt: string
  resolvedAt: string
  resolution: string
}

function nowStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const DEMO: MappingException[] = [
  {
    id: 'EX-2026-0012',
    shop: 'Daraz LK',
    platform: 'Daraz',
    order: 'DZ-10031',
    sellerSku: 'TEE-OLD-BLACK',
    internalSku: '—',
    itemId: 'LK-ITEM-9901',
    kind: '未映射',
    reason: '未映射',
    status: '阻断扣库',
    blocksReservation: true,
    payloadSummary: '平台订单行 Seller SKU 在本店无启用映射',
    updatedAt: '2026-10-28 09:31',
    createdAt: '2026-10-28 09:30',
    resolvedAt: '',
    resolution: '',
  },
  {
    id: 'EX-2026-0011',
    shop: 'Lazada MY',
    platform: 'Lazada',
    order: 'LZ-2201',
    sellerSku: 'TEE-BLK-L',
    internalSku: 'HSY000001001',
    itemId: 'MY-ITEM-4412',
    kind: '停用 SKU',
    reason: '映射 SKU 停用',
    status: '阻断扣库',
    blocksReservation: true,
    payloadSummary: '内部 SKU HSY000001001 状态为停用，禁止自动占库',
    updatedAt: '2026-10-28 09:20',
    createdAt: '2026-10-28 09:18',
    resolvedAt: '',
    resolution: '',
  },
  {
    id: 'EX-2026-0010',
    shop: 'Lazada PH',
    platform: 'Lazada',
    order: 'PH-8812',
    sellerSku: 'HUB-7IN1',
    internalSku: 'HSY000002001 / HSY000001002',
    itemId: 'PH-ITEM-220',
    kind: '冲突',
    reason: '重复映射冲突',
    status: '开放',
    blocksReservation: true,
    payloadSummary: '同一 Seller SKU 命中两条启用映射，冲突待裁决',
    updatedAt: '2026-10-27 16:40',
    createdAt: '2026-10-27 16:38',
    resolvedAt: '',
    resolution: '',
  },
  {
    id: 'EX-2026-0009',
    shop: 'Daraz LK',
    platform: 'Daraz',
    order: 'DZ-10008',
    sellerSku: 'TEE-WHT-L',
    internalSku: 'HSY000001002',
    itemId: 'LK-ITEM-7710',
    kind: '重复 Seller SKU',
    reason: '店铺内 Seller SKU 重复',
    status: '已忽略',
    blocksReservation: false,
    payloadSummary: '历史导入残留，运营已忽略',
    updatedAt: '2026-10-26 11:00',
    createdAt: '2026-10-26 10:55',
    resolvedAt: '2026-10-26 11:00',
    resolution: '忽略（历史残留）',
  },
]

const store = createDemoStore<MappingException[]>(
  'open-shop.console.demo.mapping-exceptions.v1',
  structuredClone(DEMO),
)

export function useMappingExceptions() {
  return store.useStore()
}

export function getMappingExceptions() {
  return store.get()
}

export function getMappingException(id: string) {
  return store.get().find((item) => item.id === id)
}

export function countExceptionsKpi(rows: MappingException[]) {
  return {
    total: rows.length,
    open: rows.filter((item) => item.status === '开放' || item.status === '阻断扣库').length,
    unmapped: rows.filter((item) => item.kind === '未映射').length,
    conflict: rows.filter((item) => item.kind === '冲突' || item.kind === '重复 Seller SKU').length,
    disabled: rows.filter((item) => item.kind === '停用 SKU').length,
    blocking: rows.filter((item) => item.blocksReservation).length,
  }
}

export function retryExceptionIdentify(
  id: string,
): { ok: true; row: MappingException } | { ok: false; reason: string } {
  const list = store.get()
  const index = list.findIndex((item) => item.id === id)
  if (index < 0) return { ok: false, reason: '异常记录不存在' }
  const current = list[index]!
  if (!current.blocksReservation && current.status === '已修复') {
    return { ok: false, reason: '已修复的异常无需重试' }
  }
  const next: MappingException = {
    ...current,
    status: '已重试待验证',
    updatedAt: nowStamp(),
  }
  const copy = [...list]
  copy[index] = next
  store.set(copy)
  return { ok: true, row: next }
}

export function resolveException(
  id: string,
  resolution: string,
): { ok: true; row: MappingException } | { ok: false; reason: string } {
  const list = store.get()
  const index = list.findIndex((item) => item.id === id)
  if (index < 0) return { ok: false, reason: '异常记录不存在' }
  if (!resolution.trim()) return { ok: false, reason: '请填写修复说明' }
  const next: MappingException = {
    ...list[index]!,
    status: '已修复',
    blocksReservation: false,
    resolution: resolution.trim(),
    resolvedAt: nowStamp(),
    updatedAt: nowStamp(),
  }
  const copy = [...list]
  copy[index] = next
  store.set(copy)
  return { ok: true, row: next }
}

export function ignoreException(
  id: string,
  note: string,
): { ok: true; row: MappingException } | { ok: false; reason: string } {
  const list = store.get()
  const index = list.findIndex((item) => item.id === id)
  if (index < 0) return { ok: false, reason: '异常记录不存在' }
  const next: MappingException = {
    ...list[index]!,
    status: '已忽略',
    blocksReservation: false,
    resolution: note.trim() || '运营忽略',
    resolvedAt: nowStamp(),
    updatedAt: nowStamp(),
  }
  const copy = [...list]
  copy[index] = next
  store.set(copy)
  return { ok: true, row: next }
}

export function toRelatedExceptionShape(row: MappingException): Record<string, unknown> {
  return {
    id: row.id,
    shop: row.shop,
    order: row.order,
    sellerSku: row.sellerSku,
    internalSku: row.internalSku,
    reason: row.reason,
    kind: row.kind,
    status: row.status,
    updatedAt: row.updatedAt,
    blocksReservation: row.blocksReservation,
  }
}
