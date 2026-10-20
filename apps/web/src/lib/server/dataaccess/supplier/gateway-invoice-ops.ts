import { db } from '@/lib/db'
import {
  gatewayNode,
  invoiceRequest,
  invoice,
  supplierBill,
  entityStateTransitionLog,
  type GatewayNodeRow,
  type InvoiceRequestRow,
} from '@workspace/db'
import { and, count, desc, eq, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { TRPCError } from '@trpc/server'

export type PaginatedResult<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** 发票申请列表行：在申请单基础上带上已开具发票的 id/作废态，供运营端作废操作。 */
export type InvoiceRequestListItem = InvoiceRequestRow & {
  invoiceId: string | null
  invoiceNo: string | null
  invoiceVoidStatus: string | null
  invoiceVoidedAt: string | null
  invoiceVoidReason: string | null
}

export const gatewayNodeOpsDataAccess = {
  async listAll(filters: {
    supplierId?: string
    auditStatus?: string
    page: number
    pageSize: number
  }): Promise<PaginatedResult<GatewayNodeRow>> {
    const page = Math.max(1, filters.page)
    const pageSize = Math.min(100, Math.max(1, filters.pageSize))

    const conditions: SQL[] = []
    if (filters.supplierId) {
      conditions.push(eq(gatewayNode.supplierId, filters.supplierId))
    }
    if (filters.auditStatus) {
      conditions.push(eq(gatewayNode.auditStatus, filters.auditStatus))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [totalRow] = await db
      .select({ total: count() })
      .from(gatewayNode)
      .where(where)

    const total = Number(totalRow?.total ?? 0)
    const offset = (page - 1) * pageSize

    const rows = await db.query.gatewayNode.findMany({
      where,
      orderBy: [desc(gatewayNode.createdAt)],
      limit: pageSize,
      offset,
    })

    return { items: rows, total, page, pageSize }
  },

  async reviewGatewayNode(
    nodeId: string,
    staffId: string,
    auditStatus: 'approved' | 'rejected',
    auditRemark?: string,
  ): Promise<void> {
    const node = await db.query.gatewayNode.findFirst({
      where: eq(gatewayNode.id, nodeId),
    })

    if (!node) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '网关节点不存在' })
    }

    if (node.auditStatus !== 'pending') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '节点已审核' })
    }

    await db
      .update(gatewayNode)
      .set({
        auditStatus,
        auditedBy: staffId,
        auditedAt: new Date(),
        auditRemark,
        status: auditStatus === 'approved' ? 'ready' : 'pending',
      })
      .where(eq(gatewayNode.id, nodeId))
  },
}

export const invoiceOpsDataAccess = {
  async listRequests(filters: {
    supplierId?: string
    status?: string
    page: number
    pageSize: number
  }): Promise<PaginatedResult<InvoiceRequestListItem>> {
    const page = Math.max(1, filters.page)
    const pageSize = Math.min(100, Math.max(1, filters.pageSize))

    const conditions: SQL[] = []
    if (filters.supplierId) {
      conditions.push(eq(invoiceRequest.supplierId, filters.supplierId))
    }
    if (filters.status) {
      conditions.push(eq(invoiceRequest.status, filters.status))
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined

    const [totalRow] = await db
      .select({ total: count() })
      .from(invoiceRequest)
      .where(where)

    const total = Number(totalRow?.total ?? 0)
    const offset = (page - 1) * pageSize

    // leftJoin invoice：运营端要能对已开具的发票做「作废」，必须拿到 invoice.id
    // 和 void_status 才知道按钮是否可点、是否已作废过。
    // 用显式 select 而非 db.query.*.findMany()，避免隐含列泄露。
    const rows = await db
      .select({
        request: invoiceRequest,
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
        invoiceVoidStatus: invoice.voidStatus,
        invoiceVoidedAt: invoice.voidedAt,
        invoiceVoidReason: invoice.voidReason,
      })
      .from(invoiceRequest)
      .leftJoin(invoice, eq(invoice.invoiceRequestId, invoiceRequest.id))
      .where(where)
      .orderBy(desc(invoiceRequest.createdAt))
      .limit(pageSize)
      .offset(offset)

    const items: InvoiceRequestListItem[] = rows.map((row) => ({
      ...row.request,
      invoiceId: row.invoiceId,
      invoiceNo: row.invoiceNo,
      invoiceVoidStatus: row.invoiceVoidStatus,
      invoiceVoidedAt: row.invoiceVoidedAt?.toISOString() ?? null,
      invoiceVoidReason: row.invoiceVoidReason,
    }))

    return { items, total, page, pageSize }
  },

  async reviewInvoiceRequest(
    requestId: string,
    /** user_staff.id；reviewedBy 列为可空外键，无法解析到员工时传 null */
    staffId: string | null,
    action: 'approve' | 'reject',
    rejectionReason?: string,
  ): Promise<void> {
    const request = await db.query.invoiceRequest.findFirst({
      where: eq(invoiceRequest.id, requestId),
    })

    if (!request) {
      throw new TRPCError({ code: 'NOT_FOUND', message: '发票申请不存在' })
    }

    if (request.status !== 'pending') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '申请已审核' })
    }

    // status='pending' 守卫写入 SQL：只查后写有竞态，两个运营同时点「通过/驳回」
    // 会都通过检查，后写覆盖前写，审核记录（reviewedBy）与实际状态不一致。
    const reviewed = await db
      .update(invoiceRequest)
      .set({
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewedBy: staffId,
        reviewedAt: new Date(),
        rejectionReason: action === 'reject' ? rejectionReason : null,
      })
      .where(
        and(eq(invoiceRequest.id, requestId), eq(invoiceRequest.status, 'pending')),
      )
      .returning({ id: invoiceRequest.id })

    if (reviewed.length === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '申请已审核' })
    }
  },

  async issueInvoice(data: {
    requestId: string
    invoiceNo: string
    invoiceCode?: string
    taxRate: number
    issuerName?: string
    issuerTaxNo?: string
    pdfUrl: string
    pdfStorageKey?: string
    fileMimeType?: string
    fileSize?: number
    fileOriginalName?: string
  }): Promise<{ id: string }> {
    const issuedAt = new Date()

    try {
      // 事务化（W-21）：原实现「插发票 → 改申请状态」两条独立语句，
      // 中间失败会留下「发票已开但申请仍 approved」的状态，
      // 运营可对同一申请再次开票 → 重复开票、供应商重复收款。
      return await db.transaction(async (tx) => {
        const [request] = await tx
          .select({
            id: invoiceRequest.id,
            supplierId: invoiceRequest.supplierId,
            invoiceType: invoiceRequest.invoiceType,
            requestAmount: invoiceRequest.requestAmount,
            billMonthlyId: invoiceRequest.billMonthlyId,
            status: invoiceRequest.status,
          })
          .from(invoiceRequest)
          .where(eq(invoiceRequest.id, data.requestId))
          .limit(1)

        if (!request) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '发票申请不存在' })
        }

        if (request.status !== 'approved') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '申请未审核通过' })
        }

        // 金额回校（W-21 核心）：开票金额必须等于账单当前金额。
        // 申请时的 requestAmount 只是快照；账单在申请 → 开票之间可能因
        // 付款调整（W-7 adjustmentAmount）而变动，此时按快照开票会与账单对不上，
        // 造成发票金额 ≠ 结算金额。差额超 1 分即拒绝，要求重新申请。
        const [bill] = await tx
          .select({
            id: supplierBill.id,
            finalAmount: supplierBill.finalAmount,
            status: supplierBill.status,
          })
          .from(supplierBill)
          .where(eq(supplierBill.id, request.billMonthlyId))
          .limit(1)

        if (!bill) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '关联账单不存在' })
        }

        // 状态复核：申请时（apps/supplier invoice.ts:312）已要求账单为 confirmed，
        // 但申请 → 开票之间账单状态可能变化（争议回退、数据修正等）。
        // 金额回校只能保证「金额没变」，不能保证「账单仍处于可开票状态」，
        // 因此这里必须独立再查一次 status，不能只依赖申请时的快照。
        if (bill.status !== 'confirmed' && bill.status !== 'paid') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `账单当前状态为 ${bill.status}，不能开票；请让供应商撤销申请后重新提交`,
          })
        }

        const billAmount = Number(bill.finalAmount)
        const requestAmount = Number(request.requestAmount)
        if (Math.abs(billAmount - requestAmount) > 0.01) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `账单金额已变为 ¥${billAmount.toFixed(2)}，与申请金额 ¥${requestAmount.toFixed(2)} 不一致，请让供应商重新申请发票`,
          })
        }

        // 并发重复开票由 invoice.invoice_request_id 的 UNIQUE 约束（0017 迁移）
        // 在数据库层拦截，这里保留前置检查只为给出可读错误。
        const [existingInvoice] = await tx
          .select({ id: invoice.id })
          .from(invoice)
          .where(eq(invoice.invoiceRequestId, data.requestId))
          .limit(1)

        if (existingInvoice) {
          throw new TRPCError({ code: 'CONFLICT', message: '发票已开具' })
        }

        const taxAmount = requestAmount * data.taxRate
        const amountWithoutTax = requestAmount - taxAmount

        const [newInvoice] = await tx
          .insert(invoice)
          .values({
            id: createId(),
            invoiceRequestId: data.requestId,
            supplierId: request.supplierId,
            invoiceNo: data.invoiceNo,
            invoiceCode: data.invoiceCode || null,
            invoiceType: request.invoiceType,
            totalAmount: request.requestAmount,
            taxAmount: taxAmount.toFixed(4),
            amountWithoutTax: amountWithoutTax.toFixed(4),
            taxRate: data.taxRate.toString(),
            issuerName: data.issuerName || null,
            issuerTaxNo: data.issuerTaxNo || null,
            issuedAt,
            pdfUrl: data.pdfUrl,
            pdfStorageKey: data.pdfStorageKey || null,
            fileMimeType: data.fileMimeType || null,
            fileSize: data.fileSize ?? null,
            fileOriginalName: data.fileOriginalName || null,
            voidStatus: 'normal',
          })
          .returning({ id: invoice.id })

        if (!newInvoice) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '发票创建失败' })
        }

        // 状态守卫同样进 SQL，避免与运营侧并发操作互相覆盖
        const issued = await tx
          .update(invoiceRequest)
          .set({ status: 'issued' })
          .where(
            and(
              eq(invoiceRequest.id, data.requestId),
              eq(invoiceRequest.status, 'approved'),
            ),
          )
          .returning({ id: invoiceRequest.id })

        if (issued.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '申请状态已变更，无法开具' })
        }

        return newInvoice
      })
    } catch (error) {
      if (error instanceof TRPCError) throw error
      // 并发下绕过应用层检查时由唯一索引 invoice_active_request_uk 拦截
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === '23505'
      ) {
        throw new TRPCError({ code: 'CONFLICT', message: '发票已开具' })
      }
      throw error
    }
  },

  /**
   * 作废已开具的发票。
   *
   * 此前 schema 已有 `void_status` / `voided_at` / `void_reason` /
   * `red_flush_invoice_id`，但**没有任何作废入口** —— 发票开错后只能直接改库。
   *
   * 关于「作废是否释放账单」（W-22①）：**刻意不回写 `supplierBill.status`**。
   * 账单状态机是收款口径（pending → confirmed → paid），发票是票据口径
   * （pending → approved → issued → voided），两者本就独立推进。作废一张发票
   * 只说明票据作废，不代表这笔钱没收到；若把两者联动，误作废会直接把已收款
   * 账单打回未结算，反而制造资损。账单是否需要重开由财务单独决策。
   */
  async voidInvoice(
    invoiceId: string,
    reason: string,
    actor: { operatorStaffId: string | null },
  ): Promise<{ id: string }> {
    const trimmed = reason.trim()
    if (!trimmed) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '请填写作废原因' })
    }
    const voidedAt = new Date()

    return await db.transaction(async (tx) => {
      // 作废前先取快照：要一并拿到 invoice_request_id 才能把申请单退回 approved。
      const before = await tx
        .select({
          id: invoice.id,
          invoiceRequestId: invoice.invoiceRequestId,
          invoiceNo: invoice.invoiceNo,
          voidStatus: invoice.voidStatus,
        })
        .from(invoice)
        .where(eq(invoice.id, invoiceId))
        .limit(1)

      const snapshot = before[0]
      if (!snapshot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '发票不存在' })
      }
      if (snapshot.voidStatus !== 'normal') {
        throw new TRPCError({ code: 'CONFLICT', message: '该发票已作废，请勿重复操作' })
      }

      // 状态守卫进 SQL：并发下两个运营同时作废只能成功一次。
      const updated = await tx
        .update(invoice)
        .set({ voidStatus: 'voided', voidedAt, voidReason: trimmed })
        .where(and(eq(invoice.id, invoiceId), eq(invoice.voidStatus, 'normal')))
        .returning({ id: invoice.id })

      if (updated.length === 0) {
        throw new TRPCError({ code: 'CONFLICT', message: '该发票已被作废，请勿重复操作' })
      }

      // 申请单退回 approved：作废后应能重新开票，否则申请单会永久卡在 issued。
      // 注意 invoice.invoice_request_id 上的 UNIQUE 是**全量**唯一，作废后仍占用，
      // 因此重开必须新建申请单走新链路，不能复用原单 —— 这一点在 W-21 已确认。
      await tx
        .update(invoiceRequest)
        .set({ status: 'approved' })
        .where(
          and(
            eq(invoiceRequest.id, snapshot.invoiceRequestId),
            eq(invoiceRequest.status, 'issued'),
          ),
        )

      await tx.insert(entityStateTransitionLog).values({
        id: createId(),
        entityType: 'invoice',
        entityId: snapshot.id,
        fromState: 'normal',
        toState: 'voided',
        operatorStaffId: actor.operatorStaffId,
        reasonCode: 'INVOICE_VOIDED',
        occurredAt: voidedAt,
        payload: {
          invoiceNo: snapshot.invoiceNo,
          reason: trimmed,
          voidedAt: voidedAt.toISOString(),
        },
      })

      return { id: snapshot.id }
    })
  },
}
