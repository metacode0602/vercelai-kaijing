/**
 * 采购域 UI ↔ DB 状态 / 来源映射（中文控制台 ↔ varchar 枚举）。
 */

export const UI_PURCHASE_REQUEST_STATUSES = [
  '草稿',
  '待审核',
  '已批准',
  '已驳回',
  '已转采购单',
  '已取消',
] as const
export type UiPurchaseRequestStatus = (typeof UI_PURCHASE_REQUEST_STATUSES)[number]

export const UI_PURCHASE_ORDER_STATUSES = [
  '草稿',
  '已下发',
  '部分到货',
  '已收货',
  '已关闭',
  '已取消',
] as const
export type UiPurchaseOrderStatus = (typeof UI_PURCHASE_ORDER_STATUSES)[number]

export const UI_PURCHASE_RECEIPT_STATUSES = ['草稿', '待质检', '已完成', '已取消'] as const
export type UiPurchaseReceiptStatus = (typeof UI_PURCHASE_RECEIPT_STATUSES)[number]

export const UI_STOCK_INBOUND_STATUSES = ['待上架', '已上架', '已取消'] as const
export type UiStockInboundStatus = (typeof UI_STOCK_INBOUND_STATUSES)[number]

export const UI_STOCK_INBOUND_SOURCE_TYPES = [
  '采购入库',
  '售后回库',
  '盘盈入库',
  '调拨入库',
] as const
export type UiStockInboundSourceType = (typeof UI_STOCK_INBOUND_SOURCE_TYPES)[number]

const PR_UI_TO_DB: Record<UiPurchaseRequestStatus, string> = {
  草稿: 'draft',
  待审核: 'pending_approval',
  已批准: 'approved',
  已驳回: 'rejected',
  已转采购单: 'converted',
  已取消: 'cancelled',
}
const PR_DB_TO_UI: Record<string, UiPurchaseRequestStatus> = {
  draft: '草稿',
  pending_approval: '待审核',
  approved: '已批准',
  rejected: '已驳回',
  converted: '已转采购单',
  cancelled: '已取消',
}

const PO_UI_TO_DB: Record<UiPurchaseOrderStatus, string> = {
  草稿: 'draft',
  已下发: 'sent',
  部分到货: 'partial_received',
  已收货: 'received',
  已关闭: 'closed',
  已取消: 'cancelled',
}
const PO_DB_TO_UI: Record<string, UiPurchaseOrderStatus> = {
  draft: '草稿',
  sent: '已下发',
  partial_received: '部分到货',
  received: '已收货',
  closed: '已关闭',
  cancelled: '已取消',
}

const RCV_UI_TO_DB: Record<UiPurchaseReceiptStatus, string> = {
  草稿: 'draft',
  待质检: 'qc_pending',
  已完成: 'completed',
  已取消: 'cancelled',
}
const RCV_DB_TO_UI: Record<string, UiPurchaseReceiptStatus> = {
  draft: '草稿',
  qc_pending: '待质检',
  completed: '已完成',
  cancelled: '已取消',
}

const INB_UI_TO_DB: Record<UiStockInboundStatus, string> = {
  待上架: 'pending_shelve',
  已上架: 'shelved',
  已取消: 'cancelled',
}
const INB_DB_TO_UI: Record<string, UiStockInboundStatus> = {
  pending_shelve: '待上架',
  shelved: '已上架',
  cancelled: '已取消',
}

const SRC_UI_TO_DB: Record<UiStockInboundSourceType, string> = {
  采购入库: 'purchase',
  售后回库: 'aftersale_return',
  盘盈入库: 'stocktake_gain',
  调拨入库: 'transfer_in',
}
const SRC_DB_TO_UI: Record<string, UiStockInboundSourceType> = {
  purchase: '采购入库',
  aftersale_return: '售后回库',
  stocktake_gain: '盘盈入库',
  transfer_in: '调拨入库',
}

export function toUiPrStatus(db: string): UiPurchaseRequestStatus {
  return PR_DB_TO_UI[db] ?? '草稿'
}
export function toDbPrStatus(ui: string): string {
  return PR_UI_TO_DB[ui as UiPurchaseRequestStatus] ?? 'draft'
}

export function toUiPoStatus(db: string): UiPurchaseOrderStatus {
  return PO_DB_TO_UI[db] ?? '草稿'
}
export function toDbPoStatus(ui: string): string {
  return PO_UI_TO_DB[ui as UiPurchaseOrderStatus] ?? 'draft'
}

export function toUiReceiptStatus(db: string): UiPurchaseReceiptStatus {
  return RCV_DB_TO_UI[db] ?? '草稿'
}
export function toDbReceiptStatus(ui: string): string {
  return RCV_UI_TO_DB[ui as UiPurchaseReceiptStatus] ?? 'draft'
}

export function toUiInboundStatus(db: string): UiStockInboundStatus {
  return INB_DB_TO_UI[db] ?? '待上架'
}
export function toDbInboundStatus(ui: string): string {
  return INB_UI_TO_DB[ui as UiStockInboundStatus] ?? 'pending_shelve'
}

export function toUiInboundSource(db: string): UiStockInboundSourceType {
  return SRC_DB_TO_UI[db] ?? '采购入库'
}
export function toDbInboundSource(ui: string): string {
  return SRC_UI_TO_DB[ui as UiStockInboundSourceType] ?? 'purchase'
}

export function money(n: number | string | null | undefined): number {
  if (n == null) return 0
  const v = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(v) ? Math.round(v * 10000) / 10000 : 0
}

export function formatStamp(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return typeof d === 'string' ? d : ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatDateOnly(d: Date | string | null | undefined): string {
  if (!d) return ''
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10)
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
