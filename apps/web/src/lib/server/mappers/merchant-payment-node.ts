import type {
  MerchantPaymentNode,
  MerchantPaymentNodeAuditLog,
  MerchantPaymentNodeProgress,
} from '@/lib/types/merchant'
import type { merchantPaymentNode, merchantPaymentNodeAuditLog } from '@workspace/db/schema'

type PaymentNodeRow = typeof merchantPaymentNode.$inferSelect
type PaymentNodeAuditRow = typeof merchantPaymentNodeAuditLog.$inferSelect

function toIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined
  return value instanceof Date ? value.toISOString() : String(value)
}

function toDateString(value: Date | string | null | undefined): string {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0
  return typeof value === 'number' ? value : Number(value)
}

export function computePaymentNodeProgress(
  expectedAmount: number,
  dueDate: string,
  collectedAmount: number,
): MerchantPaymentNodeProgress {
  if (collectedAmount >= expectedAmount) return 'completed'
  if (collectedAmount > 0) return 'partial'
  const today = new Date().toISOString().slice(0, 10)
  if (dueDate < today) return 'overdue'
  return 'pending'
}

export function mapMerchantPaymentNodeRow(
  row: PaymentNodeRow,
  meta: {
    collectedAmount: number
    recordCount: number
    createdBy?: string
    updatedBy?: string
  },
): MerchantPaymentNode {
  const expectedAmount = toNumber(row.expectedAmount)
  const dueDate = toDateString(row.dueDate)
  return {
    id: row.id,
    merchantId: row.merchantId,
    name: row.name,
    expectedAmount,
    dueDate,
    sortOrder: row.sortOrder,
    remark: row.remark ?? undefined,
    billMonth: row.billMonth ?? undefined,
    status: row.status as MerchantPaymentNode['status'],
    progress: computePaymentNodeProgress(expectedAmount, dueDate, meta.collectedAmount),
    collectedAmount: meta.collectedAmount,
    recordCount: meta.recordCount,
    createdBy: meta.createdBy,
    updatedBy: meta.updatedBy,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  }
}

export function mapMerchantPaymentNodeAuditRow(
  row: PaymentNodeAuditRow,
): MerchantPaymentNodeAuditLog {
  return {
    id: row.id,
    paymentNodeId: row.paymentNodeId,
    merchantId: row.merchantId,
    action: row.action as MerchantPaymentNodeAuditLog['action'],
    operatorName: row.operatorName,
    occurredAt: toIso(row.occurredAt)!,
    changes: (row.changes as MerchantPaymentNodeAuditLog['changes']) ?? undefined,
    remark: row.remark ?? undefined,
  }
}
