/**
 * 售后 UI ↔ DB 状态映射（中文控制台 ↔ varchar / request_type）。
 * reverse_orders.request_type: CANCEL / RETURN / ONLY_REFUND
 * fulfillment_status 存审核/退货履约态；UI 状态在 raw.uiStatus 同步。
 */

export const UI_TICKET_STATUSES = ['待确认', '已审核', '已驳回', '已入库'] as const
export type UiTicketStatus = (typeof UI_TICKET_STATUSES)[number]

export const UI_RETURN_STATUSES = [
  '待收货确认',
  '待质检',
  '质检中',
  '已回库',
  '已报损',
  '部分回库',
] as const
export type UiReturnStatus = (typeof UI_RETURN_STATUSES)[number]

export const UI_CANCEL_STATUSES = ['待确认', '已审核', '已驳回'] as const
export type UiCancelStatus = (typeof UI_CANCEL_STATUSES)[number]

/** 占库释放状态 @see docs/design/aftersale-cancel-ingest-and-policy.md §3 */
export const RELEASE_STATUSES = [
  'pending_manual',
  'released',
  'skipped',
  'failed',
] as const
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number]

export const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  pending_manual: '待释放',
  released: '已释放',
  skipped: '跳过',
  failed: '失败',
}

/** 退款决定状态 @see docs/design/aftersale-cancel-ingest-and-policy.md §4 */
export const REFUND_DECISIONS = [
  'pending_manual',
  'scheduled',
  'deciding',
  'agreed',
  'rejected',
  'skipped',
  'unsupported',
] as const
export type RefundDecision = (typeof REFUND_DECISIONS)[number]

export const REFUND_DECISION_LABELS: Record<RefundDecision, string> = {
  pending_manual: '待人工',
  scheduled: '已排期',
  deciding: '决定中',
  agreed: '已同意',
  rejected: '已拒绝',
  skipped: '跳过',
  unsupported: '平台不支持',
}

export const UI_AFTERSALE_TYPES = ['取消', '取消订单', '仅退款', '退货退款', '换货'] as const
export type UiAftersaleType = (typeof UI_AFTERSALE_TYPES)[number]

/** DB request_type */
export const DB_REQUEST_TYPES = ['CANCEL', 'RETURN', 'ONLY_REFUND'] as const
export type DbRequestType = (typeof DB_REQUEST_TYPES)[number]

const TYPE_UI_TO_DB: Record<string, DbRequestType> = {
  取消: 'CANCEL',
  取消订单: 'CANCEL',
  仅退款: 'ONLY_REFUND',
  退货退款: 'RETURN',
  换货: 'RETURN',
  CANCEL: 'CANCEL',
  RETURN: 'RETURN',
  ONLY_REFUND: 'ONLY_REFUND',
}

const TYPE_DB_TO_UI: Record<string, string> = {
  CANCEL: '取消',
  RETURN: '退货退款',
  ONLY_REFUND: '仅退款',
}

const TICKET_UI_TO_DB: Record<UiTicketStatus, string> = {
  待确认: 'pending_review',
  已审核: 'approved',
  已驳回: 'rejected',
  已入库: 'restocked',
}
const TICKET_DB_TO_UI: Record<string, UiTicketStatus> = {
  pending_review: '待确认',
  approved: '已审核',
  rejected: '已驳回',
  restocked: '已入库',
  pending_receive: '待确认',
  pending_qc: '待确认',
  qc_in_progress: '待确认',
  scrapped: '已入库',
  partial_restock: '已入库',
}

const RETURN_UI_TO_DB: Record<UiReturnStatus, string> = {
  待收货确认: 'pending_receive',
  待质检: 'pending_qc',
  质检中: 'qc_in_progress',
  已回库: 'restocked',
  已报损: 'scrapped',
  部分回库: 'partial_restock',
}
const RETURN_DB_TO_UI: Record<string, UiReturnStatus> = {
  pending_receive: '待收货确认',
  pending_qc: '待质检',
  qc_in_progress: '质检中',
  restocked: '已回库',
  scrapped: '已报损',
  partial_restock: '部分回库',
}

const CANCEL_UI_TO_DB: Record<UiCancelStatus, string> = {
  待确认: 'pending_review',
  已审核: 'approved',
  已驳回: 'rejected',
}
const CANCEL_DB_TO_UI: Record<string, UiCancelStatus> = {
  pending_review: '待确认',
  approved: '已审核',
  rejected: '已驳回',
}

export function toDbRequestType(ui: string): DbRequestType {
  return TYPE_UI_TO_DB[ui] || 'RETURN'
}

export function toUiRequestType(db: string | null | undefined, fallbackLabel?: string): string {
  if (fallbackLabel) return fallbackLabel
  if (!db) return '退货退款'
  return TYPE_DB_TO_UI[db] || db
}

export function toDbTicketStatus(ui: string): string {
  if (ui in TICKET_UI_TO_DB) return TICKET_UI_TO_DB[ui as UiTicketStatus]
  if (Object.values(TICKET_UI_TO_DB).includes(ui)) return ui
  return 'pending_review'
}

export function toUiTicketStatus(db: string | null | undefined): UiTicketStatus {
  if (!db) return '待确认'
  if ((UI_TICKET_STATUSES as readonly string[]).includes(db)) return db as UiTicketStatus
  return TICKET_DB_TO_UI[db] || '待确认'
}

export function toDbReturnStatus(ui: string): string {
  if (ui in RETURN_UI_TO_DB) return RETURN_UI_TO_DB[ui as UiReturnStatus]
  if (Object.values(RETURN_UI_TO_DB).includes(ui)) return ui
  return 'pending_receive'
}

export function toUiReturnStatus(db: string | null | undefined): UiReturnStatus {
  if (!db) return '待收货确认'
  return RETURN_DB_TO_UI[db] || '待收货确认'
}

export function toDbCancelStatus(ui: string): string {
  if (ui in CANCEL_UI_TO_DB) return CANCEL_UI_TO_DB[ui as UiCancelStatus]
  if (Object.values(CANCEL_UI_TO_DB).includes(ui)) return ui
  return 'pending_review'
}

export function toUiCancelStatus(db: string | null | undefined): UiCancelStatus {
  if (!db) return '待确认'
  if ((UI_CANCEL_STATUSES as readonly string[]).includes(db)) return db as UiCancelStatus
  return CANCEL_DB_TO_UI[db] || '待确认'
}

export function formatStamp(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return typeof d === 'string' ? d : ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function money(v: string | number | null | undefined): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export function isCancelLike(requestType: string | null | undefined, typeLabel?: string): boolean {
  const t = (typeLabel || requestType || '').toUpperCase()
  if (t === 'CANCEL' || t === 'ONLY_REFUND') return true
  return typeLabel === '取消' || typeLabel === '取消订单' || typeLabel === '仅退款'
}

export function isReturnLike(requestType: string | null | undefined, typeLabel?: string): boolean {
  if (typeLabel === '退货退款' || typeLabel === '换货') return true
  return (requestType || '').toUpperCase() === 'RETURN'
}
