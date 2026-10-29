'use client'

/**
 * 采购单原型会话 store。
 * 字段对齐 docs/design/haoshiyun-erp-database-schema.md：
 *   purchase_orders（主信息）+ purchase_order_lines（采购明细）
 * 当前控制台未接 tRPC；用 localStorage 在列表/详情间共享。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'

/** 对应 purchase_orders.status */
export const PURCHASE_ORDER_STATUSES = [
  '草稿',
  '已下发',
  '部分到货',
  '已收货',
  '已关闭',
  '已取消',
] as const

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number]

/** 对应 purchase_order_lines */
export type PurchaseOrderLine = {
  id: string
  lineNo: number
  /** variant_id — 内部 SKU */
  sku: string
  qtyOrdered: number
  qtyReceived: number
  qtyQcPassed: number
  qtyStocked: number
  unitPrice: number
  amount: number
}

/** 对应 purchase_orders（主信息 / header） */
export type PurchaseOrder = {
  id: string
  /** po_no */
  poNo: string
  /** purchase_request_id */
  sourceRequest: string
  /** supplier_id 展示名 */
  supplier: string
  /** warehouse_id */
  warehouse: string
  currency: string
  totalAmount: number
  /** expected_arrival_at */
  expectedAt: string
  status: PurchaseOrderStatus
  createdAt: string
  lines: PurchaseOrderLine[]
}

/** 列表行：主信息 + 汇总，不含把行项目展平进表头 */
export type PurchaseOrderListRow = Omit<PurchaseOrder, 'lines'> & {
  lineCount: number
  firstSku: string
}

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

const store = createDemoStore<PurchaseOrder[]>(
  'open-shop.console.demo.purchase-orders.v2',
  DEMO_PURCHASE_ORDERS,
)

export function usePurchaseOrders() {
  return store.useStore()
}

export function getPurchaseOrder(id: string): PurchaseOrder | undefined {
  return store.get().find((row) => row.id === id)
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

function nextPoNo(orders: PurchaseOrder[]) {
  const max = orders.reduce((current, order) => {
    const matched = /^PO-(\d{4})-(\d+)$/.exec(order.poNo)
    return matched ? Math.max(current, Number(matched[2])) : current
  }, 0)
  return `PO-2026-${String(max + 1).padStart(4, '0')}`
}

function recomputeTotal(lines: PurchaseOrderLine[]) {
  return lines.reduce((sum, line) => sum + line.amount, 0)
}

export type CreatePurchaseOrderHeaderInput = {
  sourceRequest: string
  supplier: string
  warehouse: string
  currency: string
  expectedAt: string
}

/** 第一步：仅保存主信息（header），不含明细行 */
export function createPurchaseOrderHeader(
  orders: PurchaseOrder[],
  input: CreatePurchaseOrderHeaderInput,
): PurchaseOrder {
  const poNo = nextPoNo(orders)
  const created: PurchaseOrder = {
    id: poNo,
    poNo,
    sourceRequest: input.sourceRequest.trim() || '—',
    supplier: input.supplier,
    warehouse: input.warehouse,
    currency: input.currency || 'CNY',
    totalAmount: 0,
    expectedAt: input.expectedAt,
    status: '草稿',
    createdAt: new Date().toISOString().slice(0, 10),
    lines: [],
  }
  store.set([created, ...orders])
  return created
}

export type AddPurchaseOrderLineInput = {
  sku: string
  qtyOrdered: number
  unitPrice: number
}

/** 第二步：在已有主信息上追加采购明细（purchase_order_lines） */
export function addPurchaseOrderLine(
  orders: PurchaseOrder[],
  poId: string,
  input: AddPurchaseOrderLineInput,
): PurchaseOrder | undefined {
  let updated: PurchaseOrder | undefined
  const next = orders.map((order) => {
    if (order.id !== poId) return order
    const qtyOrdered = Math.max(1, Math.floor(input.qtyOrdered) || 1)
    const unitPrice = Math.max(0, Number(input.unitPrice) || 0)
    const lineNo = order.lines.length + 1
    const line: PurchaseOrderLine = {
      id: `POL-${order.poNo.replace(/^PO-/, '')}-${String(lineNo).padStart(2, '0')}`,
      lineNo,
      sku: input.sku,
      qtyOrdered,
      qtyReceived: 0,
      qtyQcPassed: 0,
      qtyStocked: 0,
      unitPrice,
      amount: Number((qtyOrdered * unitPrice).toFixed(4)),
    }
    const lines = [...order.lines, line]
    updated = {
      ...order,
      lines,
      totalAmount: recomputeTotal(lines),
    }
    return updated
  })
  store.set(next)
  return updated
}


export type ConvertFromRequestLineInput = {
  sku: string
  qtyOrdered: number
  unitPrice: number
}

export type ConvertFromRequestInput = CreatePurchaseOrderHeaderInput & {
  lines: ConvertFromRequestLineInput[]
}

/**
 * 由已批准采购申请生成正式采购单（header + lines）。
 * 对齐 schema：仅 approved 申请可转换；原型在批准动作中一次性写入
 * purchase_orders + purchase_order_lines，状态为草稿供复核后下发。
 */
export function createPurchaseOrderFromApprovedRequest(
  orders: PurchaseOrder[],
  input: ConvertFromRequestInput,
): PurchaseOrder {
  const poNo = nextPoNo(orders)
  const lines: PurchaseOrderLine[] = input.lines.map((line, index) => {
    const qtyOrdered = Math.max(1, Math.floor(line.qtyOrdered) || 1)
    const unitPrice = Math.max(0, Number(line.unitPrice) || 0)
    const lineNo = index + 1
    return {
      id: `POL-${poNo.replace(/^PO-/, '')}-${String(lineNo).padStart(2, '0')}`,
      lineNo,
      sku: line.sku,
      qtyOrdered,
      qtyReceived: 0,
      qtyQcPassed: 0,
      qtyStocked: 0,
      unitPrice,
      amount: Number((qtyOrdered * unitPrice).toFixed(4)),
    }
  })
  const created: PurchaseOrder = {
    id: poNo,
    poNo,
    sourceRequest: input.sourceRequest.trim() || '—',
    supplier: input.supplier,
    warehouse: input.warehouse,
    currency: input.currency || 'CNY',
    totalAmount: recomputeTotal(lines),
    expectedAt: input.expectedAt,
    status: '草稿',
    createdAt: new Date().toISOString().slice(0, 10),
    lines,
  }
  store.set([created, ...orders])
  return created
}

export function updatePurchaseOrderStatus(
  orders: PurchaseOrder[],
  poId: string,
  status: PurchaseOrderStatus,
) {
  store.set(orders.map((order) => (order.id === poId ? { ...order, status } : order)))
}

export function updatePurchaseOrderHeader(
  orders: PurchaseOrder[],
  poId: string,
  patch: Partial<
    Pick<PurchaseOrder, 'sourceRequest' | 'supplier' | 'warehouse' | 'currency' | 'expectedAt' | 'status'>
  >,
) {
  store.set(orders.map((order) => (order.id === poId ? { ...order, ...patch } : order)))
}
