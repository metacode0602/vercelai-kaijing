/**
 * WMS / 仓存 UI ↔ DB 映射（中文控制台）。
 */

export const UI_WAREHOUSE_TYPES = ['自营仓', 'LGS', 'JSB', '第三方仓'] as const
export type UiWarehouseType = (typeof UI_WAREHOUSE_TYPES)[number]

export const UI_WAREHOUSE_STATUSES = ['启用', '停用'] as const
export type UiWarehouseStatus = (typeof UI_WAREHOUSE_STATUSES)[number]

export const UI_BIN_STATUSES = ['空闲', '占用', '锁定', '停用'] as const
export type UiBinStatus = (typeof UI_BIN_STATUSES)[number]

export const UI_OUTBOUND_TYPES = [
  '订单出库',
  '调拨出库',
  '采购退货',
  '盘亏出库',
  '样品出库',
  '其他出库',
] as const
export type UiOutboundType = (typeof UI_OUTBOUND_TYPES)[number]

/** 非订单出库可选类型（不含订单出库） */
export const UI_WMS_OUTBOUND_TYPES = [
  '调拨出库',
  '采购退货',
  '盘亏出库',
  '样品出库',
  '其他出库',
] as const

export const UI_OUTBOUND_STATUSES = ['待拣货', '拣货中', '已复核', '已出库', '已取消'] as const
export type UiOutboundStatus = (typeof UI_OUTBOUND_STATUSES)[number]

export const UI_ADJUSTMENT_KINDS = ['盘点', '报损', '手工入库', '手工出库', '复盘'] as const
export type UiAdjustmentKind = (typeof UI_ADJUSTMENT_KINDS)[number]

export const UI_ADJUSTMENT_STATUSES = [
  '草稿',
  '待审批',
  '已通过',
  '已过账',
  '已驳回',
  '已取消',
] as const
export type UiAdjustmentStatus = (typeof UI_ADJUSTMENT_STATUSES)[number]

const WH_TYPE_UI: Record<string, UiWarehouseType> = {
  self_operated: '自营仓',
  lgs: 'LGS',
  jsb: 'JSB',
  third_party: '第三方仓',
  自营仓: '自营仓',
  LGS: 'LGS',
  JSB: 'JSB',
  第三方仓: '第三方仓',
}
const WH_TYPE_DB: Record<string, string> = {
  自营仓: 'self_operated',
  LGS: 'lgs',
  JSB: 'jsb',
  第三方仓: 'third_party',
  self_operated: 'self_operated',
  lgs: 'lgs',
  jsb: 'jsb',
  third_party: 'third_party',
}

const WH_STATUS_UI: Record<string, UiWarehouseStatus> = {
  active: '启用',
  disabled: '停用',
  启用: '启用',
  停用: '停用',
}
const WH_STATUS_DB: Record<string, string> = {
  启用: 'active',
  停用: 'disabled',
  active: 'active',
  disabled: 'disabled',
}

const BIN_STATUS_UI: Record<string, UiBinStatus> = {
  empty: '空闲',
  occupied: '占用',
  locked: '锁定',
  disabled: '停用',
  空闲: '空闲',
  占用: '占用',
  锁定: '锁定',
  停用: '停用',
}
const BIN_STATUS_DB: Record<string, string> = {
  空闲: 'empty',
  占用: 'occupied',
  锁定: 'locked',
  停用: 'disabled',
  empty: 'empty',
  occupied: 'occupied',
  locked: 'locked',
  disabled: 'disabled',
}

const OUT_TYPE_UI: Record<string, UiOutboundType> = {
  order: '订单出库',
  transfer: '调拨出库',
  purchase_return: '采购退货',
  stocktake_loss: '盘亏出库',
  sample: '样品出库',
  other: '其他出库',
  订单出库: '订单出库',
  调拨出库: '调拨出库',
  采购退货: '采购退货',
  盘亏出库: '盘亏出库',
  样品出库: '样品出库',
  其他出库: '其他出库',
  领用出库: '其他出库',
  报损出库: '盘亏出库',
}
const OUT_TYPE_DB: Record<string, string> = {
  订单出库: 'order',
  调拨出库: 'transfer',
  采购退货: 'purchase_return',
  盘亏出库: 'stocktake_loss',
  样品出库: 'sample',
  其他出库: 'other',
  领用出库: 'other',
  报损出库: 'stocktake_loss',
  order: 'order',
  transfer: 'transfer',
  purchase_return: 'purchase_return',
  stocktake_loss: 'stocktake_loss',
  sample: 'sample',
  other: 'other',
}

const OUT_STATUS_UI: Record<string, UiOutboundStatus> = {
  pending_pick: '待拣货',
  picking: '拣货中',
  reviewed: '已复核',
  posted: '已出库',
  cancelled: '已取消',
  待拣货: '待拣货',
  拣货中: '拣货中',
  已复核: '已复核',
  已出库: '已出库',
  已取消: '已取消',
}
const OUT_STATUS_DB: Record<string, string> = {
  待拣货: 'pending_pick',
  拣货中: 'picking',
  已复核: 'reviewed',
  已出库: 'posted',
  已取消: 'cancelled',
  pending_pick: 'pending_pick',
  picking: 'picking',
  reviewed: 'reviewed',
  posted: 'posted',
  cancelled: 'cancelled',
}

const ADJ_KIND_UI: Record<string, UiAdjustmentKind> = {
  stocktake: '盘点',
  damage: '报损',
  manual_in: '手工入库',
  manual_out: '手工出库',
  recount: '复盘',
  盘点: '盘点',
  报损: '报损',
  手工入库: '手工入库',
  手工出库: '手工出库',
  复盘: '复盘',
}
const ADJ_KIND_DB: Record<string, string> = {
  盘点: 'stocktake',
  报损: 'damage',
  手工入库: 'manual_in',
  手工出库: 'manual_out',
  复盘: 'recount',
  stocktake: 'stocktake',
  damage: 'damage',
  manual_in: 'manual_in',
  manual_out: 'manual_out',
  recount: 'recount',
}

const ADJ_STATUS_UI: Record<string, UiAdjustmentStatus> = {
  draft: '草稿',
  pending_approval: '待审批',
  approved: '已通过',
  posted: '已过账',
  rejected: '已驳回',
  cancelled: '已取消',
  草稿: '草稿',
  待审批: '待审批',
  已通过: '已通过',
  已过账: '已过账',
  已驳回: '已驳回',
  已取消: '已取消',
}
const ADJ_STATUS_DB: Record<string, string> = {
  草稿: 'draft',
  待审批: 'pending_approval',
  已通过: 'approved',
  已过账: 'posted',
  已驳回: 'rejected',
  已取消: 'cancelled',
  draft: 'draft',
  pending_approval: 'pending_approval',
  approved: 'approved',
  posted: 'posted',
  rejected: 'rejected',
  cancelled: 'cancelled',
}

export function toUiWarehouseType(v: string | null | undefined): UiWarehouseType {
  return WH_TYPE_UI[v || ''] ?? '自营仓'
}
export function toDbWarehouseType(v: string): string {
  return WH_TYPE_DB[v] ?? 'self_operated'
}
export function toUiWarehouseStatus(v: string | null | undefined): UiWarehouseStatus {
  return WH_STATUS_UI[v || ''] ?? '启用'
}
export function toDbWarehouseStatus(v: string): string {
  return WH_STATUS_DB[v] ?? 'active'
}
export function toUiBinStatus(v: string | null | undefined): UiBinStatus {
  return BIN_STATUS_UI[v || ''] ?? '空闲'
}
export function toDbBinStatus(v: string): string {
  return BIN_STATUS_DB[v] ?? 'empty'
}
export function toUiOutboundType(v: string | null | undefined): UiOutboundType {
  return OUT_TYPE_UI[v || ''] ?? '其他出库'
}
export function toDbOutboundType(v: string): string {
  return OUT_TYPE_DB[v] ?? 'other'
}
export function toUiOutboundStatus(v: string | null | undefined): UiOutboundStatus {
  return OUT_STATUS_UI[v || ''] ?? '待拣货'
}
export function toDbOutboundStatus(v: string): string {
  return OUT_STATUS_DB[v] ?? 'pending_pick'
}
export function toUiAdjustmentKind(v: string | null | undefined): UiAdjustmentKind {
  return ADJ_KIND_UI[v || ''] ?? '盘点'
}
export function toDbAdjustmentKind(v: string): string {
  return ADJ_KIND_DB[v] ?? 'stocktake'
}
export function toUiAdjustmentStatus(v: string | null | undefined): UiAdjustmentStatus {
  return ADJ_STATUS_UI[v || ''] ?? '草稿'
}
export function toDbAdjustmentStatus(v: string): string {
  return ADJ_STATUS_DB[v] ?? 'draft'
}

export function isNonOrderOutboundType(dbType: string): boolean {
  return dbType !== 'order'
}

export function availableQty(input: {
  onHand: number
  reserved: number
  qcHold: number
  damaged: number
}): number {
  return Math.max(0, input.onHand - input.reserved - input.qcHold - input.damaged)
}

export function formatStamp(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 流水 movement_type → 中文展示 */
export function toUiMovementType(movementType: string | null | undefined): string {
  const map: Record<string, string> = {
    order_reserve: '订单锁定',
    order_release: '订单释放',
    order_ship: '订单出库',
    reserve: '订单锁定',
    release: '订单释放',
    ship: '订单出库',
    purchase_stock_in: '采购入库',
    return_restock: '售后回库',
    return_hold: '售后暂存',
    qc_fail_damage: '质检报损',
    damage: '报损',
    write_off: '报废',
    adjustment: '手工调整',
    stock_adjust: '库存调整',
    wms_outbound: '非订单出库',
    ocean_depart: '海运开船',
    ocean_arrive: '海运到港',
    ocean_customs: '海运清关',
    ocean_receive: '海运到仓',
  }
  return map[movementType || ''] ?? movementType ?? '其他'
}

export const DEFAULT_WMS_WAREHOUSE = 'WH-CN-XMN-001'
export const DEFAULT_WMS_BIN = 'A-01-01-01'
