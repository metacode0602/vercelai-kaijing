/**
 * 财务结算 / 成本 / 利润 UI ↔ DB 映射（模块13）。
 */

export const UI_SETTLEMENT_STATUSES = ['待匹配', '差异待处理', '已确认', '已打款', '未结算'] as const
export type UiSettlementStatus = (typeof UI_SETTLEMENT_STATUSES)[number]

const STATUS_UI_TO_DB: Record<string, string> = {
  待匹配: 'pending',
  差异待处理: 'diff',
  已确认: 'confirmed',
  已打款: 'paid',
  未结算: 'unsettled',
  pending: 'pending',
  diff: 'diff',
  confirmed: 'confirmed',
  paid: 'paid',
  unsettled: 'unsettled',
}
const STATUS_DB_TO_UI: Record<string, UiSettlementStatus> = {
  pending: '待匹配',
  diff: '差异待处理',
  confirmed: '已确认',
  paid: '已打款',
  unsettled: '未结算',
}

export function toDbSettlementStatus(ui?: string | null): string | undefined {
  if (!ui) return undefined
  return STATUS_UI_TO_DB[ui] ?? ui
}

export function toUiSettlementStatus(db?: string | null): UiSettlementStatus {
  if (!db) return '待匹配'
  return STATUS_DB_TO_UI[db] ?? (UI_SETTLEMENT_STATUSES.includes(db as UiSettlementStatus) ? (db as UiSettlementStatus) : '待匹配')
}

export function formatStamp(value: Date | string | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDateOnly(value: Date | string | null | undefined): string {
  if (!value) return '—'
  if (typeof value === 'string') return value.slice(0, 10)
  return formatStamp(value).slice(0, 10)
}

export function money(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (value == null || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export type FeeBreakdown = {
  platform: number
  logistics: number
  ads: number
  jsb: number
  refunds: number
  fx: number
}

export function emptyFees(): FeeBreakdown {
  return { platform: 0, logistics: 0, ads: 0, jsb: 0, refunds: 0, fx: 0 }
}

export function sumFeeBreakdown(fees: FeeBreakdown): number {
  return fees.platform + fees.logistics + fees.ads + fees.jsb + fees.refunds + fees.fx
}

export function feeKindBucket(kind?: string | null): keyof FeeBreakdown | null {
  const k = (kind ?? '').toLowerCase()
  if (!k) return null
  if (k.includes('platform') || k.includes('commission') || k === '平台') return 'platform'
  if (k.includes('logistic') || k.includes('shipment') || k.includes('shipping') || k === '物流') return 'logistics'
  if (k.includes('ad') || k.includes('promo') || k === '推广') return 'ads'
  if (k.includes('jsb')) return 'jsb'
  if (k.includes('refund') || k === '退款') return 'refunds'
  if (k.includes('fx') || k.includes('fx') || k.includes('exchange') || k === '汇兑') return 'fx'
  return null
}
