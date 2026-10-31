'use client'

/**
 * 采购申请原型会话 store。
 * 字段对齐 docs/design/haoshiyun-erp-database-schema.md：
 *   purchase_requests（主信息）+ purchase_request_lines（申请明细）
 * 状态机：draft → pending_approval → approved → converted
 *                          ↘ rejected；任意可编辑阶段可 cancelled
 * 正式批准后通过 convertApprovedRequestToPurchaseOrder 写入
 *   purchase_orders + purchase_order_lines（见 purchase-order-store）。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'
import {
  createPurchaseOrderFromApprovedRequest,
  getPurchaseOrder,
  type PurchaseOrder,
} from '@/lib/crossborder/purchase-order-store'

/** 对应 purchase_requests.status */
export const PURCHASE_REQUEST_STATUSES = [
  '草稿',
  '待审核',
  '已批准',
  '已驳回',
  '已转采购单',
  '已取消',
] as const

export type PurchaseRequestStatus = (typeof PURCHASE_REQUEST_STATUSES)[number]

/** 对应 purchase_request_lines */
export type PurchaseRequestLine = {
  id: string
  lineNo: number
  /** variant_id — 内部 SKU */
  sku: string
  /** supplier_sku_id 展示，可空 */
  supplierSku: string
  qty: number
  unitPrice: number
  amount: number
  remark: string
}

/** 对应 purchase_requests（主信息 / header） */
export type PurchaseRequest = {
  id: string
  /** request_no */
  requestNo: string
  /** supplier_id 展示名 */
  supplier: string
  /** warehouse_id */
  warehouse: string
  currency: string
  totalAmount: number
  /** expected_arrival_at */
  expectedAt: string
  /** remark / 采购原因说明 */
  reason: string
  remark: string
  /** created_by 展示 */
  applicant: string
  /** 互审规则分配的审核人展示 */
  approver: string
  /** approval opinion 留痕 */
  opinion: string
  status: PurchaseRequestStatus
  createdAt: string
  submittedAt: string
  /** converted_po_id */
  convertedPoId: string
  lines: PurchaseRequestLine[]
}

export type PurchaseRequestListRow = Omit<PurchaseRequest, 'lines'> & {
  lineCount: number
  firstSku: string
  totalQty: number
}

export const DEMO_PURCHASE_REQUESTS: PurchaseRequest[] = [
  {
    id: 'PR-2026-0012',
    requestNo: 'PR-2026-0012',
    supplier: '厦门优品服饰有限公司',
    warehouse: 'WH-CN-XMN-001',
    currency: 'CNY',
    totalAmount: 2800,
    expectedAt: '2026-11-20',
    reason: '补货',
    remark: '库存预警：HSY000001001 可用低于安全库存',
    applicant: '李萍',
    approver: '杨洁 / 黄发聪',
    opinion: '—',
    status: '待审核',
    createdAt: '2026-10-28',
    submittedAt: '2026-10-28 09:40',
    convertedPoId: '',
    lines: [
      {
        id: 'PRL-2026-0012-01',
        lineNo: 1,
        sku: 'HSY000001001',
        supplierSku: 'YP-TEE-BLK-L',
        qty: 100,
        unitPrice: 28,
        amount: 2800,
        remark: '',
      },
    ],
  },
  {
    id: 'PR-2026-0011',
    requestNo: 'PR-2026-0011',
    supplier: '泉州联创数码配件厂',
    warehouse: 'WH-CN-XMN-001',
    currency: 'CNY',
    totalAmount: 3100,
    expectedAt: '2026-11-14',
    reason: '订单采购',
    remark: '关联平台缺货补单',
    applicant: '杨洁',
    approver: '黄发聪',
    opinion: '价格与上单一致，通过',
    status: '已转采购单',
    createdAt: '2026-10-27',
    submittedAt: '2026-10-27 11:05',
    convertedPoId: 'PO-2026-0031',
    lines: [
      {
        id: 'PRL-2026-0011-01',
        lineNo: 1,
        sku: 'HSY000002001',
        supplierSku: 'LC-HUB-7IN1',
        qty: 50,
        unitPrice: 62,
        amount: 3100,
        remark: '',
      },
    ],
  },
  {
    id: 'PR-2026-0010',
    requestNo: 'PR-2026-0010',
    supplier: '泉州联创数码配件厂',
    warehouse: 'WH-CN-XMN-001',
    currency: 'CNY',
    totalAmount: 1860,
    expectedAt: '2026-11-18',
    reason: '备货',
    remark: '活动备货',
    applicant: '兰雨晨',
    approver: '杨洁 / 黄发聪',
    opinion: '—',
    status: '待审核',
    createdAt: '2026-10-27',
    submittedAt: '2026-10-27 16:12',
    convertedPoId: '',
    lines: [
      {
        id: 'PRL-2026-0010-01',
        lineNo: 1,
        sku: 'HSY000002001',
        supplierSku: 'LC-HUB-7IN1',
        qty: 30,
        unitPrice: 62,
        amount: 1860,
        remark: '',
      },
    ],
  },
  {
    id: 'PR-2026-0009',
    requestNo: 'PR-2026-0009',
    supplier: '厦门优品服饰有限公司',
    warehouse: 'WH-CN-XMN-001',
    currency: 'CNY',
    totalAmount: 2320,
    expectedAt: '2026-11-05',
    reason: '备货',
    remark: '',
    applicant: '黄发聪',
    approver: '杨洁',
    opinion: '同意备货',
    status: '已转采购单',
    createdAt: '2026-10-18',
    submittedAt: '2026-10-18 10:00',
    convertedPoId: 'PO-2026-0030',
    lines: [
      {
        id: 'PRL-2026-0009-01',
        lineNo: 1,
        sku: 'HSY000001002',
        supplierSku: 'YP-TEE-WHT-L',
        qty: 80,
        unitPrice: 29,
        amount: 2320,
        remark: '',
      },
    ],
  },
  {
    id: 'PR-2026-0008',
    requestNo: 'PR-2026-0008',
    supplier: '厦门优品服饰有限公司',
    warehouse: 'WH-CN-XMN-001',
    currency: 'CNY',
    totalAmount: 2480,
    expectedAt: '2026-10-30',
    reason: '补货',
    remark: '单价偏高',
    applicant: '黄发聪',
    approver: '杨洁',
    opinion: '单价高于近三单均价，暂缓',
    status: '已驳回',
    createdAt: '2026-10-24',
    submittedAt: '2026-10-24 14:22',
    convertedPoId: '',
    lines: [
      {
        id: 'PRL-2026-0008-01',
        lineNo: 1,
        sku: 'HSY000001002',
        supplierSku: 'YP-TEE-WHT-L',
        qty: 80,
        unitPrice: 31,
        amount: 2480,
        remark: '',
      },
    ],
  },
  {
    id: 'PR-2026-0004',
    requestNo: 'PR-2026-0004',
    supplier: '厦门优品服饰有限公司',
    warehouse: 'WH-CN-XMN-001',
    currency: 'CNY',
    totalAmount: 2800,
    expectedAt: '2026-10-20',
    reason: '备货',
    remark: '',
    applicant: '李萍',
    approver: '杨洁 / 黄发聪',
    opinion: '通过',
    status: '已转采购单',
    createdAt: '2026-10-05',
    submittedAt: '2026-10-05 09:00',
    convertedPoId: 'PO-2026-0028',
    lines: [
      {
        id: 'PRL-2026-0004-01',
        lineNo: 1,
        sku: 'HSY000001001',
        supplierSku: 'YP-TEE-BLK-L',
        qty: 100,
        unitPrice: 28,
        amount: 2800,
        remark: '',
      },
    ],
  },
  {
    id: 'PR-2026-0013',
    requestNo: 'PR-2026-0013',
    supplier: '厦门优品服饰有限公司',
    warehouse: 'WH-CN-XMN-001',
    currency: 'CNY',
    totalAmount: 0,
    expectedAt: '2026-11-25',
    reason: '补货',
    remark: '主信息已建，待添加明细',
    applicant: '当前用户',
    approver: '杨洁 / 黄发聪',
    opinion: '—',
    status: '草稿',
    createdAt: '2026-10-29',
    submittedAt: '',
    convertedPoId: '',
    lines: [],
  },
]

const store = createDemoStore<PurchaseRequest[]>(
  'open-shop.console.demo.purchase-requests.v1',
  DEMO_PURCHASE_REQUESTS,
)

export function usePurchaseRequests() {
  return store.useStore()
}

export function getPurchaseRequest(id: string): PurchaseRequest | undefined {
  return store.get().find((row) => row.id === id)
}

export function toListRow(request: PurchaseRequest): PurchaseRequestListRow {
  return {
    id: request.id,
    requestNo: request.requestNo,
    supplier: request.supplier,
    warehouse: request.warehouse,
    currency: request.currency,
    totalAmount: request.totalAmount,
    expectedAt: request.expectedAt,
    reason: request.reason,
    remark: request.remark,
    applicant: request.applicant,
    approver: request.approver,
    opinion: request.opinion,
    status: request.status,
    createdAt: request.createdAt,
    submittedAt: request.submittedAt,
    convertedPoId: request.convertedPoId,
    lineCount: request.lines.length,
    firstSku: request.lines[0]?.sku ?? '—',
    totalQty: request.lines.reduce((sum, line) => sum + line.qty, 0),
  }
}

function nextRequestNo(requests: PurchaseRequest[]) {
  const max = requests.reduce((current, request) => {
    const matched = /^PR-(\d{4})-(\d+)$/.exec(request.requestNo)
    return matched ? Math.max(current, Number(matched[2])) : current
  }, 0)
  return `PR-2026-${String(max + 1).padStart(4, '0')}`
}

function recomputeTotal(lines: PurchaseRequestLine[]) {
  return lines.reduce((sum, line) => sum + line.amount, 0)
}

function assignApprover(applicant: string) {
  if (applicant === '杨洁') return '黄发聪'
  if (applicant === '黄发聪') return '杨洁'
  return '杨洁 / 黄发聪'
}

export type CreatePurchaseRequestHeaderInput = {
  supplier: string
  warehouse: string
  currency: string
  expectedAt: string
  reason: string
  remark?: string
  applicant?: string
}

/** 第一步：仅保存主信息（header），不含明细行 */
export function createPurchaseRequestHeader(
  requests: PurchaseRequest[],
  input: CreatePurchaseRequestHeaderInput,
): PurchaseRequest {
  const requestNo = nextRequestNo(requests)
  const applicant = input.applicant?.trim() || '当前用户'
  const created: PurchaseRequest = {
    id: requestNo,
    requestNo,
    supplier: input.supplier,
    warehouse: input.warehouse,
    currency: input.currency || 'CNY',
    totalAmount: 0,
    expectedAt: input.expectedAt,
    reason: input.reason || '补货',
    remark: input.remark?.trim() || '',
    applicant,
    approver: assignApprover(applicant),
    opinion: '—',
    status: '草稿',
    createdAt: new Date().toISOString().slice(0, 10),
    submittedAt: '',
    convertedPoId: '',
    lines: [],
  }
  store.set([created, ...requests])
  return created
}

export type AddPurchaseRequestLineInput = {
  sku: string
  supplierSku?: string
  qty: number
  unitPrice: number
  remark?: string
}

/** 第二步：在已有主信息上追加申请明细（purchase_request_lines） */
export function addPurchaseRequestLine(
  requests: PurchaseRequest[],
  requestId: string,
  input: AddPurchaseRequestLineInput,
): PurchaseRequest | undefined {
  let updated: PurchaseRequest | undefined
  const next = requests.map((request) => {
    if (request.id !== requestId) return request
    if (request.status !== '草稿' && request.status !== '已驳回') return request
    const qty = Math.max(1, Math.floor(input.qty) || 1)
    const unitPrice = Math.max(0, Number(input.unitPrice) || 0)
    const lineNo = request.lines.length + 1
    const line: PurchaseRequestLine = {
      id: `PRL-${request.requestNo.replace(/^PR-/, '')}-${String(lineNo).padStart(2, '0')}`,
      lineNo,
      sku: input.sku,
      supplierSku: input.supplierSku?.trim() || '',
      qty,
      unitPrice,
      amount: Number((qty * unitPrice).toFixed(4)),
      remark: input.remark?.trim() || '',
    }
    const lines = [...request.lines, line]
    updated = {
      ...request,
      lines,
      totalAmount: recomputeTotal(lines),
      status: request.status === '已驳回' ? '草稿' : request.status,
    }
    return updated
  })
  store.set(next)
  return updated
}

export function updatePurchaseRequestHeader(
  requests: PurchaseRequest[],
  requestId: string,
  patch: Partial<
    Pick<
      PurchaseRequest,
      'supplier' | 'warehouse' | 'currency' | 'expectedAt' | 'reason' | 'remark' | 'applicant'
    >
  >,
) {
  store.set(
    requests.map((request) => {
      if (request.id !== requestId) return request
      if (request.status !== '草稿' && request.status !== '已驳回') return request
      const applicant = patch.applicant ?? request.applicant
      return {
        ...request,
        ...patch,
        applicant,
        approver: assignApprover(applicant),
        status: request.status === '已驳回' ? '草稿' : request.status,
      }
    }),
  )
}

/** 提交审核：draft → pending_approval（至少一条明细） */
export function submitPurchaseRequest(
  requests: PurchaseRequest[],
  requestId: string,
): { ok: true; request: PurchaseRequest } | { ok: false; reason: string } {
  const current = requests.find((item) => item.id === requestId)
  if (!current) return { ok: false, reason: '申请不存在' }
  if (current.status !== '草稿' && current.status !== '已驳回') {
    return { ok: false, reason: '仅草稿或已驳回申请可提交审核' }
  }
  if (current.lines.length === 0) {
    return { ok: false, reason: '请先添加至少一条申请明细，再提交审核' }
  }
  const now = new Date()
  const submittedAt = `${now.toISOString().slice(0, 10)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  let updated!: PurchaseRequest
  store.set(
    requests.map((request) => {
      if (request.id !== requestId) return request
      updated = {
        ...request,
        status: '待审核',
        submittedAt,
        opinion: '—',
        approver: assignApprover(request.applicant),
      }
      return updated
    }),
  )
  return { ok: true, request: updated }
}

/** 撤回：pending_approval → draft */
export function withdrawPurchaseRequest(requests: PurchaseRequest[], requestId: string) {
  store.set(
    requests.map((request) =>
      request.id === requestId && request.status === '待审核'
        ? { ...request, status: '草稿' as const, submittedAt: '' }
        : request,
    ),
  )
}

export function cancelPurchaseRequest(requests: PurchaseRequest[], requestId: string) {
  store.set(
    requests.map((request) =>
      request.id === requestId &&
      (request.status === '草稿' || request.status === '待审核' || request.status === '已驳回')
        ? { ...request, status: '已取消' as const }
        : request,
    ),
  )
}

export type ApprovePurchaseRequestInput = {
  opinion?: string
  approver?: string
}

/**
 * 正式批准：pending_approval → converted，并生成
 * purchase_orders + purchase_order_lines（service 校验：仅 approved 可转单；
 * 本原型将批准与转单合并为一次审核动作，状态落在「已转采购单」）。
 */
export function approveAndConvertPurchaseRequest(
  requests: PurchaseRequest[],
  orders: PurchaseOrder[],
  requestId: string,
  input: ApprovePurchaseRequestInput = {},
):
  | { ok: true; request: PurchaseRequest; order: PurchaseOrder }
  | { ok: false; reason: string } {
  const current = requests.find((item) => item.id === requestId)
  if (!current) return { ok: false, reason: '申请不存在' }
  if (current.status !== '待审核') {
    return { ok: false, reason: '仅「待审核」申请可批准并转采购单' }
  }
  if (current.lines.length === 0) {
    return { ok: false, reason: '申请无明细，无法转采购单' }
  }
  if (current.convertedPoId && getPurchaseOrder(current.convertedPoId)) {
    return { ok: false, reason: `申请已关联采购单 ${current.convertedPoId}` }
  }

  const order = createPurchaseOrderFromApprovedRequest(orders, {
    sourceRequest: current.requestNo,
    supplier: current.supplier,
    warehouse: current.warehouse,
    currency: current.currency,
    expectedAt: current.expectedAt,
    lines: current.lines.map((line) => ({
      sku: line.sku,
      qtyOrdered: line.qty,
      unitPrice: line.unitPrice,
    })),
  })

  let updated!: PurchaseRequest
  store.set(
    requests.map((request) => {
      if (request.id !== requestId) return request
      updated = {
        ...request,
        status: '已转采购单',
        opinion: input.opinion?.trim() || '同意（原型）',
        approver: input.approver?.trim() || request.approver,
        convertedPoId: order.poNo,
      }
      return updated
    }),
  )
  return { ok: true, request: updated, order }
}

export function rejectPurchaseRequest(
  requests: PurchaseRequest[],
  requestId: string,
  input: ApprovePurchaseRequestInput = {},
): { ok: true; request: PurchaseRequest } | { ok: false; reason: string } {
  const current = requests.find((item) => item.id === requestId)
  if (!current) return { ok: false, reason: '申请不存在' }
  if (current.status !== '待审核') {
    return { ok: false, reason: '仅「待审核」申请可驳回' }
  }
  const opinion = input.opinion?.trim()
  if (!opinion) return { ok: false, reason: '驳回须填写审核意见' }

  let updated!: PurchaseRequest
  store.set(
    requests.map((request) => {
      if (request.id !== requestId) return request
      updated = {
        ...request,
        status: '已驳回',
        opinion,
        approver: input.approver?.trim() || request.approver,
      }
      return updated
    }),
  )
  return { ok: true, request: updated }
}

/** 审核队列行：待审核优先，供采购审核页使用 */
export function toApprovalListRow(request: PurchaseRequest) {
  return {
    ...toListRow(request),
    submittedAt: request.submittedAt || '—',
  }
}

/** 供 KPI：各状态计数 */
export function countByStatus(requests: PurchaseRequest[]) {
  const counts: Record<PurchaseRequestStatus, number> = {
    草稿: 0,
    待审核: 0,
    已批准: 0,
    已驳回: 0,
    已转采购单: 0,
    已取消: 0,
  }
  for (const request of requests) {
    counts[request.status] = (counts[request.status] ?? 0) + 1
  }
  return counts
}

