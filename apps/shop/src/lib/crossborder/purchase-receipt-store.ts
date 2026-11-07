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
