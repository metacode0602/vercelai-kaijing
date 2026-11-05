/**
 * 采购收货 / 质检 / 入库上架 类型与纯函数助手。
 * 主路径：`trpc.purchase.*` → PostgreSQL；localStorage / DEMO 已停用。
 * WMS 其它单据（出库/调整）仍见 wms-store。
 */

export {
  UI_PURCHASE_RECEIPT_STATUSES as PURCHASE_RECEIPT_STATUSES,
  UI_STOCK_INBOUND_STATUSES as STOCK_INBOUND_STATUSES,
  UI_STOCK_INBOUND_SOURCE_TYPES as STOCK_INBOUND_SOURCE_TYPES,
  type UiPurchaseReceiptStatus as PurchaseReceiptStatus,
  type UiStockInboundStatus as StockInboundStatus,
  type UiStockInboundSourceType as StockInboundSourceType,
} from '@/lib/server/mappers/purchase'
import type {
  UiPurchaseReceiptStatus,
  UiStockInboundSourceType,
  UiStockInboundStatus,
} from '@/lib/server/mappers/purchase'

export const BIN_OPTIONS = ['A-01-01-01', 'A-01-01-02', 'B-02-01-01', 'C-01-01-01'] as const

export type PurchaseReceiptLine = {
  id: string
  lineNo: number
  poLineId: string
  sku: string
  qtyOrdered: number
  qtyArrived: number
  qtyPendingQc: number
  qtyPassed: number
  qtyFailed: number
  note: string
  suggestedBin: string
}

export type PurchaseReceipt = {
  id: string
  receiptNo: string
  purchaseOrderId: string
  supplier: string
  warehouse: string
  status: UiPurchaseReceiptStatus
  arrivedAt: string
  receivedBy: string
  deliveryNote: string
  remark: string
  qcNo: string
  qcInspector: string
  qcCompletedAt: string
  lines: PurchaseReceiptLine[]
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

export type StockInbound = {
  id: string
  inboundNo: string
  sourceType: UiStockInboundSourceType
  sourceDoc: string
  purchaseOrderId: string
  warehouse: string
  sku: string
  quantity: number
  qcResult: string
  bin: string
  operator: string
  at: string
  status: UiStockInboundStatus
  idempotencyKey: string
  remark: string
}

export type StockInboundListRow = StockInbound

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

export function usePurchaseReceipts(): PurchaseReceipt[] {
  throw new Error('purchase-receipt-store localStorage 已停用，请使用 trpc.purchase.listReceipts')
}

export function useStockInbounds(): StockInbound[] {
  throw new Error('purchase-receipt-store localStorage 已停用，请使用 trpc.purchase.listInbounds')
}

export function getPurchaseReceipt(_id: string): PurchaseReceipt | undefined {
  throw new Error('purchase-receipt-store localStorage 已停用，请使用 trpc.purchase.getReceipt')
}

export function getStockInbound(_id: string): StockInbound | undefined {
  throw new Error('purchase-receipt-store localStorage 已停用，请使用 trpc.purchase.getInbound')
}

export type { PurchaseOrder } from '@/lib/crossborder/purchase-order-store'

/** related-info 软关联展示用静态样例（非 localStorage） */
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

/** related-info 软关联展示用静态样例（非 localStorage） */
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
