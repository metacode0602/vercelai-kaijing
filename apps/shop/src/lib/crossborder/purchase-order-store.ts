/**
 * 采购单类型与纯函数助手。
 * 主路径：`trpc.purchase.listOrders / getOrder` → PostgreSQL。
 */

export {
  UI_PURCHASE_ORDER_STATUSES as PURCHASE_ORDER_STATUSES,
  type UiPurchaseOrderStatus as PurchaseOrderStatus,
} from '@/lib/server/mappers/purchase'
import type { UiPurchaseOrderStatus } from '@/lib/server/mappers/purchase'

export type PurchaseOrderLine = {
  id: string
  lineNo: number
  sku: string
  qtyOrdered: number
  qtyReceived: number
  qtyQcPassed: number
  qtyStocked: number
  unitPrice: number
  amount: number
}

export type PurchaseOrder = {
  id: string
  poNo: string
  sourceRequest: string
  supplier: string
  warehouse: string
  currency: string
  totalAmount: number
  expectedAt: string
  status: UiPurchaseOrderStatus
  createdAt: string
  lines: PurchaseOrderLine[]
}

export type PurchaseOrderListRow = Omit<PurchaseOrder, 'lines'> & {
  lineCount: number
  firstSku: string
}

export function toListRow(order: PurchaseOrder): PurchaseOrderListRow {
  return {
    id: order.id,
    poNo: order.poNo,
    sourceRequest: order.sourceRequest,
    supplier: order.supplier,
    warehouse: order.warehouse,
    currency: order.currency,
    totalAmount: order.totalAmount,
    expectedAt: order.expectedAt,
    status: order.status,
    createdAt: order.createdAt,
    lineCount: order.lines.length,
    firstSku: order.lines[0]?.sku ?? '—',
  }
}

export function usePurchaseOrders(): PurchaseOrder[] {
  throw new Error('purchase-order-store localStorage 已停用，请使用 trpc.purchase.listOrders')
}

export function getPurchaseOrder(_id: string): PurchaseOrder | undefined {
  throw new Error('purchase-order-store localStorage 已停用，请使用 trpc.purchase.getOrder')
}
