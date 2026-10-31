'use client'

/**
 * 采购收货 → 质检 → 入库上架 原型会话 store。
 * 字段对齐 docs/design/haoshiyun-erp-database-schema.md：
 *   purchase_receipts + purchase_receipt_lines
 *   qc_inspections（结果投影到收货行）
 *   inventory_ledger 触发面：stock inbounds（采购入库）
 * 状态机：
 *   收货单 draft → qc_pending → completed / cancelled
 *   入库单 pending_shelve → shelved / cancelled
 * 与 purchase-order-store 联动回写 qty_received / qty_qc_passed / qty_stocked。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'
import {
  applyPurchaseOrderReceiveProjection,
  getPurchaseOrder,
  type PurchaseOrder,
  type PurchaseOrderLine,
} from '@/lib/crossborder/purchase-order-store'
import { applyPurchaseStockIn } from '@/lib/crossborder/wms-store'

/** 对应 purchase_receipts.status */
export const PURCHASE_RECEIPT_STATUSES = ['草稿', '待质检', '已完成', '已取消'] as const
export type PurchaseReceiptStatus = (typeof PURCHASE_RECEIPT_STATUSES)[number]

/** 对应 stock inbound / 上架单据状态（由 qty_passed 生成） */
export const STOCK_INBOUND_STATUSES = ['待上架', '已上架', '已取消'] as const
export type StockInboundStatus = (typeof STOCK_INBOUND_STATUSES)[number]

export const STOCK_INBOUND_SOURCE_TYPES = ['采购入库', '售后回库', '盘盈入库', '调拨入库'] as const
export type StockInboundSourceType = (typeof STOCK_INBOUND_SOURCE_TYPES)[number]

export const BIN_OPTIONS = ['A-01-01-01', 'A-01-01-02', 'B-02-01-01', 'C-01-01-01'] as const

/** 对应 purchase_receipt_lines */
export type PurchaseReceiptLine = {
  id: string
  lineNo: number
  /** po_line_id */
  poLineId: string
  /** variant_id */
  sku: string
  qtyOrdered: number
  qtyArrived: number
  qtyPendingQc: number
  qtyPassed: number
  qtyFailed: number
  note: string
  /** 建议上架库位（质检时确认） */
  suggestedBin: string
}

/** 对应 purchase_receipts（主信息）+ 质检投影 */
export type PurchaseReceipt = {
  id: string
  receiptNo: string
  /** purchase_order_id */
  purchaseOrderId: string
  /** 冗余展示：供应商 / 仓库 */
  supplier: string
  warehouse: string
  status: PurchaseReceiptStatus
  arrivedAt: string
  receivedBy: string
  deliveryNote: string
  remark: string
  /** qc_inspections.qc_no */
  qcNo: string
  qcInspector: string
  qcCompletedAt: string
  lines: PurchaseReceiptLine[]
  /** 本收货生成的入库单号 */
  inboundIds: string[]
}

export type PurchaseReceiptListRow = Omit<PurchaseReceipt, 'lines' | 'inboundIds'> & {
  lineCount: number
  firstSku: string
  totalArrived: number
  totalPassed: number
  totalFailed: number
  inboundCount: number
}

/** 入库上架单（采购入库为主；可含售后等来源） */
export type StockInbound = {
  id: string
  inboundNo: string
  sourceType: StockInboundSourceType
  /** source_id：收货单 / 售后单等 */
  sourceDoc: string
  purchaseOrderId: string
  warehouse: string
  sku: string
  quantity: number
  qcResult: string
  bin: string
  operator: string
  at: string
  status: StockInboundStatus
  /** inventory_ledger.idempotency_key */
  idempotencyKey: string
  remark: string
}

export type StockInboundListRow = StockInbound

export const DEMO_PURCHASE_RECEIPTS: PurchaseReceipt[] = [
  {
    id: 'RCV-2026-0045',
    receiptNo: 'RCV-2026-0045',
    purchaseOrderId: 'PO-2026-0031',
    supplier: '泉州联创数码配件厂',
    warehouse: 'WH-CN-XMN-001',
    status: '待质检',
    arrivedAt: '2026-10-29 09:20',
    receivedBy: '兰雨晨',
    deliveryNote: 'DN-LC-1102',
    remark: '整批到齐，待开箱质检',
    qcNo: '',
    qcInspector: '',
    qcCompletedAt: '',
    inboundIds: [],
    lines: [
      {
        id: 'RCVL-2026-0045-01',
        lineNo: 1,
        poLineId: 'POL-2026-0031-01',
        sku: 'HSY000002001',
        qtyOrdered: 50,
        qtyArrived: 50,
        qtyPendingQc: 50,
        qtyPassed: 0,
        qtyFailed: 0,
        note: '',
        suggestedBin: 'B-02-01-01',
      },
    ],
  },
  {
    id: 'RCV-2026-0044',
    receiptNo: 'RCV-2026-0044',
    purchaseOrderId: 'PO-2026-0030',
    supplier: '厦门优品服饰有限公司',
    warehouse: 'WH-CN-XMN-001',
    status: '已完成',
    arrivedAt: '2026-10-28 09:40',
    receivedBy: '兰雨晨',
    deliveryNote: 'DN-YP-8841',
    remark: '分批到货第一批；短少 2 件已记备注',
    qcNo: 'QC-2026-0044',
    qcInspector: '兰雨晨',
    qcCompletedAt: '2026-10-28 10:00',
    inboundIds: ['IN-2026-0053'],
    lines: [
      {
        id: 'RCVL-2026-0044-01',
        lineNo: 1,
        poLineId: 'POL-2026-0030-01',
        sku: 'HSY000001002',
        qtyOrdered: 80,
        qtyArrived: 40,
        qtyPendingQc: 0,
        qtyPassed: 32,
        qtyFailed: 6,
        note: '短少 2；残次 6 待退供应商',
        suggestedBin: 'A-01-01-02',
      },
    ],
  },
  {
    id: 'RCV-2026-0041',
    receiptNo: 'RCV-2026-0041',
    purchaseOrderId: 'PO-2026-0028',
    supplier: '厦门优品服饰有限公司',
    warehouse: 'WH-CN-XMN-001',
    status: '已完成',
    arrivedAt: '2026-10-26 14:10',
    receivedBy: '兰雨晨',
    deliveryNote: 'DN-YP-8710',
    remark: '',
    qcNo: 'QC-2026-0041',
    qcInspector: '兰雨晨',
    qcCompletedAt: '2026-10-26 15:05',
    inboundIds: ['IN-2026-0052'],
    lines: [
      {
        id: 'RCVL-2026-0041-01',
        lineNo: 1,
        poLineId: 'POL-2026-0028-01',
        sku: 'HSY000001001',
        qtyOrdered: 100,
        qtyArrived: 100,
        qtyPendingQc: 0,
        qtyPassed: 98,
        qtyFailed: 2,
        note: '残次 2 入不可售',
        suggestedBin: 'A-01-01-01',
      },
    ],
  },
]

export const DEMO_STOCK_INBOUNDS: StockInbound[] = [
  {
    id: 'IN-2026-0052',
    inboundNo: 'IN-2026-0052',
    sourceType: '采购入库',
    sourceDoc: 'RCV-2026-0041',
    purchaseOrderId: 'PO-2026-0028',
    warehouse: 'WH-CN-XMN-001',
    sku: 'HSY000001001',
    quantity: 98,
    qcResult: '合格 98 / 残次 2',
    bin: 'A-01-01-01',
    operator: '兰雨晨',
    at: '2026-10-26 15:20',
    status: '已上架',
    idempotencyKey: 'ledger:purchase_stock_in:RCV-2026-0041:HSY000001001',
    remark: '',
  },
  {
    id: 'IN-2026-0053',
    inboundNo: 'IN-2026-0053',
    sourceType: '采购入库',
    sourceDoc: 'RCV-2026-0044',
    purchaseOrderId: 'PO-2026-0030',
    warehouse: 'WH-CN-XMN-001',
    sku: 'HSY000001002',
    quantity: 32,
    qcResult: '合格 32 / 残次 6',
    bin: 'A-01-01-02',
    operator: '兰雨晨',
    at: '2026-10-28 10:05',
    status: '待上架',
    idempotencyKey: 'ledger:purchase_stock_in:RCV-2026-0044:HSY000001002',
    remark: '',
  },
  {
    id: 'IN-2026-0054',
    inboundNo: 'IN-2026-0054',
    sourceType: '售后回库',
    sourceDoc: 'AS-2026-0081',
    purchaseOrderId: '',
    warehouse: 'WH-CN-XMN-001',
    sku: 'HSY000002001',
    quantity: 1,
    qcResult: '质检合格可售 1',
    bin: 'B-02-01-01',
    operator: '仓库员',
    at: '2026-10-28 11:40',
    status: '待上架',
    idempotencyKey: 'ledger:return_stock_in:AS-2026-0081:HSY000002001',
    remark: '',
  },
]

const receiptStore = createDemoStore<PurchaseReceipt[]>(
  'open-shop.console.demo.purchase-receipts.v1',
  DEMO_PURCHASE_RECEIPTS,
)

const inboundStore = createDemoStore<StockInbound[]>(
  'open-shop.console.demo.stock-inbounds.v1',
  DEMO_STOCK_INBOUNDS,
)

export function usePurchaseReceipts() {
  return receiptStore.useStore()
}

export function useStockInbounds() {
  return inboundStore.useStore()
}

export function getPurchaseReceipt(id: string): PurchaseReceipt | undefined {
  return receiptStore.get().find((row) => row.id === id)
}

export function getStockInbound(id: string): StockInbound | undefined {
  return inboundStore.get().find((row) => row.id === id)
}

export function listReceiptsForPo(poId: string): PurchaseReceipt[] {
  return receiptStore.get().filter((row) => row.purchaseOrderId === poId)
}

export function listInboundsForReceipt(receiptId: string): StockInbound[] {
  return inboundStore.get().filter((row) => row.sourceDoc === receiptId)
}

export function toReceiptListRow(receipt: PurchaseReceipt): PurchaseReceiptListRow {
  return {
    id: receipt.id,
    receiptNo: receipt.receiptNo,
    purchaseOrderId: receipt.purchaseOrderId,
    supplier: receipt.supplier,
    warehouse: receipt.warehouse,
    status: receipt.status,
    arrivedAt: receipt.arrivedAt,
    receivedBy: receipt.receivedBy,
    deliveryNote: receipt.deliveryNote,
    remark: receipt.remark,
    qcNo: receipt.qcNo,
    qcInspector: receipt.qcInspector,
    qcCompletedAt: receipt.qcCompletedAt,
    lineCount: receipt.lines.length,
    firstSku: receipt.lines[0]?.sku ?? '—',
    totalArrived: receipt.lines.reduce((sum, line) => sum + line.qtyArrived, 0),
    totalPassed: receipt.lines.reduce((sum, line) => sum + line.qtyPassed, 0),
    totalFailed: receipt.lines.reduce((sum, line) => sum + line.qtyFailed, 0),
    inboundCount: receipt.inboundIds.length,
  }
}

export function countReceiptsByStatus(receipts: PurchaseReceipt[]) {
  const counts: Record<PurchaseReceiptStatus, number> = {
    草稿: 0,
    待质检: 0,
    已完成: 0,
    已取消: 0,
  }
  for (const receipt of receipts) {
    counts[receipt.status] = (counts[receipt.status] ?? 0) + 1
  }
  return counts
}

export function countInboundsByStatus(inbounds: StockInbound[]) {
  const counts: Record<StockInboundStatus, number> = {
    待上架: 0,
    已上架: 0,
    已取消: 0,
  }
  for (const inbound of inbounds) {
    counts[inbound.status] = (counts[inbound.status] ?? 0) + 1
  }
  return counts
}

function nextReceiptNo(receipts: PurchaseReceipt[]) {
  const max = receipts.reduce((current, receipt) => {
    const matched = /^RCV-(\d{4})-(\d+)$/.exec(receipt.receiptNo)
    return matched ? Math.max(current, Number(matched[2])) : current
  }, 0)
  return `RCV-2026-${String(max + 1).padStart(4, '0')}`
}

function nextInboundNo(inbounds: StockInbound[]) {
  const max = inbounds.reduce((current, inbound) => {
    const matched = /^IN-(\d{4})-(\d+)$/.exec(inbound.inboundNo)
    return matched ? Math.max(current, Number(matched[2])) : current
  }, 0)
  return `IN-2026-${String(max + 1).padStart(4, '0')}`
}

function nextQcNo(receipts: PurchaseReceipt[]) {
  const max = receipts.reduce((current, receipt) => {
    const matched = /^QC-(\d{4})-(\d+)$/.exec(receipt.qcNo)
    return matched ? Math.max(current, Number(matched[2])) : current
  }, 0)
  return `QC-2026-${String(max + 1).padStart(4, '0')}`
}

function nowStamp() {
  const now = new Date()
  return `${now.toISOString().slice(0, 10)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function remainingOpenQty(line: PurchaseOrderLine) {
  return Math.max(0, line.qtyOrdered - line.qtyReceived)
}

export type CreateReceiptFromPoInput = {
  receivedBy?: string
  deliveryNote?: string
  remark?: string
  /** 若省略则按各行剩余可收数量建行 */
  lineQtys?: Array<{ poLineId: string; qtyArrived: number; suggestedBin?: string }>
}

/**
 * 由已下发/部分到货采购单创建收货批次（purchase_receipts + lines）。
 * 不可对草稿/已取消/已关闭采购单建收货。
 */
export function createReceiptFromPurchaseOrder(
  receipts: PurchaseReceipt[],
  poId: string,
  input: CreateReceiptFromPoInput = {},
): { ok: true; receipt: PurchaseReceipt } | { ok: false; reason: string } {
  const order = getPurchaseOrder(poId)
  if (!order) return { ok: false, reason: '采购单不存在' }
  if (order.status === '草稿' || order.status === '已取消' || order.status === '已关闭') {
    return { ok: false, reason: `采购单状态「${order.status}」不可登记到货` }
  }
  if (order.lines.length === 0) return { ok: false, reason: '采购单无明细，无法收货' }

  const openLines = order.lines.filter((line) => remainingOpenQty(line) > 0)
  if (openLines.length === 0) return { ok: false, reason: '采购单行已全部到货，无需再建收货批次' }

  const receiptNo = nextReceiptNo(receipts)
  const lines: PurchaseReceiptLine[] = openLines.map((poLine, index) => {
    const override = input.lineQtys?.find((item) => item.poLineId === poLine.id)
    const open = remainingOpenQty(poLine)
    const qtyArrived = override
      ? Math.min(open, Math.max(1, Math.floor(override.qtyArrived) || 1))
      : open
    const lineNo = index + 1
    return {
      id: `RCVL-${receiptNo.replace(/^RCV-/, '')}-${String(lineNo).padStart(2, '0')}`,
      lineNo,
      poLineId: poLine.id,
      sku: poLine.sku,
      qtyOrdered: poLine.qtyOrdered,
      qtyArrived,
      qtyPendingQc: qtyArrived,
      qtyPassed: 0,
      qtyFailed: 0,
      note: '',
      suggestedBin: override?.suggestedBin || (poLine.sku.startsWith('HSY000002') ? 'B-02-01-01' : 'A-01-01-01'),
    }
  })

  const created: PurchaseReceipt = {
    id: receiptNo,
    receiptNo,
    purchaseOrderId: order.poNo,
    supplier: order.supplier,
    warehouse: order.warehouse,
    status: '草稿',
    arrivedAt: nowStamp(),
    receivedBy: input.receivedBy?.trim() || '当前用户',
    deliveryNote: input.deliveryNote?.trim() || '',
    remark: input.remark?.trim() || '',
    qcNo: '',
    qcInspector: '',
    qcCompletedAt: '',
    inboundIds: [],
    lines,
  }
  receiptStore.set([created, ...receipts])
  return { ok: true, receipt: created }
}

export function updateReceiptHeader(
  receipts: PurchaseReceipt[],
  receiptId: string,
  patch: Partial<Pick<PurchaseReceipt, 'receivedBy' | 'deliveryNote' | 'remark' | 'arrivedAt'>>,
) {
  receiptStore.set(
    receipts.map((receipt) => {
      if (receipt.id !== receiptId) return receipt
      if (receipt.status !== '草稿' && receipt.status !== '待质检') return receipt
      return { ...receipt, ...patch }
    }),
  )
}

export function updateReceiptLineQty(
  receipts: PurchaseReceipt[],
  receiptId: string,
  lineId: string,
  qtyArrived: number,
  suggestedBin?: string,
): { ok: true } | { ok: false; reason: string } {
  const current = receipts.find((item) => item.id === receiptId)
  if (!current) return { ok: false, reason: '收货单不存在' }
  if (current.status !== '草稿') return { ok: false, reason: '仅草稿收货单可改到货数量' }

  let ok = false
  receiptStore.set(
    receipts.map((receipt) => {
      if (receipt.id !== receiptId) return receipt
      return {
        ...receipt,
        lines: receipt.lines.map((line) => {
          if (line.id !== lineId) return line
          const nextQty = Math.max(1, Math.floor(qtyArrived) || 1)
          ok = true
          return {
            ...line,
            qtyArrived: nextQty,
            qtyPendingQc: nextQty,
            suggestedBin: suggestedBin?.trim() || line.suggestedBin,
          }
        }),
      }
    }),
  )
  return ok ? { ok: true } : { ok: false, reason: '收货明细不存在' }
}

/** 草稿 → 待质检 */
export function submitReceiptForQc(
  receipts: PurchaseReceipt[],
  receiptId: string,
): { ok: true; receipt: PurchaseReceipt } | { ok: false; reason: string } {
  const current = receipts.find((item) => item.id === receiptId)
  if (!current) return { ok: false, reason: '收货单不存在' }
  if (current.status !== '草稿') return { ok: false, reason: '仅草稿收货单可提交质检' }
  if (current.lines.length === 0) return { ok: false, reason: '收货单无明细' }
  if (current.lines.some((line) => line.qtyArrived <= 0)) {
    return { ok: false, reason: '到货数量须大于 0' }
  }

  let updated!: PurchaseReceipt
  receiptStore.set(
    receipts.map((receipt) => {
      if (receipt.id !== receiptId) return receipt
      updated = {
        ...receipt,
        status: '待质检',
        lines: receipt.lines.map((line) => ({
          ...line,
          qtyPendingQc: line.qtyArrived,
          qtyPassed: 0,
          qtyFailed: 0,
        })),
      }
      return updated
    }),
  )
  return { ok: true, receipt: updated }
}

export type QcLineResultInput = {
  lineId: string
  qtyPassed: number
  qtyFailed: number
  suggestedBin?: string
  note?: string
}

/**
 * 完成质检：待质检 → 已完成。
 * 规则：qty_passed + qty_failed === qty_arrived；仅 qty_passed 生成入库单（待上架）。
 * 回写采购单行 qty_received / qty_qc_passed，并推进采购单状态。
 */
export function completeReceiptQc(
  receipts: PurchaseReceipt[],
  inbounds: StockInbound[],
  receiptId: string,
  lineResults: QcLineResultInput[],
  inspector?: string,
):
  | { ok: true; receipt: PurchaseReceipt; createdInbounds: StockInbound[] }
  | { ok: false; reason: string } {
  const current = receipts.find((item) => item.id === receiptId)
  if (!current) return { ok: false, reason: '收货单不存在' }
  if (current.status !== '待质检') return { ok: false, reason: '仅「待质检」收货单可完成质检' }

  const nextLines: PurchaseReceiptLine[] = []
  for (const line of current.lines) {
    const result = lineResults.find((item) => item.lineId === line.id)
    if (!result) return { ok: false, reason: `缺少明细 ${line.sku} 的质检结果` }
    const qtyPassed = Math.max(0, Math.floor(result.qtyPassed) || 0)
    const qtyFailed = Math.max(0, Math.floor(result.qtyFailed) || 0)
    if (qtyPassed + qtyFailed !== line.qtyArrived) {
      return {
        ok: false,
        reason: `${line.sku}：合格+残次须等于到货 ${line.qtyArrived}（当前 ${qtyPassed}+${qtyFailed}）`,
      }
    }
    if (qtyPassed > 0 && !(result.suggestedBin || line.suggestedBin)) {
      return { ok: false, reason: `${line.sku} 合格数量须指定上架库位` }
    }
    nextLines.push({
      ...line,
      qtyPassed,
      qtyFailed,
      qtyPendingQc: 0,
      suggestedBin: result.suggestedBin?.trim() || line.suggestedBin,
      note: result.note?.trim() || line.note,
    })
  }

  const qcNo = nextQcNo(receipts)
  const qcInspector = inspector?.trim() || current.receivedBy || '当前用户'
  const qcCompletedAt = nowStamp()
  const createdInbounds: StockInbound[] = []
  let inboundPool = [...inbounds]

  for (const line of nextLines) {
    if (line.qtyPassed <= 0) continue
    const inboundNo = nextInboundNo(inboundPool)
    const inbound: StockInbound = {
      id: inboundNo,
      inboundNo,
      sourceType: '采购入库',
      sourceDoc: current.receiptNo,
      purchaseOrderId: current.purchaseOrderId,
      warehouse: current.warehouse,
      sku: line.sku,
      quantity: line.qtyPassed,
      qcResult: `合格 ${line.qtyPassed} / 残次 ${line.qtyFailed}`,
      bin: line.suggestedBin,
      operator: qcInspector,
      at: qcCompletedAt,
      status: '待上架',
      idempotencyKey: `ledger:purchase_stock_in:${current.receiptNo}:${line.sku}`,
      remark: line.note,
    }
    // 幂等：同 key 已存在则跳过新建
    const existing = inboundPool.find((item) => item.idempotencyKey === inbound.idempotencyKey)
    if (existing) {
      createdInbounds.push(existing)
      continue
    }
    inboundPool = [inbound, ...inboundPool]
    createdInbounds.push(inbound)
  }

  const inboundIds = createdInbounds.map((item) => item.id)
  const updated: PurchaseReceipt = {
    ...current,
    status: '已完成',
    qcNo,
    qcInspector,
    qcCompletedAt,
    lines: nextLines,
    inboundIds: [...new Set([...current.inboundIds, ...inboundIds])],
  }

  receiptStore.set(receipts.map((receipt) => (receipt.id === receiptId ? updated : receipt)))
  inboundStore.set(inboundPool)

  // 回写采购单投影
  const deltas = nextLines.map((line) => ({
    poLineId: line.poLineId,
    sku: line.sku,
    qtyReceivedDelta: line.qtyArrived,
    qtyQcPassedDelta: line.qtyPassed,
    qtyStockedDelta: 0,
  }))
  applyPurchaseOrderReceiveProjection(current.purchaseOrderId, deltas)

  return { ok: true, receipt: updated, createdInbounds }
}

/**
 * 确认上架：待上架 → 已上架；回写采购单 qty_stocked。
 * 正式环境此处写 inventory_ledger（幂等键防重复）。
 */
export function confirmStockInboundShelve(
  inbounds: StockInbound[],
  inboundId: string,
  operator?: string,
): { ok: true; inbound: StockInbound } | { ok: false; reason: string } {
  const current = inbounds.find((item) => item.id === inboundId)
  if (!current) return { ok: false, reason: '入库单不存在' }
  if (current.status !== '待上架') return { ok: false, reason: '仅「待上架」入库单可确认上架' }
  if (!current.bin) return { ok: false, reason: '缺少目标库位，无法上架' }
  if (current.quantity <= 0) return { ok: false, reason: '上架数量无效' }

  let updated!: StockInbound
  const actor = operator?.trim() || current.operator || '当前用户'
  const stockResult = applyPurchaseStockIn({
    warehouse: current.warehouse || 'WH-CN-XMN-001',
    bin: current.bin,
    sku: current.sku,
    quantity: current.quantity,
    sourceDoc: current.sourceDoc,
    actor,
    idempotencyKey: current.idempotencyKey,
    reason: `${current.sourceType}上架`,
  })
  if (!stockResult.ok) return { ok: false, reason: stockResult.reason }

  inboundStore.set(
    inbounds.map((inbound) => {
      if (inbound.id !== inboundId) return inbound
      updated = {
        ...inbound,
        status: '已上架',
        operator: actor,
        at: nowStamp(),
      }
      return updated
    }),
  )

  if (current.sourceType === '采购入库' && current.purchaseOrderId) {
    const receipt = receiptStore.get().find((item) => item.receiptNo === current.sourceDoc)
    const line = receipt?.lines.find((item) => item.sku === current.sku)
    applyPurchaseOrderReceiveProjection(current.purchaseOrderId, [
      {
        poLineId: line?.poLineId || '',
        sku: current.sku,
        qtyReceivedDelta: 0,
        qtyQcPassedDelta: 0,
        qtyStockedDelta: current.quantity,
      },
    ])
  }

  return { ok: true, inbound: updated }
}

/** 待上架入库单可改库位/备注/操作人 */
export function updateStockInboundDraft(
  inbounds: StockInbound[],
  inboundId: string,
  patch: Partial<Pick<StockInbound, 'bin' | 'operator' | 'remark'>>,
): { ok: true; inbound: StockInbound } | { ok: false; reason: string } {
  const current = inbounds.find((item) => item.id === inboundId)
  if (!current) return { ok: false, reason: '入库单不存在' }
  if (current.status !== '待上架') return { ok: false, reason: '仅「待上架」可编辑库位与备注' }
  const bin = patch.bin?.trim()
  if (patch.bin !== undefined && !bin) return { ok: false, reason: '目标库位不能为空' }

  let updated!: StockInbound
  inboundStore.set(
    inbounds.map((inbound) => {
      if (inbound.id !== inboundId) return inbound
      updated = {
        ...inbound,
        bin: bin || inbound.bin,
        operator: patch.operator?.trim() || inbound.operator,
        remark: patch.remark !== undefined ? patch.remark.trim() : inbound.remark,
      }
      return updated
    }),
  )
  return { ok: true, inbound: updated }
}

/** 取消待上架入库单（已上架不可取消，需走调整单） */
export function cancelStockInbound(
  inbounds: StockInbound[],
  inboundId: string,
  reason?: string,
): { ok: true; inbound: StockInbound } | { ok: false; reason: string } {
  const current = inbounds.find((item) => item.id === inboundId)
  if (!current) return { ok: false, reason: '入库单不存在' }
  if (current.status === '已上架') return { ok: false, reason: '已上架不可取消，请走库存调整' }
  if (current.status === '已取消') return { ok: false, reason: '入库单已取消' }

  let updated!: StockInbound
  inboundStore.set(
    inbounds.map((inbound) => {
      if (inbound.id !== inboundId) return inbound
      updated = {
        ...inbound,
        status: '已取消',
        remark: reason?.trim()
          ? `${inbound.remark ? inbound.remark + '；' : ''}取消原因：${reason.trim()}`
          : inbound.remark,
        at: nowStamp(),
      }
      return updated
    }),
  )
  return { ok: true, inbound: updated }
}

export function cancelPurchaseReceipt(
  receipts: PurchaseReceipt[],
  receiptId: string,
): { ok: true } | { ok: false; reason: string } {
  const current = receipts.find((item) => item.id === receiptId)
  if (!current) return { ok: false, reason: '收货单不存在' }
  if (current.status === '已完成') return { ok: false, reason: '已完成收货不可取消，请走差异调整' }
  if (current.status === '已取消') return { ok: false, reason: '收货单已取消' }
  receiptStore.set(
    receipts.map((receipt) =>
      receipt.id === receiptId ? { ...receipt, status: '已取消' as const } : receipt,
    ),
  )
  return { ok: true }
}

export function createManualStockInbound(
  inbounds: StockInbound[],
  input: {
    sourceType: StockInboundSourceType
    sourceDoc: string
    sku: string
    quantity: number
    bin: string
    warehouse?: string
    operator?: string
    qcResult?: string
    remark?: string
    purchaseOrderId?: string
  },
): { ok: true; inbound: StockInbound } | { ok: false; reason: string } {
  if (!input.sourceDoc.trim()) return { ok: false, reason: '入库必须关联来源单据' }
  if (!input.sku.trim()) return { ok: false, reason: '请选择内部 SKU' }
  const quantity = Math.max(1, Math.floor(input.quantity) || 1)
  if (!input.bin.trim()) return { ok: false, reason: '请选择目标库位' }

  const inboundNo = nextInboundNo(inbounds)
  const created: StockInbound = {
    id: inboundNo,
    inboundNo,
    sourceType: input.sourceType,
    sourceDoc: input.sourceDoc.trim(),
    purchaseOrderId: input.purchaseOrderId?.trim() || '',
    warehouse: input.warehouse || 'WH-CN-XMN-001',
    sku: input.sku,
    quantity,
    qcResult: input.qcResult?.trim() || '待确认',
    bin: input.bin,
    operator: input.operator?.trim() || '当前用户',
    at: nowStamp(),
    status: '待上架',
    idempotencyKey: `ledger:manual:${input.sourceType}:${input.sourceDoc}:${input.sku}:${inboundNo}`,
    remark: input.remark?.trim() || '',
  }
  inboundStore.set([created, ...inbounds])
  return { ok: true, inbound: created }
}

/** 供 related-info / 列表：扁平兼容字段 */
export function toRelatedReceiptShape(receipt: PurchaseReceipt) {
  const first = receipt.lines[0]
  return {
    id: receipt.receiptNo,
    po: receipt.purchaseOrderId,
    sku: first?.sku ?? '—',
    arrived: receipt.lines.reduce((sum, line) => sum + line.qtyArrived, 0),
    qcPass: receipt.lines.reduce((sum, line) => sum + line.qtyPassed, 0),
    qcDefect: receipt.lines.reduce((sum, line) => sum + line.qtyFailed, 0),
    shortage: 0,
    bin: first?.suggestedBin ?? '—',
    operator: receipt.receivedBy,
    status: receipt.status,
  }
}

export function toRelatedInboundShape(inbound: StockInbound) {
  return {
    id: inbound.inboundNo,
    sourceType: inbound.sourceType,
    sourceDoc: inbound.sourceDoc,
    sku: inbound.sku,
    quantity: inbound.quantity,
    qcResult: inbound.qcResult,
    bin: inbound.bin,
    operator: inbound.operator,
    at: inbound.at,
    status: inbound.status,
  }
}

export type { PurchaseOrder }
