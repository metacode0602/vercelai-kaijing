/**
 * 订单履约异常 UI ↔ DB 映射（模块12）。
 */

export const UI_ORDER_EXCEPTION_KINDS = [
  '超时未发货',
  '占库失败',
  '拣货异常',
  '同步失败',
] as const
export type UiOrderExceptionKind = (typeof UI_ORDER_EXCEPTION_KINDS)[number]

export const UI_ORDER_EXCEPTION_STATUSES = ['开放', '处理中', '已修复', '已忽略'] as const
export type UiOrderExceptionStatus = (typeof UI_ORDER_EXCEPTION_STATUSES)[number]

const KIND_UI_TO_DB: Record<UiOrderExceptionKind, string> = {
  超时未发货: 'timeout_unshipped',
  占库失败: 'reservation_failed',
  拣货异常: 'picking_exception',
  同步失败: 'sync_failed',
}
const KIND_DB_TO_UI: Record<string, UiOrderExceptionKind> = {
  timeout_unshipped: '超时未发货',
  reservation_failed: '占库失败',
  picking_exception: '拣货异常',
  sync_failed: '同步失败',
}

const STATUS_UI_TO_DB: Record<UiOrderExceptionStatus, string> = {
  开放: 'open',
  处理中: 'in_progress',
  已修复: 'resolved',
  已忽略: 'ignored',
}
const STATUS_DB_TO_UI: Record<string, UiOrderExceptionStatus> = {
  open: '开放',
  in_progress: '处理中',
  resolved: '已修复',
  ignored: '已忽略',
}

export function toDbExceptionKind(ui?: string | null): string | undefined {
  if (!ui) return undefined
  return KIND_UI_TO_DB[ui as UiOrderExceptionKind] ?? ui
}

export function toUiExceptionKind(db?: string | null): UiOrderExceptionKind {
  if (!db) return '超时未发货'
  return KIND_DB_TO_UI[db] ?? (UI_ORDER_EXCEPTION_KINDS.includes(db as UiOrderExceptionKind) ? (db as UiOrderExceptionKind) : '超时未发货')
}

export function toDbExceptionStatus(ui?: string | null): string | undefined {
  if (!ui) return undefined
  return STATUS_UI_TO_DB[ui as UiOrderExceptionStatus] ?? ui
}

export function toUiExceptionStatus(db?: string | null): UiOrderExceptionStatus {
  if (!db) return '开放'
  return STATUS_DB_TO_UI[db] ?? (UI_ORDER_EXCEPTION_STATUSES.includes(db as UiOrderExceptionStatus) ? (db as UiOrderExceptionStatus) : '开放')
}

export function formatStamp(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
