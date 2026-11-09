/**
 * 订单 / 出库域 UI ↔ DB 状态映射（中文控制台 ↔ varchar 枚举）。
 *
 * Q07/C12 默认（可 env 覆盖，见 dataaccess/order.ts）：
 * - 锁定：paid / ready_to_ship 自动占库 + 人工补锁
 * - 扣减：出库过账（outbound_post）
 */

export const UI_ORDER_STATUSES = [
  '已创建',
  '已付款',
  '待发货',
  '已发货',
  '已签收',
  '已取消',
  '已退货',
  '丢失',
  '失败',
  '未知',
] as const
export type UiOrderStatus = (typeof UI_ORDER_STATUSES)[number]

export const UI_OUTBOUND_STATUSES = ['待拣货', '拣货中', '已复核', '已出库', '已取消'] as const
export type UiOutboundStatus = (typeof UI_OUTBOUND_STATUSES)[number]

export const UI_OUTBOUND_TYPES = [
  '订单出库',
  '调拨出库',
  '采购退货',
  '盘亏出库',
  '样品出库',
  '其他出库',
] as const
export type UiOutboundType = (typeof UI_OUTBOUND_TYPES)[number]

export const UI_MAPPING_STATUSES = ['正常', '待确认', '映射异常'] as const
export type UiMappingStatus = (typeof UI_MAPPING_STATUSES)[number]

export const UI_PACKAGE_STATUSES = UI_OUTBOUND_STATUSES
export type UiPackageStatus = UiOutboundStatus

const ORDER_UI_TO_DB: Record<UiOrderStatus, string> = {
  已创建: 'created',
  已付款: 'paid',
  待发货: 'ready_to_ship',
  已发货: 'shipped',
  已签收: 'delivered',
  已取消: 'cancelled',
  已退货: 'returned',
  丢失: 'lost',
  失败: 'failed',
  未知: 'unknown',
}
const ORDER_DB_TO_UI: Record<string, UiOrderStatus> = {
  created: '已创建',
  paid: '已付款',
  ready_to_ship: '待发货',
  shipped: '已发货',
  delivered: '已签收',
  cancelled: '已取消',
  returned: '已退货',
  lost: '丢失',
  failed: '失败',
  unknown: '未知',
}

const OUT_UI_TO_DB: Record<UiOutboundStatus, string> = {
  待拣货: 'pending_pick',
  拣货中: 'picking',
  已复核: 'reviewed',
  已出库: 'posted',
  已取消: 'cancelled',
}
const OUT_DB_TO_UI: Record<string, UiOutboundStatus> = {
  pending_pick: '待拣货',
  picking: '拣货中',
  reviewed: '已复核',
  posted: '已出库',
  cancelled: '已取消',
}

const TYPE_UI_TO_DB: Record<UiOutboundType, string> = {
  订单出库: 'order',
  调拨出库: 'transfer',
  采购退货: 'purchase_return',
  盘亏出库: 'stocktake_loss',
  样品出库: 'sample',
  其他出库: 'other',
}
const TYPE_DB_TO_UI: Record<string, UiOutboundType> = {
  order: '订单出库',
  transfer: '调拨出库',
  purchase_return: '采购退货',
  stocktake_loss: '盘亏出库',
  sample: '样品出库',
  other: '其他出库',
}

const MAP_UI_TO_DB: Record<UiMappingStatus, string> = {
  正常: 'ok',
  待确认: 'pending',
  映射异常: 'exception',
}
const MAP_DB_TO_UI: Record<string, UiMappingStatus> = {
  ok: '正常',
  pending: '待确认',
  exception: '映射异常',
}

export function toUiOrderStatus(db: string): UiOrderStatus {
  return ORDER_DB_TO_UI[db] ?? '未知'
}
export function toDbOrderStatus(ui: string): string {
  return ORDER_UI_TO_DB[ui as UiOrderStatus] ?? ui
}

export function toUiOutboundStatus(db: string): UiOutboundStatus {
  return OUT_DB_TO_UI[db] ?? '待拣货'
}
export function toDbOutboundStatus(ui: string): string {
  return OUT_UI_TO_DB[ui as UiOutboundStatus] ?? ui
}

export function toUiOutboundType(db: string): UiOutboundType {
  return TYPE_DB_TO_UI[db] ?? '订单出库'
}
export function toDbOutboundType(ui: string): string {
  return TYPE_UI_TO_DB[ui as UiOutboundType] ?? 'order'
}

export function toUiMappingStatus(db: string): UiMappingStatus {
  return MAP_DB_TO_UI[db] ?? '待确认'
}
export function toDbMappingStatus(ui: string): string {
  return MAP_UI_TO_DB[ui as UiMappingStatus] ?? 'pending'
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

/** Q07 默认：paid / ready_to_ship 触发自动占库；可用 ORDER_RESERVE_MODE=manual_only 关闭。 */
export function shouldAutoReserve(status: string): boolean {
  const mode = (process.env.ORDER_RESERVE_MODE || 'auto_on_paid').trim()
  if (mode === 'manual_only') return false
  // auto_on_paid | auto_on_pending（兼容）：已付款 / 待发货自动锁
  return status === 'paid' || status === 'ready_to_ship'
}
