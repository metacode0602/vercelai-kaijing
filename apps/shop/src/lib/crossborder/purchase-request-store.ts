/**
 * 采购申请类型与纯函数助手。
 *
 * 主路径已切到 tRPC → dataaccess → PostgreSQL（见 `@/lib/server/dataaccess/purchase`）。
 * 本文件不再读写 localStorage / mock；页面请使用 `trpc.purchase.*`。
 */

export {
  UI_PURCHASE_REQUEST_STATUSES as PURCHASE_REQUEST_STATUSES,
  type UiPurchaseRequestStatus as PurchaseRequestStatus,
} from '@/lib/server/mappers/purchase'
import type { UiPurchaseRequestStatus } from '@/lib/server/mappers/purchase'

export type PurchaseRequestLine = {
  id: string
  lineNo: number
  sku: string
  supplierSku: string
  qty: number
  unitPrice: number
  amount: number
  remark: string
}

export type PurchaseRequest = {
  id: string
  requestNo: string
  supplier: string
  warehouse: string
  currency: string
  totalAmount: number
  expectedAt: string
  reason: string
  remark: string
  applicant: string
  approver: string
  opinion: string
  status: UiPurchaseRequestStatus
  createdAt: string
  submittedAt: string
  convertedPoId: string
  lines: PurchaseRequestLine[]
}

export type PurchaseRequestListRow = Omit<PurchaseRequest, 'lines'> & {
  lineCount: number
  firstSku: string
  totalQty: number
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

export function toApprovalListRow(request: PurchaseRequest) {
  return {
    ...toListRow(request),
    pendingLabel: request.status === '待审核' ? '待审' : request.status,
  }
}

export function countByStatus(requests: Array<{ status: string }>) {
  return requests.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1
    return acc
  }, {})
}

/** @deprecated 已停用 localStorage；保留签名避免旧 import 瞬时炸掉 */
export function usePurchaseRequests(): PurchaseRequest[] {
  throw new Error('purchase-request-store localStorage 已停用，请使用 trpc.purchase.listRequests')
}

export function getPurchaseRequest(_id: string): PurchaseRequest | undefined {
  throw new Error('purchase-request-store localStorage 已停用，请使用 trpc.purchase.getRequest')
}
