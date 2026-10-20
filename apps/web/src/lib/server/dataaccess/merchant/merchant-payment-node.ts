import { db } from '@/lib/db'
import { staffDataAccess } from '@/lib/server/dataaccess/crm/staff'
import {
  mapMerchantPaymentNodeAuditRow,
  mapMerchantPaymentNodeRow,
} from '@/lib/server/mappers/merchant-payment-node'
import type { MerchantPaymentNode } from '@/lib/types/merchant'
import {
  merchant,
  merchantActivity,
  merchantPaymentNode,
  merchantPaymentNodeAuditLog,
  merchantRechargeRecord,
  userStaff,
} from '@workspace/db/schema'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'

function newId() {
  return crypto.randomUUID()
}

async function resolveOperator(user: {
  id: string
  email?: string | null
  name?: string | null
}) {
  const staffId = await staffDataAccess.resolveStaffIdForAuthUser(user)
  if (!staffId) throw new Error('当前账号未关联员工信息')
  const staff = await db.query.userStaff.findFirst({
    where: eq(userStaff.id, staffId),
    columns: { id: true, displayName: true },
  })
  if (!staff) throw new Error('员工信息不存在')
  return { staffId, operatorName: staff.displayName }
}

export type MerchantPaymentNodeWriteInput = {
  name: string
  expectedAmount: number
  dueDate: string
  sortOrder?: number
  remark?: string
  billMonth?: string | null
}

async function loadNodeStats(nodeIds: string[]) {
  if (nodeIds.length === 0) return new Map<string, { collectedAmount: number; recordCount: number }>()

  const rows = await db
    .select({
      paymentNodeId: merchantRechargeRecord.paymentNodeId,
      collectedAmount: sql<string>`coalesce(sum(case when ${merchantRechargeRecord.status} = 'completed' then ${merchantRechargeRecord.amount} else 0 end), 0)`,
      recordCount: sql<number>`count(*)::int`,
    })
    .from(merchantRechargeRecord)
    .where(inArray(merchantRechargeRecord.paymentNodeId, nodeIds))
    .groupBy(merchantRechargeRecord.paymentNodeId)

  const map = new Map<string, { collectedAmount: number; recordCount: number }>()
  for (const row of rows) {
    if (!row.paymentNodeId) continue
    map.set(row.paymentNodeId, {
      collectedAmount: Number(row.collectedAmount),
      recordCount: row.recordCount,
    })
  }
  return map
}

async function enrichNodes(rows: (typeof merchantPaymentNode.$inferSelect)[]) {
  if (rows.length === 0) return []

  const stats = await loadNodeStats(rows.map((r) => r.id))
  const result: MerchantPaymentNode[] = []

  for (const row of rows) {
    const nodeStats = stats.get(row.id) ?? { collectedAmount: 0, recordCount: 0 }
    const createdBy = row.createdByStaffId
      ? (
          await db.query.userStaff.findFirst({
            where: eq(userStaff.id, row.createdByStaffId),
            columns: { displayName: true },
          })
        )?.displayName
      : undefined
    const updatedBy = row.updatedByStaffId
      ? (
          await db.query.userStaff.findFirst({
            where: eq(userStaff.id, row.updatedByStaffId),
            columns: { displayName: true },
          })
        )?.displayName
      : undefined
    result.push(
      mapMerchantPaymentNodeRow(row, {
        ...nodeStats,
        createdBy,
        updatedBy,
      }),
    )
  }
  return result
}

export const merchantPaymentNodeDataAccess = {
  async listByMerchantId(merchantId: string) {
    const rows = await db
      .select()
      .from(merchantPaymentNode)
      .where(
        and(eq(merchantPaymentNode.merchantId, merchantId), eq(merchantPaymentNode.status, 'active')),
      )
      .orderBy(asc(merchantPaymentNode.sortOrder), asc(merchantPaymentNode.dueDate))
    return enrichNodes(rows)
  },

  async getById(paymentNodeId: string) {
    const row = await db.query.merchantPaymentNode.findFirst({
      where: eq(merchantPaymentNode.id, paymentNodeId),
    })
    if (!row) return null
    const [node] = await enrichNodes([row])
    return node ?? null
  },

  async listAuditByMerchantId(merchantId: string, limit = 20) {
    const rows = await db
      .select()
      .from(merchantPaymentNodeAuditLog)
      .where(eq(merchantPaymentNodeAuditLog.merchantId, merchantId))
      .orderBy(desc(merchantPaymentNodeAuditLog.occurredAt))
      .limit(limit)
    return rows.map(mapMerchantPaymentNodeAuditRow)
  },

  async listAuditByNodeId(paymentNodeId: string) {
    const rows = await db
      .select()
      .from(merchantPaymentNodeAuditLog)
      .where(eq(merchantPaymentNodeAuditLog.paymentNodeId, paymentNodeId))
      .orderBy(desc(merchantPaymentNodeAuditLog.occurredAt))
    return rows.map(mapMerchantPaymentNodeAuditRow)
  },

  async create(
    merchantId: string,
    input: MerchantPaymentNodeWriteInput,
    user: { id: string; email?: string | null; name?: string | null },
  ) {
    const merchantRow = await db.query.merchant.findFirst({
      where: eq(merchant.id, merchantId),
      columns: { id: true },
    })
    if (!merchantRow) throw new Error('商户不存在')

    const operator = await resolveOperator(user)
    const nodeId = newId()
    const now = new Date()

    let sortOrder = input.sortOrder
    if (sortOrder == null) {
      const [maxRow] = await db
        .select({ max: sql<number>`coalesce(max(${merchantPaymentNode.sortOrder}), -1)` })
        .from(merchantPaymentNode)
        .where(eq(merchantPaymentNode.merchantId, merchantId))
      sortOrder = (maxRow?.max ?? -1) + 1
    }

    await db.insert(merchantPaymentNode).values({
      id: nodeId,
      merchantId,
      name: input.name.trim(),
      expectedAmount: String(input.expectedAmount),
      dueDate: input.dueDate,
      sortOrder,
      remark: input.remark?.trim() || null,
      billMonth: input.billMonth?.trim() || null,
      status: 'active',
      createdByStaffId: operator.staffId,
      createdAt: now,
      updatedAt: now,
    })

    await db.insert(merchantPaymentNodeAuditLog).values({
      id: newId(),
      paymentNodeId: nodeId,
      merchantId,
      action: 'create',
      operatorStaffId: operator.staffId,
      operatorName: operator.operatorName,
      occurredAt: now,
      remark: `创建回款节点「${input.name.trim()}」`,
    })

    await db.insert(merchantActivity).values({
      id: newId(),
      merchantId,
      type: 'payment_node_created',
      title: `新增回款节点「${input.name.trim()}」`,
      description: `计划 ¥${input.expectedAmount.toLocaleString('zh-CN')} · 到期 ${input.dueDate}`,
      authorStaffId: operator.staffId,
      authorName: operator.operatorName,
      authorRole: 'staff',
      refDomain: 'payment_node',
      refId: nodeId,
      occurredAt: now,
      createdAt: now,
    })

    return (await this.getById(nodeId))!
  },

  async update(
    paymentNodeId: string,
    input: MerchantPaymentNodeWriteInput,
    user: { id: string; email?: string | null; name?: string | null },
  ) {
    const prev = await db.query.merchantPaymentNode.findFirst({
      where: eq(merchantPaymentNode.id, paymentNodeId),
    })
    if (!prev) throw new Error('回款节点不存在')
    if (prev.status === 'cancelled') throw new Error('已作废的回款节点不可编辑')

    const operator = await resolveOperator(user)
    const now = new Date()
    const changes: Record<string, { from: unknown; to: unknown }> = {}

    if (prev.name !== input.name.trim()) {
      changes.name = { from: prev.name, to: input.name.trim() }
    }
    if (Number(prev.expectedAmount) !== input.expectedAmount) {
      changes.expectedAmount = { from: Number(prev.expectedAmount), to: input.expectedAmount }
    }
    if (String(prev.dueDate) !== input.dueDate) {
      changes.dueDate = { from: String(prev.dueDate), to: input.dueDate }
    }
    if (input.sortOrder != null && prev.sortOrder !== input.sortOrder) {
      changes.sortOrder = { from: prev.sortOrder, to: input.sortOrder }
    }
    if ((prev.remark ?? '') !== (input.remark?.trim() ?? '')) {
      changes.remark = { from: prev.remark ?? '', to: input.remark?.trim() ?? '' }
    }
    const nextBillMonth = input.billMonth?.trim() || null
    if ((prev.billMonth ?? null) !== nextBillMonth) {
      changes.billMonth = { from: prev.billMonth ?? '', to: nextBillMonth ?? '' }
    }

    await db
      .update(merchantPaymentNode)
      .set({
        name: input.name.trim(),
        expectedAmount: String(input.expectedAmount),
        dueDate: input.dueDate,
        sortOrder: input.sortOrder ?? prev.sortOrder,
        remark: input.remark?.trim() || null,
        billMonth: nextBillMonth,
        updatedByStaffId: operator.staffId,
        updatedAt: now,
      })
      .where(eq(merchantPaymentNode.id, paymentNodeId))

    await db.insert(merchantPaymentNodeAuditLog).values({
      id: newId(),
      paymentNodeId,
      merchantId: prev.merchantId,
      action: 'update',
      operatorStaffId: operator.staffId,
      operatorName: operator.operatorName,
      occurredAt: now,
      changes: Object.keys(changes).length ? changes : undefined,
      remark: '修改回款节点',
    })

    await db.insert(merchantActivity).values({
      id: newId(),
      merchantId: prev.merchantId,
      type: 'payment_node_updated',
      title: `修改回款节点「${input.name.trim()}」`,
      description:
        Object.keys(changes).length > 0
          ? `变更：${Object.keys(changes).join('、')}`
          : undefined,
      authorStaffId: operator.staffId,
      authorName: operator.operatorName,
      authorRole: 'staff',
      refDomain: 'payment_node',
      refId: paymentNodeId,
      occurredAt: now,
      createdAt: now,
    })

    return (await this.getById(paymentNodeId))!
  },

  async cancel(
    paymentNodeId: string,
    user: { id: string; email?: string | null; name?: string | null },
  ) {
    const prev = await db.query.merchantPaymentNode.findFirst({
      where: eq(merchantPaymentNode.id, paymentNodeId),
    })
    if (!prev) throw new Error('回款节点不存在')
    if (prev.status === 'cancelled') throw new Error('回款节点已作废')

    const linkedRecords = await db
      .select({ id: merchantRechargeRecord.id })
      .from(merchantRechargeRecord)
      .where(eq(merchantRechargeRecord.paymentNodeId, paymentNodeId))
      .limit(1)
    if (linkedRecords.length > 0) {
      throw new Error('该节点下已有回款记录，不可作废')
    }

    const operator = await resolveOperator(user)
    const now = new Date()

    await db
      .update(merchantPaymentNode)
      .set({
        status: 'cancelled',
        updatedByStaffId: operator.staffId,
        updatedAt: now,
      })
      .where(eq(merchantPaymentNode.id, paymentNodeId))

    await db.insert(merchantPaymentNodeAuditLog).values({
      id: newId(),
      paymentNodeId,
      merchantId: prev.merchantId,
      action: 'delete',
      operatorStaffId: operator.staffId,
      operatorName: operator.operatorName,
      occurredAt: now,
      remark: `作废回款节点「${prev.name}」`,
    })

    await db.insert(merchantActivity).values({
      id: newId(),
      merchantId: prev.merchantId,
      type: 'payment_node_deleted',
      title: `作废回款节点「${prev.name}」`,
      authorStaffId: operator.staffId,
      authorName: operator.operatorName,
      authorRole: 'staff',
      refDomain: 'payment_node',
      refId: paymentNodeId,
      occurredAt: now,
      createdAt: now,
    })
  },

  async assertActiveNodeForMerchant(paymentNodeId: string, merchantId: string) {
    const row = await db.query.merchantPaymentNode.findFirst({
      where: and(
        eq(merchantPaymentNode.id, paymentNodeId),
        eq(merchantPaymentNode.merchantId, merchantId),
        eq(merchantPaymentNode.status, 'active'),
      ),
      columns: { id: true },
    })
    if (!row) throw new Error('回款节点不存在或已作废')
  },
}

export async function resolveMerchantIdForPaymentNode(
  paymentNodeId: string,
): Promise<string | null> {
  const row = await db.query.merchantPaymentNode.findFirst({
    where: eq(merchantPaymentNode.id, paymentNodeId),
    columns: { merchantId: true },
  })
  return row?.merchantId ?? null
}
