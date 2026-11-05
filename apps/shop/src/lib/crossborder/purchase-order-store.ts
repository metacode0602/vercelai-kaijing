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

/** related-info 等软关联展示用静态样例（非 localStorage） */
export const DEMO_PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    id: 'PO-2026-0031',
    poNo: 'PO-2026-0031',
    sourceRequest: 'PR-2026-0011',
    supplier: '泉州联创数码配件厂',
    warehouse: 'WH-CN-XMN-001',
    currency: 'CNY',
    totalAmount: 3100,
    expectedAt: '2026-11-14',
    status: '已下发',
    createdAt: '2026-10-20',
    lines: [
      {
        id: 'POL-2026-0031-01',
        lineNo: 1,
        sku: 'HSY000002001',
        qtyOrdered: 50,
        qtyReceived: 0,
        qtyQcPassed: 0,
        qtyStocked: 0,
        unitPrice: 62,
        amount: 3100,
      },
    ],
  },
  {
    id: 'PO-2026-0030',
    poNo: 'PO-2026-0030',
    sourceRequest: 'PR-2026-0009',
    supplier: '厦门优品服饰有限公司',
    warehouse: 'WH-CN-XMN-001',
    currency: 'CNY',
    totalAmount: 2320,
    expectedAt: '2026-11-05',
    status: '部分到货',
    createdAt: '2026-10-18',
    lines: [
      {
        id: 'POL-2026-0030-01',
        lineNo: 1,
        sku: 'HSY000001002',
        qtyOrdered: 80,
        qtyReceived: 32,
        qtyQcPassed: 30,
        qtyStocked: 30,
        unitPrice: 29,
        amount: 2320,
      },
    ],
  },
  {
    id: 'PO-2026-0028',
    poNo: 'PO-2026-0028',
    sourceRequest: 'PR-2026-0004',
    supplier: '厦门优品服饰有限公司',
    warehouse: 'WH-CN-XMN-001',
    currency: 'CNY',
    totalAmount: 2800,
    expectedAt: '2026-10-20',
    status: '已收货',
    createdAt: '2026-10-05',
    lines: [
      {
        id: 'POL-2026-0028-01',
        lineNo: 1,
        sku: 'HSY000001001',
        qtyOrdered: 100,
        qtyReceived: 100,
        qtyQcPassed: 98,
        qtyStocked: 98,
        unitPrice: 28,
        amount: 2800,
      },
    ],
  },
]
