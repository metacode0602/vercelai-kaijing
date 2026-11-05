'use client'

/**
 * WMS / 仓储库存原型会话 store（Phase 3）。
 * 字段对齐 docs/design/haoshiyun-erp-database-schema.md：
 *   commerce_warehouses / commerce_bins
 *   inventory_balances / inventory_ledger
 *   stock_adjustments (+ lines)
 *   出库作业面（订单履约出库 → ledger event_type=order_ship）
 * 状态机：
 *   仓库 / 库位：启用 ↔ 停用（软停用）
 *   出库单：待拣货 → 拣货中 → 已复核 → 已出库 / 已取消
 *   调整单：草稿 → 待审批 → 已通过 → 已过账 / 已驳回 / 已取消
 *   流水：追加式，禁止改删；余额为投影
 * 与 P2 入库上架连续：confirmStockInboundShelve 调用 applyPurchaseStockIn。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'
import { ERP_DEMO_BINS, ERP_DEMO_INVENTORY } from '@/lib/crossborder/erp-ued-data'
import { INITIAL_WAREHOUSES } from '@/lib/crossborder/platform-basics-data'

export const WAREHOUSE_STATUSES = ['启用', '停用'] as const
export type WarehouseStatus = (typeof WAREHOUSE_STATUSES)[number]

export const WAREHOUSE_TYPES = ['自营仓', 'LGS', 'JSB', '第三方仓'] as const
export type WarehouseType = (typeof WAREHOUSE_TYPES)[number]

export const BIN_STATUSES = ['空闲', '占用', '锁定', '停用'] as const
export type BinStatus = (typeof BIN_STATUSES)[number]

export const OUTBOUND_STATUSES = ['待拣货', '拣货中', '已复核', '已出库', '已取消'] as const
export type OutboundStatus = (typeof OUTBOUND_STATUSES)[number]

export const OUTBOUND_TYPES = ['订单出库', '调拨出库', '采购退货', '盘亏出库', '样品出库', '其他出库'] as const
export type OutboundType = (typeof OUTBOUND_TYPES)[number]

export const ADJUSTMENT_STATUSES = ['草稿', '待审批', '已通过', '已过账', '已驳回', '已取消'] as const
export type AdjustmentStatus = (typeof ADJUSTMENT_STATUSES)[number]

export const ADJUSTMENT_KINDS = ['盘点', '报损', '手工入库', '手工出库', '复盘'] as const
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number]

/** inventory_ledger.event_type 中文投影 */
export const LEDGER_EVENT_TYPES = [
  '采购入库',
  '订单锁定',
  '订单释放',
  '订单出库',
  '售后回库',
  '质检报损',
  '手工调整',
  '盘点差异',
  '期初迁移',
] as const
export type LedgerEventType = (typeof LEDGER_EVENT_TYPES)[number]

export const SKU_OPTIONS = ['HSY000001001', 'HSY000001002', 'HSY000002001'] as const

export type WmsWarehouse = {
  id: string
  code: string
  name: string
  type: WarehouseType
  country: string
  timezone: string
  currency: string
  status: WarehouseStatus
  address: string
  shops: string[]
  note: string
}

/** commerce_bins — 库位 */
export type WmsBin = {
  id: string
  warehouseCode: string
  zoneCode: string
  code: string
  name: string
  /** 一库位一启用 SKU（R07）；空闲时为空 */
  boundSku: string
  status: BinStatus
  note: string
}

/** inventory_balances */
export type InventoryBalance = {
  id: string
  warehouse: string
  bin: string
  sku: string
  name: string
  onHand: number
  reserved: number
  qcHold: number
  damaged: number
  /** 投影：on_hand - reserved - qc_hold - damaged */
  available: number
  inTransit: number
  threshold: number
  version: number
  updatedAt: string
  status: '正常' | '低库存'
}

/** inventory_ledger — 追加式 */
export type InventoryLedgerEntry = {
  id: string
  warehouse: string
  bin: string
  sku: string
  direction: 'in' | 'out' | 'move' | 'adjust'
  eventType: LedgerEventType
  /** 展示用变动类型文案 */
  type: string
  qty: number
  onHandBefore: number
  onHandAfter: number
  reservedBefore: number
  reservedAfter: number
  sourceType: string
  sourceId: string
  sourceLineId: string
  shop: string
  platform: string
  externalShopId: string
  reason: string
  actor: string
  idempotencyKey: string
  occurredAt: string
  status: '已记账'
}

export type StockOutboundLine = {
  id: string
  lineNo: number
  sku: string
  quantity: number
  bin: string
  note: string
}

/** 出库作业单（头 + 行） */
export type StockOutbound = {
  id: string
  outboundNo: string
  outboundType: OutboundType
  warehouse: string
  /** 关联订单 / 调拨单等 */
  order: string
  packageId: string
  picker: string
  status: OutboundStatus
  createdAt: string
  pickedAt: string
  checkedAt: string
  shippedAt: string
  reason: string
  remark: string
  /** ledger 幂等键（出库过账后） */
  idempotencyKey: string
  lines: StockOutboundLine[]
}

export type StockOutboundListRow = Omit<StockOutbound, 'lines'> & {
  lineCount: number
  firstSku: string
  totalQty: number
  bin: string
  sku: string
  quantity: number
}

export type StockAdjustmentLine = {
  id: string
  lineNo: number
  sku: string
  bin: string
  qtySystem: number
  qtyCounted: number
  /** counted - system */
  qtyDiff: number
  note: string
}

/** stock_adjustments 头 + 行 */
export type StockAdjustment = {
  id: string
  adjustmentNo: string
  kind: AdjustmentKind
  warehouse: string
  status: AdjustmentStatus
  reason: string
  applicant: string
  approver: string
  createdAt: string
  approvedAt: string
  postedAt: string
  rejectReason: string
  remark: string
  postedLedgerBatchId: string
  lines: StockAdjustmentLine[]
}

export type StockAdjustmentListRow = Omit<StockAdjustment, 'lines'> & {
  lineCount: number
  firstSku: string
  totalDiff: number
  sku: string
  bin: string
  before: number
  delta: number
  after: number
}

export type WmsState = {
  warehouses: WmsWarehouse[]
  bins: WmsBin[]
  balances: InventoryBalance[]
  ledger: InventoryLedgerEntry[]
  outbounds: StockOutbound[]
  adjustments: StockAdjustment[]
}

function nowStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function availableOf(onHand: number, reserved: number, qcHold: number, damaged: number) {
  return onHand - reserved - qcHold - damaged
}

function balanceStatus(available: number, threshold: number): '正常' | '低库存' {
  return available <= threshold ? '低库存' : '正常'
}

function balanceId(warehouse: string, bin: string, sku: string) {
  return `${warehouse}-${bin}-${sku}`
}

function skuName(sku: string) {
  if (sku === 'HSY000001001') return 'Oversized Cotton Tee · 黑色 L'
  if (sku === 'HSY000001002') return 'Oversized Cotton Tee · 白色 L'
  if (sku === 'HSY000002001') return 'USB-C Hub 7-in-1 · 标准'
  return sku
}

export const DEMO_WAREHOUSES: WmsWarehouse[] = INITIAL_WAREHOUSES.map((item) => ({
  id: item.code,
  code: item.code,
  name: item.name,
  type: (item.type as WarehouseType) || '自营仓',
  country: item.country,
  timezone: item.timezone,
  currency: item.currency,
  status: item.status === 'active' ? '启用' : '停用',
  address: '福建省厦门市湖里区跨境电商产业园',
  shops: item.shops,
  note: '',
}))

export const DEMO_BINS: WmsBin[] = ERP_DEMO_BINS.map((item, index) => ({
  id: `BIN-${String(index + 1).padStart(4, '0')}`,
  warehouseCode: item.warehouse,
  zoneCode: item.code.split('-')[0] || 'A',
  code: item.code,
  name: `${item.code} 库位`,
  boundSku: item.sku === '—' ? '' : item.sku,
  status: (item.status as BinStatus) || '空闲',
  note: '',
}))

export const DEMO_BALANCES: InventoryBalance[] = ERP_DEMO_INVENTORY.map((item) => {
  const available = availableOf(item.onHand, item.reserved, 0, item.damaged)
  return {
    id: balanceId(item.warehouse, item.bin, item.sku),
    warehouse: item.warehouse,
    bin: item.bin,
    sku: item.sku,
    name: item.name,
    onHand: item.onHand,
    reserved: item.reserved,
    qcHold: 0,
    damaged: item.damaged,
    available,
    inTransit: item.inbound,
    threshold: item.threshold,
    version: 1,
    updatedAt: '2026-10-28 10:00',
    status: balanceStatus(available, item.threshold),
  }
})

export const DEMO_LEDGER: InventoryLedgerEntry[] = [
  {
    id: 'MOV-2026-10012',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-01',
    sku: 'HSY000001001',
    direction: 'in',
    eventType: '采购入库',
    type: '采购入库',
    qty: 98,
    onHandBefore: 0,
    onHandAfter: 98,
    reservedBefore: 0,
    reservedAfter: 0,
    sourceType: 'purchase_receipt',
    sourceId: 'RCV-2026-0041',
    sourceLineId: 'RCVL-2026-0041-01',
    shop: '',
    platform: '',
    externalShopId: '',
    reason: '合格入库上架',
    actor: '兰雨晨',
    idempotencyKey: 'ledger:purchase_stock_in:RCV-2026-0041:HSY000001001',
    occurredAt: '2026-10-26 15:22',
    status: '已记账',
  },
  {
    id: 'MOV-2026-10011',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-01',
    sku: 'HSY000001001',
    direction: 'adjust',
    eventType: '订单锁定',
    type: '订单锁定',
    qty: 8,
    onHandBefore: 98,
    onHandAfter: 98,
    reservedBefore: 0,
    reservedAfter: 8,
    sourceType: 'order',
    sourceId: 'DZ-10021',
    sourceLineId: '',
    shop: 'Daraz LK',
    platform: 'daraz',
    externalShopId: 'dz-lk-88021',
    reason: '订单预留',
    actor: '系统',
    idempotencyKey: 'ledger:order_reserve:DZ-10021:HSY000001001',
    occurredAt: '2026-10-28 08:02',
    status: '已记账',
  },
  {
    id: 'MOV-2026-10010',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-01',
    sku: 'HSY000001001',
    direction: 'adjust',
    eventType: '手工调整',
    type: '盘点差异',
    qty: -44,
    onHandBefore: 98,
    onHandAfter: 54,
    reservedBefore: 8,
    reservedAfter: 8,
    sourceType: 'adjustment',
    sourceId: 'ADJ-2026-OPEN',
    sourceLineId: '',
    shop: '',
    platform: '',
    externalShopId: '',
    reason: '演示期初对齐可用量',
    actor: '系统',
    idempotencyKey: 'ledger:migration:HSY000001001:open',
    occurredAt: '2026-10-28 08:10',
    status: '已记账',
  },
  {
    id: 'MOV-2026-10009',
    warehouse: 'WH-CN-XMN-001',
    bin: 'B-02-01-01',
    sku: 'HSY000002001',
    direction: 'out',
    eventType: '订单出库',
    type: '订单出库',
    qty: 1,
    onHandBefore: 86,
    onHandAfter: 85,
    reservedBefore: 6,
    reservedAfter: 5,
    sourceType: 'order',
    sourceId: 'DZ-10018',
    sourceLineId: '',
    shop: 'Daraz LK',
    platform: 'daraz',
    externalShopId: 'dz-lk-88021',
    reason: '订单发货',
    actor: '系统',
    idempotencyKey: 'ledger:order_ship:DZ-10018:HSY000002001',
    occurredAt: '2026-10-20 10:25',
    status: '已记账',
  },
  {
    id: 'MOV-2026-10008',
    warehouse: 'WH-CN-XMN-001',
    bin: 'A-01-01-02',
    sku: 'HSY000001002',
    direction: 'in',
    eventType: '采购入库',
    type: '采购入库',
    qty: 12,
    onHandBefore: 0,
    onHandAfter: 12,
    reservedBefore: 0,
    reservedAfter: 0,
    sourceType: 'purchase_receipt',
    sourceId: 'RCV-2026-OPEN',
    sourceLineId: '',
    shop: '',
    platform: '',
    externalShopId: '',
    reason: '期初/历史入库投影',
    actor: '系统',
    idempotencyKey: 'ledger:migration:HSY000001002:open',
    occurredAt: '2026-10-20 09:00',
    status: '已记账',
  },
]

export const DEMO_OUTBOUNDS: StockOutbound[] = [
  {
    id: 'OUT-2026-0087',
    outboundNo: 'OUT-2026-0087',
    outboundType: '订单出库',
    warehouse: 'WH-CN-XMN-001',
    order: 'DZ-10021',
    packageId: 'PKG-DZ-10021',
    picker: '兰雨晨',
    status: '待拣货',
    createdAt: '2026-10-28 09:12',
    pickedAt: '',
    checkedAt: '',
    shippedAt: '',
    reason: '',
    remark: 'Lazada 五国共享池拣货',
    idempotencyKey: '',
    lines: [
      {
        id: 'OUTL-2026-0087-01',
        lineNo: 1,
        sku: 'HSY000001001',
        quantity: 2,
        bin: 'A-01-01-01',
        note: '',
      },
    ],
  },
  {
    id: 'OUT-2026-0086',
    outboundNo: 'OUT-2026-0086',
    outboundType: '订单出库',
    warehouse: 'WH-CN-XMN-001',
    order: 'LZ-2201',
    packageId: 'PKG-LZ-2201',
    picker: '兰雨晨',
    status: '拣货中',
    createdAt: '2026-10-28 08:40',
    pickedAt: '2026-10-28 08:55',
    checkedAt: '',
    shippedAt: '',
    reason: '',
    remark: '',
    idempotencyKey: '',
    lines: [
      {
        id: 'OUTL-2026-0086-01',
        lineNo: 1,
        sku: 'HSY000002001',
        quantity: 1,
        bin: 'B-02-01-01',
        note: '',
      },
    ],
  },
  {
    id: 'OUT-2026-0084',
    outboundNo: 'OUT-2026-0084',
    outboundType: '订单出库',
    warehouse: 'WH-CN-XMN-001',
    order: 'DZ-10018',
    packageId: 'PKG-DZ-10018',
    picker: '兰雨晨',
    status: '已出库',
    createdAt: '2026-10-20 10:05',
    pickedAt: '2026-10-20 10:12',
    checkedAt: '2026-10-20 10:18',
    shippedAt: '2026-10-20 10:25',
    reason: '',
    remark: '',
    idempotencyKey: 'ledger:order_ship:OUT-2026-0084',
    lines: [
      {
        id: 'OUTL-2026-0084-01',
        lineNo: 1,
        sku: 'HSY000002001',
        quantity: 1,
        bin: 'B-02-01-01',
        note: '',
      },
    ],
  },
]

export const DEMO_ADJUSTMENTS: StockAdjustment[] = [
  {
    id: 'ADJ-2026-0018',
    adjustmentNo: 'ADJ-2026-0018',
    kind: '盘点',
    warehouse: 'WH-CN-XMN-001',
    status: '待审批',
    reason: '月度盘点差异（示例）',
    applicant: '兰雨晨',
    approver: '',
    createdAt: '2026-10-28 16:00',
    approvedAt: '',
    postedAt: '',
    rejectReason: '',
    remark: '',
    postedLedgerBatchId: '',
    lines: [
      {
        id: 'ADJL-2026-0018-01',
        lineNo: 1,
        sku: 'HSY000001001',
        bin: 'A-01-01-01',
        qtySystem: 46,
        qtyCounted: 45,
        qtyDiff: -1,
        note: '少一件待核',
      },
    ],
  },
  {
    id: 'ADJ-2026-0017',
    adjustmentNo: 'ADJ-2026-0017',
    kind: '报损',
    warehouse: 'WH-CN-XMN-001',
    status: '已过账',
    reason: '运输破损（示例）',
    applicant: '仓库员',
    approver: '杨洁',
    createdAt: '2026-10-27 11:00',
    approvedAt: '2026-10-27 11:20',
    postedAt: '2026-10-27 11:25',
    rejectReason: '',
    remark: '',
    postedLedgerBatchId: 'LEDGER-BATCH-ADJ-0017',
    lines: [
      {
        id: 'ADJL-2026-0017-01',
        lineNo: 1,
        sku: 'HSY000002001',
        bin: 'B-02-01-01',
        qtySystem: 86,
        qtyCounted: 85,
        qtyDiff: -1,
        note: '外箱压损',
      },
    ],
  },
  {
    id: 'ADJ-2026-0015',
    adjustmentNo: 'ADJ-2026-0015',
    kind: '手工入库',
    warehouse: 'WH-CN-XMN-001',
    status: '已驳回',
    reason: '漏记回库（示例）',
    applicant: '兰雨晨',
    approver: '杨洁',
    createdAt: '2026-10-26 09:00',
    approvedAt: '',
    postedAt: '',
    rejectReason: '证据不足，请附盘点照片后重提',
    remark: '',
    postedLedgerBatchId: '',
    lines: [
      {
        id: 'ADJL-2026-0015-01',
        lineNo: 1,
        sku: 'HSY000001001',
        bin: 'A-01-01-01',
        qtySystem: 45,
        qtyCounted: 46,
        qtyDiff: 1,
        note: '',
      },
    ],
  },
]

const INITIAL_STATE: WmsState = {
  warehouses: DEMO_WAREHOUSES,
  bins: DEMO_BINS,
  balances: DEMO_BALANCES,
  ledger: DEMO_LEDGER,
  outbounds: DEMO_OUTBOUNDS,
  adjustments: DEMO_ADJUSTMENTS,
}

const store = createDemoStore<WmsState>('open-shop.console.demo.wms.v1', INITIAL_STATE)

function mutate(updater: (state: WmsState) => WmsState) {
  store.set(updater(store.get()))
}

export function useWmsState() {
  return store.useStore()
}

export function getWmsState() {
  return store.get()
}

export function useWarehouses() {
  return useWmsState().warehouses
}

export function useBins() {
  return useWmsState().bins
}

export function useInventoryBalances() {
  return useWmsState().balances
}

export function useInventoryLedger() {
  return useWmsState().ledger
}

export function useStockOutbounds() {
  return useWmsState().outbounds
}

export function useStockAdjustments() {
  return useWmsState().adjustments
}

export function getWarehouse(codeOrId: string) {
  return store.get().warehouses.find((item) => item.id === codeOrId || item.code === codeOrId)
}

export function getBin(codeOrId: string) {
  return store.get().bins.find((item) => item.id === codeOrId || item.code === codeOrId)
}

export function getBalance(id: string) {
  return store.get().balances.find((item) => item.id === id)
}

export function getLedgerEntry(id: string) {
  return store.get().ledger.find((item) => item.id === id)
}

export function getStockOutbound(id: string) {
  return store.get().outbounds.find((item) => item.id === id || item.outboundNo === id)
}

export function getStockAdjustment(id: string) {
  return store.get().adjustments.find((item) => item.id === id || item.adjustmentNo === id)
}

export function listBinsForWarehouse(warehouseCode: string) {
  return store.get().bins.filter((item) => item.warehouseCode === warehouseCode)
}

export function listBalancesForSku(sku: string) {
  return store.get().balances.filter((item) => item.sku === sku)
}

export function listLedgerForBin(warehouse: string, bin: string) {
  return store
    .get()
    .ledger.filter((item) => item.warehouse === warehouse && item.bin === bin)
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
}

export function toOutboundListRow(outbound: StockOutbound): StockOutboundListRow {
  const first = outbound.lines[0]
  return {
    ...outbound,
    lineCount: outbound.lines.length,
    firstSku: first?.sku ?? '—',
    totalQty: outbound.lines.reduce((sum, line) => sum + line.quantity, 0),
    bin: first?.bin ?? '—',
    sku: first?.sku ?? '—',
    quantity: outbound.lines.reduce((sum, line) => sum + line.quantity, 0),
  }
}

export function toAdjustmentListRow(adjustment: StockAdjustment): StockAdjustmentListRow {
  const first = adjustment.lines[0]
  const totalDiff = adjustment.lines.reduce((sum, line) => sum + line.qtyDiff, 0)
  return {
    ...adjustment,
    lineCount: adjustment.lines.length,
    firstSku: first?.sku ?? '—',
    totalDiff,
    sku: first?.sku ?? '—',
    bin: first?.bin ?? '—',
    before: first?.qtySystem ?? 0,
    delta: totalDiff,
    after: first ? first.qtySystem + first.qtyDiff : 0,
  }
}

export function countOutboundsByStatus(rows: StockOutbound[]) {
  return OUTBOUND_STATUSES.reduce(
    (acc, status) => {
      acc[status] = rows.filter((row) => row.status === status).length
      return acc
    },
    {} as Record<OutboundStatus, number>,
  )
}

export function countAdjustmentsByStatus(rows: StockAdjustment[]) {
  return ADJUSTMENT_STATUSES.reduce(
    (acc, status) => {
      acc[status] = rows.filter((row) => row.status === status).length
      return acc
    },
    {} as Record<AdjustmentStatus, number>,
  )
}

export function countBalancesKpi(rows: InventoryBalance[]) {
  return {
    skuCount: new Set(rows.map((row) => row.sku)).size,
    availableTotal: rows.reduce((sum, row) => sum + row.available, 0),
    reservedTotal: rows.reduce((sum, row) => sum + row.reserved, 0),
    damagedTotal: rows.reduce((sum, row) => sum + row.damaged, 0),
    lowStock: rows.filter((row) => row.status === '低库存').length,
    inTransitTotal: rows.reduce((sum, row) => sum + row.inTransit, 0),
  }
}

function nextSeq(prefix: string, existing: string[], width = 4) {
  const max = existing.reduce((current, id) => {
    const matched = new RegExp(`^${prefix}(\\d+)$`).exec(id)
    return matched ? Math.max(current, Number(matched[1])) : current
  }, 0)
  return `${prefix}${String(max + 1).padStart(width, '0')}`
}

function nextMovId(ledger: InventoryLedgerEntry[]) {
  return nextSeq('MOV-2026-', ledger.map((item) => item.id.replace('MOV-2026-', 'MOV-2026-') && item.id), 5).replace(
    /^MOV-2026-0*/,
    (m) => m,
  )
}

function nextMovementId(ledger: InventoryLedgerEntry[]) {
  const max = ledger.reduce((current, row) => {
    const matched = /^MOV-2026-(\d+)$/.exec(row.id)
    return matched ? Math.max(current, Number(matched[1])) : current
  }, 10012)
  return `MOV-2026-${max + 1}`
}

function nextOutboundNo(outbounds: StockOutbound[]) {
  const max = outbounds.reduce((current, row) => {
    const matched = /^OUT-2026-(\d+)$/.exec(row.outboundNo)
    return matched ? Math.max(current, Number(matched[1])) : current
  }, 87)
  return `OUT-2026-${String(max + 1).padStart(4, '0')}`
}

function nextAdjustmentNo(adjustments: StockAdjustment[]) {
  const max = adjustments.reduce((current, row) => {
    const matched = /^ADJ-2026-(\d+)$/.exec(row.adjustmentNo)
    return matched ? Math.max(current, Number(matched[1])) : current
  }, 18)
  return `ADJ-2026-${String(max + 1).padStart(4, '0')}`
}

function nextBinId(bins: WmsBin[]) {
  const max = bins.reduce((current, row) => {
    const matched = /^BIN-(\d+)$/.exec(row.id)
    return matched ? Math.max(current, Number(matched[1])) : current
  }, 0)
  return `BIN-${String(max + 1).padStart(4, '0')}`
}

function findOrCreateBalance(
  balances: InventoryBalance[],
  warehouse: string,
  bin: string,
  sku: string,
): { balances: InventoryBalance[]; balance: InventoryBalance; index: number } {
  const id = balanceId(warehouse, bin, sku)
  const index = balances.findIndex((item) => item.id === id)
  if (index >= 0) {
    return { balances, balance: balances[index]!, index }
  }
  const created: InventoryBalance = {
    id,
    warehouse,
    bin,
    sku,
    name: skuName(sku),
    onHand: 0,
    reserved: 0,
    qcHold: 0,
    damaged: 0,
    available: 0,
    inTransit: 0,
    threshold: 20,
    version: 1,
    updatedAt: nowStamp(),
    status: '低库存',
  }
  return { balances: [...balances, created], balance: created, index: balances.length }
}

function projectBalance(balance: InventoryBalance): InventoryBalance {
  const available = availableOf(balance.onHand, balance.reserved, balance.qcHold, balance.damaged)
  return {
    ...balance,
    available,
    status: balanceStatus(available, balance.threshold),
    version: balance.version + 1,
    updatedAt: nowStamp(),
  }
}

/**
 * 幂等追加流水并投影余额。
 * 已存在相同 idempotencyKey 则直接返回已有流水（不改余额）。
 */
export function appendLedgerAndProject(input: {
  warehouse: string
  bin: string
  sku: string
  direction: InventoryLedgerEntry['direction']
  eventType: LedgerEventType
  type?: string
  qty: number
  onHandDelta: number
  reservedDelta?: number
  damagedDelta?: number
  sourceType: string
  sourceId: string
  sourceLineId?: string
  shop?: string
  platform?: string
  externalShopId?: string
  reason: string
  actor: string
  idempotencyKey: string
  occurredAt?: string
}): { ok: true; entry: InventoryLedgerEntry; duplicated: boolean } | { ok: false; reason: string } {
  const state = store.get()
  const existing = state.ledger.find((item) => item.idempotencyKey === input.idempotencyKey)
  if (existing) return { ok: true, entry: existing, duplicated: true }

  if (!input.warehouse.trim() || !input.bin.trim() || !input.sku.trim()) {
    return { ok: false, reason: '仓库 / 库位 / SKU 不能为空' }
  }
  if (!Number.isFinite(input.qty) || input.qty === 0) {
    return { ok: false, reason: '变动数量无效' }
  }

  let { balances, balance } = findOrCreateBalance(state.balances, input.warehouse, input.bin, input.sku)
  const onHandBefore = balance.onHand
  const reservedBefore = balance.reserved
  const nextOnHand = onHandBefore + input.onHandDelta
  const nextReserved = reservedBefore + (input.reservedDelta ?? 0)
  const nextDamaged = balance.damaged + (input.damagedDelta ?? 0)
  if (nextOnHand < 0) return { ok: false, reason: '账面库存不足，无法过账' }
  if (nextReserved < 0) return { ok: false, reason: '预留库存不足，无法过账' }
  if (nextDamaged < 0) return { ok: false, reason: '残次库存不足，无法过账' }
  const availableAfter = availableOf(nextOnHand, nextReserved, balance.qcHold, nextDamaged)
  if (availableAfter < 0) return { ok: false, reason: '可用库存不足，无法过账' }

  const entry: InventoryLedgerEntry = {
    id: nextMovementId(state.ledger),
    warehouse: input.warehouse,
    bin: input.bin,
    sku: input.sku,
    direction: input.direction,
    eventType: input.eventType,
    type: input.type || input.eventType,
    qty: Math.abs(input.qty),
    onHandBefore,
    onHandAfter: nextOnHand,
    reservedBefore,
    reservedAfter: nextReserved,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceLineId: input.sourceLineId || '',
    shop: input.shop || '',
    platform: input.platform || '',
    externalShopId: input.externalShopId || '',
    reason: input.reason,
    actor: input.actor || '系统',
    idempotencyKey: input.idempotencyKey,
    occurredAt: input.occurredAt || nowStamp(),
    status: '已记账',
  }

  const projected = projectBalance({
    ...balance,
    onHand: nextOnHand,
    reserved: nextReserved,
    damaged: nextDamaged,
  })

  balances = balances.map((item) => (item.id === projected.id ? projected : item))
  if (!balances.some((item) => item.id === projected.id)) balances = [...balances, projected]

  // R07：有实物占用时绑定 SKU；清空则解绑
  const bins = state.bins.map((bin) => {
    if (bin.warehouseCode !== input.warehouse || bin.code !== input.bin) return bin
    const occupied = projected.onHand + projected.reserved > 0
    if (occupied) {
      if (bin.boundSku && bin.boundSku !== input.sku) {
        return bin
      }
      return {
        ...bin,
        boundSku: input.sku,
        status: bin.status === '停用' ? bin.status : ('占用' as BinStatus),
      }
    }
    return {
      ...bin,
      boundSku: '',
      status: bin.status === '停用' || bin.status === '锁定' ? bin.status : ('空闲' as BinStatus),
    }
  })

  // R07 冲突：库位已绑定其他 SKU 且仍有占用
  const targetBin = state.bins.find((bin) => bin.warehouseCode === input.warehouse && bin.code === input.bin)
  if (
    targetBin?.boundSku &&
    targetBin.boundSku !== input.sku &&
    (targetBin.status === '占用' || targetBin.status === '锁定')
  ) {
    return {
      ok: false,
      reason: `库位 ${input.bin} 已绑定启用 SKU ${targetBin.boundSku}（一库位一启用 SKU）`,
    }
  }

  store.set({
    ...state,
    balances,
    bins,
    ledger: [entry, ...state.ledger],
  })
  return { ok: true, entry, duplicated: false }
}

/** P2 入库上架连续：写采购入库流水并增加 on_hand */
export function applyPurchaseStockIn(input: {
  warehouse: string
  bin: string
  sku: string
  quantity: number
  sourceDoc: string
  sourceLineId?: string
  actor: string
  idempotencyKey: string
  reason?: string
}): { ok: true; entry: InventoryLedgerEntry; duplicated: boolean } | { ok: false; reason: string } {
  return appendLedgerAndProject({
    warehouse: input.warehouse,
    bin: input.bin,
    sku: input.sku,
    direction: 'in',
    eventType: '采购入库',
    type: '采购入库',
    qty: input.quantity,
    onHandDelta: input.quantity,
    sourceType: 'purchase_receipt',
    sourceId: input.sourceDoc,
    sourceLineId: input.sourceLineId,
    reason: input.reason || '采购入库上架',
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
  })
}

/* ───────── 仓库 / 库位 CRUD ───────── */

export function createWarehouse(input: {
  code: string
  name: string
  type?: WarehouseType
  country?: string
  timezone?: string
  currency?: string
  address?: string
  note?: string
}): { ok: true; warehouse: WmsWarehouse } | { ok: false; reason: string } {
  const code = input.code.trim().toUpperCase()
  const name = input.name.trim()
  if (!code) return { ok: false, reason: '仓库编码不能为空' }
  if (!name) return { ok: false, reason: '仓库名称不能为空' }
  const state = store.get()
  if (state.warehouses.some((item) => item.code === code)) {
    return { ok: false, reason: `仓库编码 ${code} 已存在` }
  }
  const warehouse: WmsWarehouse = {
    id: code,
    code,
    name,
    type: input.type || '自营仓',
    country: input.country || 'CN',
    timezone: input.timezone || 'Asia/Shanghai',
    currency: input.currency || 'CNY',
    status: '启用',
    address: input.address?.trim() || '',
    shops: [],
    note: input.note?.trim() || '',
  }
  mutate((current) => ({ ...current, warehouses: [warehouse, ...current.warehouses] }))
  return { ok: true, warehouse }
}

export function updateWarehouse(
  code: string,
  patch: Partial<Pick<WmsWarehouse, 'name' | 'type' | 'address' | 'note' | 'status' | 'timezone' | 'currency'>>,
): { ok: true; warehouse: WmsWarehouse } | { ok: false; reason: string } {
  const state = store.get()
  const current = state.warehouses.find((item) => item.code === code)
  if (!current) return { ok: false, reason: '仓库不存在' }
  if (patch.name !== undefined && !patch.name.trim()) return { ok: false, reason: '仓库名称不能为空' }
  let updated!: WmsWarehouse
  mutate((s) => ({
    ...s,
    warehouses: s.warehouses.map((item) => {
      if (item.code !== code) return item
      updated = {
        ...item,
        ...patch,
        name: patch.name?.trim() ?? item.name,
        address: patch.address !== undefined ? patch.address.trim() : item.address,
        note: patch.note !== undefined ? patch.note.trim() : item.note,
      }
      return updated
    }),
  }))
  return { ok: true, warehouse: updated }
}

export function createBin(input: {
  warehouseCode: string
  code: string
  zoneCode?: string
  name?: string
  boundSku?: string
  status?: BinStatus
  note?: string
}): { ok: true; bin: WmsBin } | { ok: false; reason: string } {
  const warehouseCode = input.warehouseCode.trim()
  const code = input.code.trim().toUpperCase()
  if (!warehouseCode) return { ok: false, reason: '请选择仓库' }
  if (!code) return { ok: false, reason: '库位编码不能为空' }
  const state = store.get()
  if (!state.warehouses.some((item) => item.code === warehouseCode && item.status === '启用')) {
    return { ok: false, reason: '仓库不存在或已停用' }
  }
  if (state.bins.some((item) => item.warehouseCode === warehouseCode && item.code === code)) {
    return { ok: false, reason: `同仓库库位编码 ${code} 已存在` }
  }
  const boundSku = input.boundSku?.trim() && input.boundSku !== '不绑定' ? input.boundSku.trim() : ''
  if (boundSku) {
    const conflict = state.bins.find(
      (item) =>
        item.warehouseCode === warehouseCode &&
        item.boundSku === boundSku &&
        (item.status === '占用' || item.status === '锁定'),
    )
    if (conflict) {
      return { ok: false, reason: `SKU ${boundSku} 已绑定库位 ${conflict.code}` }
    }
  }
  const bin: WmsBin = {
    id: nextBinId(state.bins),
    warehouseCode,
    zoneCode: (input.zoneCode || code.split('-')[0] || 'A').toUpperCase(),
    code,
    name: input.name?.trim() || `${code} 库位`,
    boundSku,
    status: input.status || (boundSku ? '占用' : '空闲'),
    note: input.note?.trim() || '',
  }
  mutate((current) => ({ ...current, bins: [bin, ...current.bins] }))
  return { ok: true, bin }
}

export function updateBin(
  id: string,
  patch: Partial<Pick<WmsBin, 'name' | 'zoneCode' | 'boundSku' | 'status' | 'note'>>,
): { ok: true; bin: WmsBin } | { ok: false; reason: string } {
  const state = store.get()
  const current = state.bins.find((item) => item.id === id || item.code === id)
  if (!current) return { ok: false, reason: '库位不存在' }
  const nextSku =
    patch.boundSku !== undefined
      ? patch.boundSku.trim() === '不绑定'
        ? ''
        : patch.boundSku.trim()
      : current.boundSku
  if (nextSku && nextSku !== current.boundSku) {
    const conflict = state.bins.find(
      (item) =>
        item.id !== current.id &&
        item.warehouseCode === current.warehouseCode &&
        item.boundSku === nextSku &&
        (item.status === '占用' || item.status === '锁定'),
    )
    if (conflict) return { ok: false, reason: `SKU ${nextSku} 已绑定库位 ${conflict.code}` }
  }
  let updated!: WmsBin
  mutate((s) => ({
    ...s,
    bins: s.bins.map((item) => {
      if (item.id !== current.id) return item
      updated = {
        ...item,
        name: patch.name?.trim() || item.name,
        zoneCode: patch.zoneCode?.trim().toUpperCase() || item.zoneCode,
        boundSku: nextSku,
        status: patch.status || (nextSku ? (item.status === '空闲' ? '占用' : item.status) : item.status === '占用' ? '空闲' : item.status),
        note: patch.note !== undefined ? patch.note.trim() : item.note,
      }
      return updated
    }),
  }))
  return { ok: true, bin: updated }
}

/* ───────── 出库单状态机 ───────── */

export function createStockOutbound(input: {
  outboundType: OutboundType
  warehouse: string
  order: string
  packageId?: string
  picker?: string
  reason?: string
  remark?: string
  lines: Array<{ sku: string; quantity: number; bin: string; note?: string }>
}): { ok: true; outbound: StockOutbound } | { ok: false; reason: string } {
  if (!input.order.trim()) return { ok: false, reason: '请填写关联订单 / 来源单号' }
  if (!input.warehouse.trim()) return { ok: false, reason: '请选择仓库' }
  if (!input.lines.length) return { ok: false, reason: '请至少添加一行明细' }
  for (const line of input.lines) {
    if (!line.sku.trim()) return { ok: false, reason: '明细 SKU 不能为空' }
    if (!line.bin.trim()) return { ok: false, reason: '明细库位不能为空' }
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) return { ok: false, reason: '明细数量必须大于 0' }
  }
  const state = store.get()
  const outboundNo = nextOutboundNo(state.outbounds)
  const outbound: StockOutbound = {
    id: outboundNo,
    outboundNo,
    outboundType: input.outboundType,
    warehouse: input.warehouse,
    order: input.order.trim(),
    packageId: input.packageId?.trim() || `PKG-${input.order.trim()}`,
    picker: input.picker?.trim() || '当前用户',
    status: '待拣货',
    createdAt: nowStamp(),
    pickedAt: '',
    checkedAt: '',
    shippedAt: '',
    reason: input.reason?.trim() || '',
    remark: input.remark?.trim() || '',
    idempotencyKey: '',
    lines: input.lines.map((line, index) => ({
      id: `${outboundNo}-L${String(index + 1).padStart(2, '0')}`,
      lineNo: index + 1,
      sku: line.sku,
      quantity: Math.floor(line.quantity),
      bin: line.bin,
      note: line.note?.trim() || '',
    })),
  }
  mutate((current) => ({ ...current, outbounds: [outbound, ...current.outbounds] }))
  return { ok: true, outbound }
}

export function advanceStockOutbound(
  id: string,
): { ok: true; outbound: StockOutbound } | { ok: false; reason: string } {
  const state = store.get()
  const current = state.outbounds.find((item) => item.id === id)
  if (!current) return { ok: false, reason: '出库单不存在' }
  if (current.status === '已出库') return { ok: false, reason: '已出库，不可再推进' }
  if (current.status === '已取消') return { ok: false, reason: '已取消，不可推进' }

  const nextStatus: OutboundStatus =
    current.status === '待拣货'
      ? '拣货中'
      : current.status === '拣货中'
        ? '已复核'
        : '已出库'

  if (nextStatus === '已出库') {
    return postStockOutbound(id)
  }

  let updated!: StockOutbound
  mutate((s) => ({
    ...s,
    outbounds: s.outbounds.map((item) => {
      if (item.id !== id) return item
      updated = {
        ...item,
        status: nextStatus,
        pickedAt: nextStatus === '拣货中' ? nowStamp() : item.pickedAt,
        checkedAt: nextStatus === '已复核' ? nowStamp() : item.checkedAt,
      }
      return updated
    }),
  }))
  return { ok: true, outbound: updated }
}

export function postStockOutbound(
  id: string,
): { ok: true; outbound: StockOutbound } | { ok: false; reason: string } {
  const state = store.get()
  const current = state.outbounds.find((item) => item.id === id)
  if (!current) return { ok: false, reason: '出库单不存在' }
  if (current.status === '已出库') return { ok: false, reason: '已出库（幂等）' }
  if (current.status === '已取消') return { ok: false, reason: '已取消，不可出库' }
  if (current.status !== '已复核' && current.status !== '拣货中' && current.status !== '待拣货') {
    return { ok: false, reason: '当前状态不可出库过账' }
  }

  const batchKey = `ledger:order_ship:${current.outboundNo}`
  for (const line of current.lines) {
    const result = appendLedgerAndProject({
      warehouse: current.warehouse,
      bin: line.bin,
      sku: line.sku,
      direction: 'out',
      eventType: '订单出库',
      type: current.outboundType,
      qty: line.quantity,
      onHandDelta: -line.quantity,
      reservedDelta: -Math.min(line.quantity, getBalance(balanceId(current.warehouse, line.bin, line.sku))?.reserved ?? 0),
      sourceType: 'order',
      sourceId: current.order || current.outboundNo,
      sourceLineId: line.id,
      reason: current.reason || `${current.outboundType}过账`,
      actor: current.picker || '系统',
      idempotencyKey: `${batchKey}:${line.sku}:${line.bin}`,
    })
    if (!result.ok) return result
  }

  let updated!: StockOutbound
  mutate((s) => ({
    ...s,
    outbounds: s.outbounds.map((item) => {
      if (item.id !== id) return item
      updated = {
        ...item,
        status: '已出库',
        pickedAt: item.pickedAt || nowStamp(),
        checkedAt: item.checkedAt || nowStamp(),
        shippedAt: nowStamp(),
        idempotencyKey: batchKey,
      }
      return updated
    }),
  }))
  return { ok: true, outbound: updated }
}

export function cancelStockOutbound(
  id: string,
  reason?: string,
): { ok: true; outbound: StockOutbound } | { ok: false; reason: string } {
  const state = store.get()
  const current = state.outbounds.find((item) => item.id === id)
  if (!current) return { ok: false, reason: '出库单不存在' }
  if (current.status === '已出库') return { ok: false, reason: '已出库不可取消，请走库存调整冲正' }
  if (current.status === '已取消') return { ok: false, reason: '出库单已取消' }
  let updated!: StockOutbound
  mutate((s) => ({
    ...s,
    outbounds: s.outbounds.map((item) => {
      if (item.id !== id) return item
      updated = {
        ...item,
        status: '已取消',
        remark: reason?.trim()
          ? `${item.remark ? item.remark + '；' : ''}取消原因：${reason.trim()}`
          : item.remark,
      }
      return updated
    }),
  }))
  return { ok: true, outbound: updated }
}

/* ───────── 调整单状态机 ───────── */

export function createStockAdjustment(input: {
  kind: AdjustmentKind
  warehouse: string
  reason: string
  applicant?: string
  remark?: string
  lines: Array<{
    sku: string
    bin: string
    qtySystem?: number
    qtyCounted: number
    note?: string
  }>
  submit?: boolean
}): { ok: true; adjustment: StockAdjustment } | { ok: false; reason: string } {
  if (!input.warehouse.trim()) return { ok: false, reason: '请选择仓库' }
  if (!input.reason.trim()) return { ok: false, reason: '调整原因必填' }
  if (!input.lines.length) return { ok: false, reason: '请至少添加一行明细' }

  const state = store.get()
  const lines: StockAdjustmentLine[] = []
  for (let index = 0; index < input.lines.length; index++) {
    const line = input.lines[index]!
    if (!line.sku.trim()) return { ok: false, reason: '明细 SKU 不能为空' }
    if (!line.bin.trim()) return { ok: false, reason: '明细库位不能为空' }
    if (!Number.isFinite(line.qtyCounted)) return { ok: false, reason: '实盘数量无效' }
    const balance = state.balances.find(
      (item) => item.warehouse === input.warehouse && item.bin === line.bin && item.sku === line.sku,
    )
    const qtySystem = line.qtySystem ?? balance?.onHand ?? 0
    lines.push({
      id: `ADJL-TMP-${index + 1}`,
      lineNo: index + 1,
      sku: line.sku,
      bin: line.bin,
      qtySystem,
      qtyCounted: Math.floor(line.qtyCounted),
      qtyDiff: Math.floor(line.qtyCounted) - qtySystem,
      note: line.note?.trim() || '',
    })
  }

  const adjustmentNo = nextAdjustmentNo(state.adjustments)
  const adjustment: StockAdjustment = {
    id: adjustmentNo,
    adjustmentNo,
    kind: input.kind,
    warehouse: input.warehouse,
    status: input.submit ? '待审批' : '草稿',
    reason: input.reason.trim(),
    applicant: input.applicant?.trim() || '当前用户',
    approver: '',
    createdAt: nowStamp(),
    approvedAt: '',
    postedAt: '',
    rejectReason: '',
    remark: input.remark?.trim() || '',
    postedLedgerBatchId: '',
    lines: lines.map((line, index) => ({
      ...line,
      id: `${adjustmentNo}-L${String(index + 1).padStart(2, '0')}`,
    })),
  }
  mutate((current) => ({ ...current, adjustments: [adjustment, ...current.adjustments] }))
  return { ok: true, adjustment }
}

export function submitStockAdjustment(
  id: string,
): { ok: true; adjustment: StockAdjustment } | { ok: false; reason: string } {
  const current = getStockAdjustment(id)
  if (!current) return { ok: false, reason: '调整单不存在' }
  if (current.status !== '草稿') return { ok: false, reason: '仅草稿可提交审批' }
  if (!current.reason.trim()) return { ok: false, reason: '调整原因必填' }
  if (!current.lines.length) return { ok: false, reason: '明细不能为空' }
  let updated!: StockAdjustment
  mutate((s) => ({
    ...s,
    adjustments: s.adjustments.map((item) => {
      if (item.id !== current.id) return item
      updated = { ...item, status: '待审批' }
      return updated
    }),
  }))
  return { ok: true, adjustment: updated }
}

export function approveStockAdjustment(
  id: string,
  approver?: string,
): { ok: true; adjustment: StockAdjustment } | { ok: false; reason: string } {
  const current = getStockAdjustment(id)
  if (!current) return { ok: false, reason: '调整单不存在' }
  if (current.status !== '待审批') return { ok: false, reason: '仅待审批可批准' }
  let updated!: StockAdjustment
  mutate((s) => ({
    ...s,
    adjustments: s.adjustments.map((item) => {
      if (item.id !== current.id) return item
      updated = {
        ...item,
        status: '已通过',
        approver: approver?.trim() || '杨洁',
        approvedAt: nowStamp(),
      }
      return updated
    }),
  }))
  return { ok: true, adjustment: updated }
}

export function rejectStockAdjustment(
  id: string,
  rejectReason: string,
  approver?: string,
): { ok: true; adjustment: StockAdjustment } | { ok: false; reason: string } {
  const current = getStockAdjustment(id)
  if (!current) return { ok: false, reason: '调整单不存在' }
  if (current.status !== '待审批') return { ok: false, reason: '仅待审批可驳回' }
  if (!rejectReason.trim()) return { ok: false, reason: '请填写驳回原因' }
  let updated!: StockAdjustment
  mutate((s) => ({
    ...s,
    adjustments: s.adjustments.map((item) => {
      if (item.id !== current.id) return item
      updated = {
        ...item,
        status: '已驳回',
        approver: approver?.trim() || '杨洁',
        rejectReason: rejectReason.trim(),
        approvedAt: nowStamp(),
      }
      return updated
    }),
  }))
  return { ok: true, adjustment: updated }
}

export function postStockAdjustment(
  id: string,
): { ok: true; adjustment: StockAdjustment } | { ok: false; reason: string } {
  const current = getStockAdjustment(id)
  if (!current) return { ok: false, reason: '调整单不存在' }
  if (current.status === '已过账') return { ok: false, reason: '已过账（幂等）' }
  if (current.status !== '已通过') return { ok: false, reason: '仅「已通过」可过账写流水' }

  const batchId = `LEDGER-BATCH-${current.adjustmentNo}`
  for (const line of current.lines) {
    if (line.qtyDiff === 0) continue
    const eventType: LedgerEventType = current.kind === '盘点' || current.kind === '复盘' ? '盘点差异' : '手工调整'
    const result = appendLedgerAndProject({
      warehouse: current.warehouse,
      bin: line.bin,
      sku: line.sku,
      direction: 'adjust',
      eventType,
      type: current.kind,
      qty: Math.abs(line.qtyDiff),
      onHandDelta: line.qtyDiff,
      sourceType: 'adjustment',
      sourceId: current.adjustmentNo,
      sourceLineId: line.id,
      reason: current.reason,
      actor: current.approver || current.applicant,
      idempotencyKey: `ledger:adjustment:${current.adjustmentNo}:${line.sku}:${line.bin}`,
    })
    if (!result.ok) return result
  }

  let updated!: StockAdjustment
  mutate((s) => ({
    ...s,
    adjustments: s.adjustments.map((item) => {
      if (item.id !== current.id) return item
      updated = {
        ...item,
        status: '已过账',
        postedAt: nowStamp(),
        postedLedgerBatchId: batchId,
      }
      return updated
    }),
  }))
  return { ok: true, adjustment: updated }
}

export function cancelStockAdjustment(
  id: string,
): { ok: true; adjustment: StockAdjustment } | { ok: false; reason: string } {
  const current = getStockAdjustment(id)
  if (!current) return { ok: false, reason: '调整单不存在' }
  if (current.status === '已过账') return { ok: false, reason: '已过账不可取消' }
  if (current.status === '已取消') return { ok: false, reason: '调整单已取消' }
  let updated!: StockAdjustment
  mutate((s) => ({
    ...s,
    adjustments: s.adjustments.map((item) => {
      if (item.id !== current.id) return item
      updated = { ...item, status: '已取消' }
      return updated
    }),
  }))
  return { ok: true, adjustment: updated }
}

/** 兼容 related-info / 旧列表字段 */
export function toRelatedOutboundShape(outbound: StockOutbound) {
  const first = outbound.lines[0]
  return {
    id: outbound.outboundNo,
    order: outbound.order,
    packageId: outbound.packageId,
    sku: first?.sku ?? '—',
    quantity: outbound.lines.reduce((sum, line) => sum + line.quantity, 0),
    bin: first?.bin ?? '—',
    picker: outbound.picker,
    at: outbound.shippedAt || outbound.createdAt,
    status: outbound.status,
    warehouse: outbound.warehouse,
    outboundType: outbound.outboundType,
  }
}

export function toRelatedAdjustmentShape(adjustment: StockAdjustment) {
  const first = adjustment.lines[0]
  const delta = adjustment.lines.reduce((sum, line) => sum + line.qtyDiff, 0)
  return {
    id: adjustment.adjustmentNo,
    type: adjustment.kind,
    sku: first?.sku ?? '—',
    warehouse: adjustment.warehouse,
    bin: first?.bin ?? '—',
    before: first?.qtySystem ?? 0,
    delta,
    after: first ? first.qtySystem + first.qtyDiff : 0,
    reason: adjustment.reason,
    applicant: adjustment.applicant,
    status: adjustment.status,
  }
}

export function toRelatedBalanceShape(balance: InventoryBalance) {
  return {
    id: balance.id,
    sku: balance.sku,
    name: balance.name,
    warehouse: balance.warehouse,
    bin: balance.bin,
    onHand: balance.onHand,
    reserved: balance.reserved,
    damaged: balance.damaged,
    available: balance.available,
    inTransit: balance.inTransit,
    threshold: balance.threshold,
    status: balance.status,
  }
}

export function toRelatedLedgerShape(entry: InventoryLedgerEntry) {
  return {
    id: entry.id,
    sku: entry.sku,
    warehouse: entry.warehouse,
    bin: entry.bin,
    type: entry.type,
    before: entry.onHandBefore,
    delta: entry.onHandAfter - entry.onHandBefore || entry.reservedAfter - entry.reservedBefore,
    after: entry.onHandAfter,
    source: entry.sourceId,
    shop: entry.shop || '—',
    platform: entry.platform || '—',
    externalShopId: entry.externalShopId || '—',
    reason: entry.reason,
    actor: entry.actor,
    at: entry.occurredAt,
    status: entry.status,
  }
}

export function toRelatedBinShape(bin: WmsBin) {
  return {
    warehouse: bin.warehouseCode,
    code: bin.code,
    sku: bin.boundSku || '—',
    status: bin.status,
    zoneCode: bin.zoneCode,
    name: bin.name,
    id: bin.id,
  }
}

// silence unused helper warning in some bundlers
void nextSeq
void nextMovId

/* ───────── P4 售后回库 / 报损（写流水，禁止直改余额） ───────── */

/** 售后合格回库：增加 on_hand，event_type=售后回库 */
export function applyAftersaleRestock(input: {
  warehouse: string
  bin: string
  sku: string
  quantity: number
  sourceDoc: string
  sourceLineId?: string
  actor: string
  idempotencyKey: string
  reason?: string
}): { ok: true; entry: InventoryLedgerEntry; duplicated: boolean } | { ok: false; reason: string } {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, reason: '回库数量必须为正整数' }
  }
  return appendLedgerAndProject({
    warehouse: input.warehouse,
    bin: input.bin,
    sku: input.sku,
    direction: 'in',
    eventType: '售后回库',
    type: '售后回库',
    qty: input.quantity,
    onHandDelta: input.quantity,
    sourceType: 'aftersale_return',
    sourceId: input.sourceDoc,
    sourceLineId: input.sourceLineId,
    reason: input.reason || '售后质检合格回库',
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
  })
}

/** 售后残次报损：增加 damaged（不增加可用），event_type=质检报损 */
export function applyAftersaleScrap(input: {
  warehouse: string
  bin: string
  sku: string
  quantity: number
  sourceDoc: string
  sourceLineId?: string
  actor: string
  idempotencyKey: string
  reason?: string
}): { ok: true; entry: InventoryLedgerEntry; duplicated: boolean } | { ok: false; reason: string } {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, reason: '报损数量必须为正整数' }
  }
  return appendLedgerAndProject({
    warehouse: input.warehouse,
    bin: input.bin,
    sku: input.sku,
    direction: 'adjust',
    eventType: '质检报损',
    type: '质检报损',
    qty: input.quantity,
    onHandDelta: 0,
    damagedDelta: input.quantity,
    sourceType: 'aftersale_return',
    sourceId: input.sourceDoc,
    sourceLineId: input.sourceLineId,
    reason: input.reason || '售后质检残次报损',
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
  })
}

/** 订单确认占库：增加 reserved，event_type=订单锁定；不改 on_hand */
export function applyOrderReserve(input: {
  warehouse: string
  bin: string
  sku: string
  quantity: number
  sourceDoc: string
  sourceLineId?: string
  shop?: string
  platform?: string
  externalShopId?: string
  actor: string
  idempotencyKey: string
  reason?: string
}): { ok: true; entry: InventoryLedgerEntry; duplicated: boolean } | { ok: false; reason: string } {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, reason: '占库数量必须为正整数' }
  }
  return appendLedgerAndProject({
    warehouse: input.warehouse,
    bin: input.bin,
    sku: input.sku,
    direction: 'adjust',
    eventType: '订单锁定',
    type: '订单锁定',
    qty: input.quantity,
    onHandDelta: 0,
    reservedDelta: input.quantity,
    sourceType: 'order',
    sourceId: input.sourceDoc,
    sourceLineId: input.sourceLineId,
    shop: input.shop,
    platform: input.platform,
    externalShopId: input.externalShopId,
    reason: input.reason || '订单确认占库',
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
  })
}

/** 取消订单释放预留：扣减 reserved，event_type=订单释放 */
export function applyOrderReleaseReserved(input: {
  warehouse: string
  bin: string
  sku: string
  quantity: number
  sourceDoc: string
  actor: string
  idempotencyKey: string
  reason?: string
}): { ok: true; entry: InventoryLedgerEntry; duplicated: boolean } | { ok: false; reason: string } {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, reason: '释放数量必须为正整数' }
  }
  return appendLedgerAndProject({
    warehouse: input.warehouse,
    bin: input.bin,
    sku: input.sku,
    direction: 'adjust',
    eventType: '订单释放',
    type: '订单释放',
    qty: input.quantity,
    onHandDelta: 0,
    reservedDelta: -input.quantity,
    sourceType: 'aftersale',
    sourceId: input.sourceDoc,
    reason: input.reason || '取消订单释放锁定库存',
    actor: input.actor,
    idempotencyKey: input.idempotencyKey,
  })
}
