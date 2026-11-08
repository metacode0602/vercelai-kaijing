/**
 * 售后详情页 related-info 行形状映射。
 * 主路径已走 tRPC `aftersale` → dataaccess → PostgreSQL；
 * 原 aftersale-store 兼容壳（localStorage demo store）删除后，仅保留这三个纯映射函数。
 * @see docs/design/cost-finance-production-closure.md §9
 */

export function toRelatedReturnShape(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    reverseOrderId: row.reverseOrderId,
    externalReturnId: row.externalReturnId,
    order: row.order,
    sku: row.sku,
    tracking: row.tracking,
    returnShipmentId: row.returnShipmentId,
    receivedAt: row.receivedAt,
    qty: row.qty,
    qc: row.qc,
    qcDecision: row.qcDecision,
    inspectedAt: row.inspectedAt || '—',
    restock: row.restock,
    scrap: row.scrap,
    status: row.status,
    platformStatus: row.platformStatus,
    refundId: row.refundId,
    refundStatus: row.refundStatus,
    warehouse: row.warehouse,
    bin: row.bin,
    shop: row.shop,
  }
}

export function toRelatedCancelShape(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    reverseOrderId: row.reverseOrderId,
    externalReverseId: row.externalReverseId,
    order: row.order,
    shop: row.shop,
    sku: row.sku,
    type: row.type,
    platformSync: row.platformSync,
    platformStatus: row.platformStatus,
    platformUpdatedAt: row.platformUpdatedAt,
    refundId: row.refundId,
    refundStatus: row.refundStatus,
    refundedAt: row.refundedAt || '—',
    refund: row.refund,
    currency: row.currency,
    releaseReserved: row.releaseReserved,
    status: row.status,
    reason: row.reason,
    reasonCode: row.reasonCode,
  }
}

export function toRelatedTicketShape(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    reverseOrderId: row.reverseOrderId,
    externalReverseId: row.externalReverseId,
    order: row.order,
    sku: row.sku,
    type: row.type,
    reason: row.reason,
    refund: row.refund,
    currency: row.currency,
    returned: row.returned,
    qc: row.qc,
    qcDecision: row.qcDecision,
    status: row.status,
    platformStatus: row.platformStatus,
    platformUpdatedAt: row.platformUpdatedAt,
    returnShipmentId: row.returnShipmentId || '—',
    returnTracking: row.returnTracking || '—',
    refundId: row.refundId,
    refundStatus: row.refundStatus,
    refundedAt: row.refundedAt || '—',
    refundMethod: row.refundMethod,
    shop: row.shop,
  }
}
