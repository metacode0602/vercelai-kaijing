import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  inventoryBalances,
  inventoryMovements,
  productVariants,
  purchaseOrderLines,
  purchaseOrders,
  purchaseReceiptLines,
  purchaseReceipts,
  purchaseRequestLines,
  purchaseRequests,
  stockInbounds,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  formatDateOnly,
  formatStamp,
  money,
  toUiInboundSource,
  toUiInboundStatus,
  toUiPoStatus,
  toUiPrStatus,
  toUiReceiptStatus,
  type UiPurchaseOrderStatus,
  type UiPurchaseReceiptStatus,
  type UiPurchaseRequestStatus,
  type UiStockInboundSourceType,
  type UiStockInboundStatus,
} from '@/lib/server/mappers/purchase'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'
import { recomputeStockAlert } from '@/lib/server/dataaccess/stock-alerts'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type PurchaseRequestLineDto = {
  id: string
  lineNo: number
  sku: string
  supplierSku: string
  qty: number
  unitPrice: number
  amount: number
  remark: string
}

export type PurchaseRequestDto = {
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
  lines: PurchaseRequestLineDto[]
}

export type PurchaseRequestListRow = Omit<PurchaseRequestDto, 'lines'> & {
  lineCount: number
  firstSku: string
  totalQty: number
}

export type PurchaseOrderLineDto = {
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

export type PurchaseOrderDto = {
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
  lines: PurchaseOrderLineDto[]
}

export type PurchaseOrderListRow = Omit<PurchaseOrderDto, 'lines'> & {
  lineCount: number
  firstSku: string
}

export type PurchaseReceiptLineDto = {
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

export type PurchaseReceiptDto = {
  id: string
  receiptNo: string
  purchaseOrderId: string
  supplier: string
  warehouse: string
  status: UiPurchaseReceiptStatus
  batchNo: string
  arrivedAt: string
  carrier: string
  trackingNo: string
  receivedBy: string
  deliveryNote: string
  remark: string
  qcNo: string
  qcInspector: string
  qcCompletedAt: string
  lines: PurchaseReceiptLineDto[]
  inboundIds: string[]
}

export type PurchaseReceiptListRow = Omit<PurchaseReceiptDto, 'lines' | 'inboundIds'> & {
  lineCount: number
  firstSku: string
  totalArrived: number
  totalPassed: number
  totalFailed: number
  inboundCount: number
}

export type StockInboundDto = {
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

function yearPrefix() {
  return new Date().getFullYear()
}

async function nextDocNo(
  db: DbLike,
  organizationId: string,
  table: 'pr' | 'po' | 'rcv' | 'inb' | 'qc',
): Promise<string> {
  const year = yearPrefix()
  if (table === 'pr') {
    const rows = await db
      .select({ requestNo: purchaseRequests.requestNo })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.organizationId, organizationId))
    const max = rows.reduce((m, r) => {
      const matched = new RegExp(`^PR-${year}-(\\d+)$`).exec(r.requestNo)
      return matched ? Math.max(m, Number(matched[1])) : m
    }, 0)
    return `PR-${year}-${String(max + 1).padStart(4, '0')}`
  }
  if (table === 'po') {
    const rows = await db
      .select({ poNo: purchaseOrders.poNo })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.organizationId, organizationId))
    const max = rows.reduce((m, r) => {
      const matched = new RegExp(`^PO-${year}-(\\d+)$`).exec(r.poNo)
      return matched ? Math.max(m, Number(matched[1])) : m
    }, 0)
    return `PO-${year}-${String(max + 1).padStart(4, '0')}`
  }
  if (table === 'rcv') {
    const rows = await db
      .select({ receiptNo: purchaseReceipts.receiptNo })
      .from(purchaseReceipts)
      .where(eq(purchaseReceipts.organizationId, organizationId))
    const max = rows.reduce((m, r) => {
      const matched = new RegExp(`^RCV-${year}-(\\d+)$`).exec(r.receiptNo)
      return matched ? Math.max(m, Number(matched[1])) : m
    }, 0)
    return `RCV-${year}-${String(max + 1).padStart(4, '0')}`
  }
  if (table === 'qc') {
    const rows = await db
      .select({ qcNo: purchaseReceipts.qcNo })
      .from(purchaseReceipts)
      .where(eq(purchaseReceipts.organizationId, organizationId))
    const max = rows.reduce((m, r) => {
      if (!r.qcNo) return m
      const matched = new RegExp(`^QC-${year}-(\\d+)$`).exec(r.qcNo)
      return matched ? Math.max(m, Number(matched[1])) : m
    }, 0)
    return `QC-${year}-${String(max + 1).padStart(4, '0')}`
  }
  const rows = await db
    .select({ inboundNo: stockInbounds.inboundNo })
    .from(stockInbounds)
    .where(eq(stockInbounds.organizationId, organizationId))
  const max = rows.reduce((m, r) => {
    const matched = new RegExp(`^INB-${year}-(\\d+)$`).exec(r.inboundNo)
    return matched ? Math.max(m, Number(matched[1])) : m
  }, 0)
  return `INB-${year}-${String(max + 1).padStart(4, '0')}`
}

async function resolveVariantBySku(db: DbLike, organizationId: string, skuCode: string) {
  const [row] = await db
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      skuCode: productVariants.skuCode,
    })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        or(eq(productVariants.skuCode, skuCode), eq(productVariants.sku, skuCode)),
      ),
    )
    .limit(1)
  if (!row) return null
  return { id: row.id, skuCode: row.skuCode || row.sku }
}

function mapRequest(
  header: typeof purchaseRequests.$inferSelect,
  lines: (typeof purchaseRequestLines.$inferSelect)[],
): PurchaseRequestDto {
  return {
    id: header.id,
    requestNo: header.requestNo,
    supplier: header.supplierName,
    warehouse: header.warehouseCode,
    currency: header.currency,
    totalAmount: money(header.totalAmount),
    expectedAt: header.expectedArrivalAt ?? '',
    reason: header.reason ?? '',
    remark: header.remark ?? '',
    applicant: header.applicantName,
    approver: header.approverName,
    opinion: header.opinion ?? '—',
    status: toUiPrStatus(header.status),
    createdAt: formatDateOnly(header.createdAt),
    submittedAt: formatStamp(header.submittedAt),
    convertedPoId: header.convertedPoId ?? '',
    lines: lines
      .slice()
      .sort((a, b) => a.lineNo - b.lineNo)
      .map((line) => ({
        id: line.id,
        lineNo: line.lineNo,
        sku: line.skuCode,
        supplierSku: line.supplierSku ?? '',
        qty: line.qty,
        unitPrice: money(line.unitPrice),
        amount: money(line.amount),
        remark: line.remark ?? '',
      })),
  }
}

function toRequestListRow(dto: PurchaseRequestDto): PurchaseRequestListRow {
  const { lines, ...rest } = dto
  return {
    ...rest,
    lineCount: lines.length,
    firstSku: lines[0]?.sku ?? '—',
    totalQty: lines.reduce((s, l) => s + l.qty, 0),
  }
}

function mapOrder(
  header: typeof purchaseOrders.$inferSelect,
  lines: (typeof purchaseOrderLines.$inferSelect)[],
): PurchaseOrderDto {
  return {
    id: header.id,
    poNo: header.poNo,
    sourceRequest: header.sourceRequestNo ?? '',
    supplier: header.supplierName,
    warehouse: header.warehouseCode,
    currency: header.currency,
    totalAmount: money(header.totalAmount),
    expectedAt: header.expectedArrivalAt ?? '',
    status: toUiPoStatus(header.status),
    createdAt: formatDateOnly(header.createdAt),
    lines: lines
      .slice()
      .sort((a, b) => a.lineNo - b.lineNo)
      .map((line) => ({
        id: line.id,
        lineNo: line.lineNo,
        sku: line.skuCode,
        qtyOrdered: line.qtyOrdered,
        qtyReceived: line.qtyReceived,
        qtyQcPassed: line.qtyQcPassed,
        qtyStocked: line.qtyStocked,
        unitPrice: money(line.unitPrice),
        amount: money(line.amount),
      })),
  }
}

function mapReceipt(
  header: typeof purchaseReceipts.$inferSelect,
  lines: (typeof purchaseReceiptLines.$inferSelect)[],
  inboundIds: string[],
): PurchaseReceiptDto {
  return {
    id: header.id,
    receiptNo: header.receiptNo,
    purchaseOrderId: header.poNo,
    supplier: header.supplierName,
    warehouse: header.warehouseCode,
    status: toUiReceiptStatus(header.status),
    batchNo: header.batchNo ?? '',
    arrivedAt: formatStamp(header.arrivedAt),
    carrier: header.carrier ?? '',
    trackingNo: header.trackingNo ?? '',
    receivedBy: header.receivedBy ?? '',
    deliveryNote: header.deliveryNote ?? '',
    remark: header.remark ?? '',
    qcNo: header.qcNo ?? '',
    qcInspector: header.qcInspector ?? '',
    qcCompletedAt: formatStamp(header.qcCompletedAt),
    lines: lines
      .slice()
      .sort((a, b) => a.lineNo - b.lineNo)
      .map((line) => ({
        id: line.id,
        lineNo: line.lineNo,
        poLineId: line.poLineId,
        sku: line.skuCode,
        qtyOrdered: line.qtyOrdered,
        qtyArrived: line.qtyArrived,
        qtyPendingQc: line.qtyPendingQc,
        qtyPassed: line.qtyPassed,
        qtyFailed: line.qtyFailed,
        note: line.note ?? '',
        suggestedBin: line.suggestedBin ?? '',
      })),
    inboundIds,
  }
}

function mapInbound(row: typeof stockInbounds.$inferSelect): StockInboundDto {
  return {
    id: row.id,
    inboundNo: row.inboundNo,
    sourceType: toUiInboundSource(row.sourceType),
    sourceDoc: row.sourceDoc,
    purchaseOrderId: row.poNo ?? row.purchaseOrderId ?? '',
    warehouse: row.warehouseCode,
    sku: row.skuCode,
    quantity: row.quantity,
    qcResult: row.qcResult ?? '',
    bin: row.binCode,
    operator: row.operator ?? '',
    at: formatStamp(row.shelvedAt ?? row.updatedAt),
    status: toUiInboundStatus(row.status),
    idempotencyKey: row.idempotencyKey,
    remark: row.remark ?? '',
  }
}

function buildSearch(
  q: string | undefined,
  columns: Parameters<typeof ilike>[0][],
): SQL | undefined {
  const term = q?.trim()
  if (!term) return undefined
  const pattern = `%${term}%`
  return or(...columns.map((col) => ilike(col, pattern)))
}

/* ───────── 采购申请 ───────── */

export async function listPurchaseRequests(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string } = {},
): Promise<PaginatedResult<PurchaseRequestListRow>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(purchaseRequests.organizationId, organizationId)]
  if (input.status && input.status !== '全部') {
    const dbStatus =
      (
        {
          草稿: 'draft',
          待审核: 'pending_approval',
          已批准: 'approved',
          已驳回: 'rejected',
          已转采购单: 'converted',
          已取消: 'cancelled',
        } as Record<string, string>
      )[input.status] ?? input.status
    filters.push(eq(purchaseRequests.status, dbStatus))
  }
  const search = buildSearch(input.q, [
    purchaseRequests.requestNo,
    purchaseRequests.supplierName,
    purchaseRequests.applicantName,
    purchaseRequests.reason,
  ])
  if (search) filters.push(search)
  const where = and(...filters)

  const [totalRow] = await db.select({ value: count() }).from(purchaseRequests).where(where)
  const headers = await db
    .select()
    .from(purchaseRequests)
    .where(where)
    .orderBy(desc(purchaseRequests.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const items: PurchaseRequestListRow[] = []
  for (const header of headers) {
    const lines = await db
      .select()
      .from(purchaseRequestLines)
      .where(eq(purchaseRequestLines.purchaseRequestId, header.id))
    const dto = mapRequest(header, lines)
    items.push({
      id: dto.id,
      requestNo: dto.requestNo,
      supplier: dto.supplier,
      warehouse: dto.warehouse,
      currency: dto.currency,
      totalAmount: dto.totalAmount,
      expectedAt: dto.expectedAt,
      reason: dto.reason,
      remark: dto.remark,
      applicant: dto.applicant,
      approver: dto.approver,
      opinion: dto.opinion,
      status: dto.status,
      createdAt: dto.createdAt,
      submittedAt: dto.submittedAt,
      convertedPoId: dto.convertedPoId,
      lineCount: dto.lines.length,
      firstSku: dto.lines[0]?.sku ?? '—',
      totalQty: dto.lines.reduce((s, l) => s + l.qty, 0),
    })
  }

  return { items, total: totalRow?.value ?? 0, page, pageSize }
}

export async function purchaseRequestStats(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select({ status: purchaseRequests.status, value: count() })
    .from(purchaseRequests)
    .where(eq(purchaseRequests.organizationId, organizationId))
    .groupBy(purchaseRequests.status)
  const byStatus: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    const ui = toUiPrStatus(row.status)
    byStatus[ui] = row.value
    total += row.value
  }
  return { total, byStatus }
}

export async function getPurchaseRequest(
  db: DbLike,
  organizationId: string,
  idOrNo: string,
): Promise<PurchaseRequestDto | null> {
  const [header] = await db
    .select()
    .from(purchaseRequests)
    .where(
      and(
        eq(purchaseRequests.organizationId, organizationId),
        or(eq(purchaseRequests.id, idOrNo), eq(purchaseRequests.requestNo, idOrNo)),
      ),
    )
    .limit(1)
  if (!header) return null
  const lines = await db
    .select()
    .from(purchaseRequestLines)
    .where(eq(purchaseRequestLines.purchaseRequestId, header.id))
  return mapRequest(header, lines)
}

export async function createPurchaseRequestHeader(
  db: AppDatabase,
  organizationId: string,
  input: {
    reason: string
    supplier: string
    warehouse: string
    currency: string
    expectedAt: string
    remark?: string
    applicant?: string
  },
  userId?: string | null,
): Promise<PurchaseRequestDto> {
  const requestNo = await nextDocNo(db, organizationId, 'pr')
  const id = createId()
  await db.insert(purchaseRequests).values({
    id,
    organizationId,
    requestNo,
    supplierName: input.supplier.trim(),
    warehouseCode: input.warehouse.trim() || 'WH-CN-XMN-001',
    status: 'draft',
    expectedArrivalAt: input.expectedAt || null,
    currency: input.currency || 'CNY',
    totalAmount: '0',
    reason: input.reason.trim(),
    remark: input.remark?.trim() || null,
    applicantName: input.applicant?.trim() || '当前用户',
    approverName: '',
    createdBy: userId ?? null,
  })
  return (await getPurchaseRequest(db, organizationId, id))!
}

export async function updatePurchaseRequestHeader(
  db: AppDatabase,
  organizationId: string,
  requestId: string,
  patch: Partial<{
    reason: string
    supplier: string
    warehouse: string
    currency: string
    expectedAt: string
    remark: string
    applicant: string
    approver: string
  }>,
): Promise<PurchaseRequestDto> {
  const current = await getPurchaseRequest(db, organizationId, requestId)
  if (!current) throw new Error('采购申请不存在')
  if (current.status !== '草稿' && current.status !== '已驳回') {
    throw new Error('仅草稿或已驳回可编辑主信息')
  }
  await db
    .update(purchaseRequests)
    .set({
      reason: patch.reason?.trim() ?? current.reason,
      supplierName: patch.supplier?.trim() ?? current.supplier,
      warehouseCode: patch.warehouse?.trim() ?? current.warehouse,
      currency: patch.currency?.trim() ?? current.currency,
      expectedArrivalAt: patch.expectedAt ?? current.expectedAt,
      remark: patch.remark !== undefined ? patch.remark.trim() : current.remark,
      applicantName: patch.applicant?.trim() ?? current.applicant,
      approverName: patch.approver?.trim() ?? current.approver,
      updatedAt: new Date(),
    })
    .where(and(eq(purchaseRequests.id, current.id), eq(purchaseRequests.organizationId, organizationId)))
  return (await getPurchaseRequest(db, organizationId, current.id))!
}

export async function addPurchaseRequestLine(
  db: AppDatabase,
  organizationId: string,
  requestId: string,
  input: { sku: string; supplierSku?: string; qty: number; unitPrice: number; remark?: string },
): Promise<PurchaseRequestDto> {
  const current = await getPurchaseRequest(db, organizationId, requestId)
  if (!current) throw new Error('采购申请不存在')
  if (current.status !== '草稿' && current.status !== '已驳回') {
    throw new Error('仅草稿或已驳回可添加明细')
  }
  const sku = input.sku.trim()
  if (!sku) throw new Error('请选择内部 SKU')
  const variant = await resolveVariantBySku(db, organizationId, sku)
  if (!variant) throw new Error(`未找到内部 SKU ${sku}，请先在主数据维护`)
  const qty = Math.max(1, Math.floor(input.qty) || 1)
  const unitPrice = Math.max(0, money(input.unitPrice))
  const amount = money(qty * unitPrice)
  const lineNo = current.lines.reduce((m, l) => Math.max(m, l.lineNo), 0) + 1
  await db.insert(purchaseRequestLines).values({
    id: createId(),
    organizationId,
    purchaseRequestId: current.id,
    lineNo,
    variantId: variant.id,
    skuCode: variant.skuCode,
    supplierSku: input.supplierSku?.trim() || null,
    qty,
    unitPrice: String(unitPrice),
    amount: String(amount),
    remark: input.remark?.trim() || null,
  })
  const totalAmount = money(current.totalAmount + amount)
  await db
    .update(purchaseRequests)
    .set({ totalAmount: String(totalAmount), updatedAt: new Date() })
    .where(eq(purchaseRequests.id, current.id))
  return (await getPurchaseRequest(db, organizationId, current.id))!
}

export async function submitPurchaseRequest(
  db: AppDatabase,
  organizationId: string,
  requestId: string,
  approver?: string,
): Promise<PurchaseRequestDto> {
  const current = await getPurchaseRequest(db, organizationId, requestId)
  if (!current) throw new Error('采购申请不存在')
  if (current.status !== '草稿' && current.status !== '已驳回') {
    throw new Error('仅草稿或已驳回可提交审核')
  }
  if (current.lines.length === 0) throw new Error('请先添加申请明细再提交')
  await db
    .update(purchaseRequests)
    .set({
      status: 'pending_approval',
      submittedAt: new Date(),
      approverName: approver?.trim() || current.approver || '待指派',
      opinion: '—',
      updatedAt: new Date(),
    })
    .where(eq(purchaseRequests.id, current.id))
  return (await getPurchaseRequest(db, organizationId, current.id))!
}

export async function withdrawPurchaseRequest(
  db: AppDatabase,
  organizationId: string,
  requestId: string,
): Promise<PurchaseRequestDto> {
  const current = await getPurchaseRequest(db, organizationId, requestId)
  if (!current) throw new Error('采购申请不存在')
  if (current.status !== '待审核') throw new Error('仅待审核可撤回')
  await db
    .update(purchaseRequests)
    .set({ status: 'draft', submittedAt: null, updatedAt: new Date() })
    .where(eq(purchaseRequests.id, current.id))
  return (await getPurchaseRequest(db, organizationId, current.id))!
}

export async function cancelPurchaseRequest(
  db: AppDatabase,
  organizationId: string,
  requestId: string,
): Promise<PurchaseRequestDto> {
  const current = await getPurchaseRequest(db, organizationId, requestId)
  if (!current) throw new Error('采购申请不存在')
  if (current.status === '已转采购单') throw new Error('已转采购单不可取消')
  if (current.status === '已取消') throw new Error('申请已取消')
  await db
    .update(purchaseRequests)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(purchaseRequests.id, current.id))
  return (await getPurchaseRequest(db, organizationId, current.id))!
}

export async function rejectPurchaseRequest(
  db: AppDatabase,
  organizationId: string,
  requestId: string,
  input: { opinion: string; approver?: string },
): Promise<PurchaseRequestDto> {
  const current = await getPurchaseRequest(db, organizationId, requestId)
  if (!current) throw new Error('采购申请不存在')
  if (current.status !== '待审核') throw new Error('仅待审核可驳回')
  const opinion = input.opinion.trim()
  if (!opinion) throw new Error('请填写驳回意见')
  await db
    .update(purchaseRequests)
    .set({
      status: 'rejected',
      opinion,
      approverName: input.approver?.trim() || current.approver || '当前审核人',
      updatedAt: new Date(),
    })
    .where(eq(purchaseRequests.id, current.id))
  return (await getPurchaseRequest(db, organizationId, current.id))!
}

export async function approveAndConvertPurchaseRequest(
  db: AppDatabase,
  organizationId: string,
  requestId: string,
  input: { opinion?: string; approver?: string } = {},
): Promise<{ request: PurchaseRequestDto; order: PurchaseOrderDto }> {
  return db.transaction(async (tx) => {
    const current = await getPurchaseRequest(tx as DbLike, organizationId, requestId)
    if (!current) throw new Error('采购申请不存在')
    if (current.status !== '待审核' && current.status !== '已批准') {
      throw new Error('仅待审核或已批准可转采购单')
    }
    if (current.lines.length === 0) throw new Error('申请无明细，无法转单')

    const poNo = await nextDocNo(tx, organizationId, 'po')
    const poId = createId()
    const totalAmount = String(current.totalAmount)
    await tx.insert(purchaseOrders).values({
      id: poId,
      organizationId,
      poNo,
      purchaseRequestId: current.id,
      sourceRequestNo: current.requestNo,
      supplierName: current.supplier,
      warehouseCode: current.warehouse,
      status: 'sent',
      expectedArrivalAt: current.expectedAt || null,
      currency: current.currency,
      totalAmount,
      sentAt: new Date(),
    })
    for (const line of current.lines) {
      const variant = await resolveVariantBySku(tx, organizationId, line.sku)
      if (!variant) throw new Error(`SKU ${line.sku} 不存在`)
      await tx.insert(purchaseOrderLines).values({
        id: createId(),
        organizationId,
        purchaseOrderId: poId,
        lineNo: line.lineNo,
        variantId: variant.id,
        skuCode: variant.skuCode,
        qtyOrdered: line.qty,
        qtyReceived: 0,
        qtyQcPassed: 0,
        qtyStocked: 0,
        unitPrice: String(line.unitPrice),
        amount: String(line.amount),
      })
    }

    await tx
      .update(purchaseRequests)
      .set({
        status: 'converted',
        convertedPoId: poNo,
        opinion: input.opinion?.trim() || current.opinion || '同意转采购单',
        approverName: input.approver?.trim() || current.approver || '当前审核人',
        updatedAt: new Date(),
      })
      .where(eq(purchaseRequests.id, current.id))

    const order = (await getPurchaseOrder(tx as DbLike, organizationId, poId))!
    const request = (await getPurchaseRequest(tx as DbLike, organizationId, current.id))!
    return { request, order }
  })
}

/* ───────── 采购单 ───────── */

export async function listPurchaseOrders(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string } = {},
): Promise<PaginatedResult<PurchaseOrderListRow>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(purchaseOrders.organizationId, organizationId)]
  if (input.status && input.status !== '全部') {
    const map: Record<string, string> = {
      草稿: 'draft',
      已下发: 'sent',
      部分到货: 'partial_received',
      已收货: 'received',
      已关闭: 'closed',
      已取消: 'cancelled',
    }
    filters.push(eq(purchaseOrders.status, map[input.status] ?? input.status))
  }
  const search = buildSearch(input.q, [
    purchaseOrders.poNo,
    purchaseOrders.supplierName,
    purchaseOrders.sourceRequestNo,
  ])
  if (search) filters.push(search)
  const where = and(...filters)
  const [totalRow] = await db.select({ value: count() }).from(purchaseOrders).where(where)
  const headers = await db
    .select()
    .from(purchaseOrders)
    .where(where)
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const items: PurchaseOrderListRow[] = []
  for (const header of headers) {
    const lines = await db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.purchaseOrderId, header.id))
    const dto = mapOrder(header, lines)
    items.push({
      id: dto.id,
      poNo: dto.poNo,
      sourceRequest: dto.sourceRequest,
      supplier: dto.supplier,
      warehouse: dto.warehouse,
      currency: dto.currency,
      totalAmount: dto.totalAmount,
      expectedAt: dto.expectedAt,
      status: dto.status,
      createdAt: dto.createdAt,
      lineCount: dto.lines.length,
      firstSku: dto.lines[0]?.sku ?? '—',
    })
  }
  return { items, total: totalRow?.value ?? 0, page, pageSize }
}

export async function getPurchaseOrder(
  db: DbLike,
  organizationId: string,
  idOrNo: string,
): Promise<PurchaseOrderDto | null> {
  const [header] = await db
    .select()
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.organizationId, organizationId),
        or(eq(purchaseOrders.id, idOrNo), eq(purchaseOrders.poNo, idOrNo)),
      ),
    )
    .limit(1)
  if (!header) return null
  const lines = await db
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.purchaseOrderId, header.id))
  return mapOrder(header, lines)
}

async function applyPoReceiveProjection(
  db: DbLike,
  organizationId: string,
  poId: string,
  deltas: { poLineId?: string; sku: string; qtyReceivedDelta?: number; qtyQcPassedDelta?: number; qtyStockedDelta?: number }[],
) {
  const [header] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.organizationId, organizationId), or(eq(purchaseOrders.id, poId), eq(purchaseOrders.poNo, poId))))
    .limit(1)
  if (!header) return
  const lines = await db
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.purchaseOrderId, header.id))
  for (const line of lines) {
    const delta =
      deltas.find((d) => d.poLineId && d.poLineId === line.id) ||
      deltas.find((d) => d.sku === line.skuCode)
    if (!delta) continue
    await db
      .update(purchaseOrderLines)
      .set({
        qtyReceived: Math.max(0, line.qtyReceived + (delta.qtyReceivedDelta || 0)),
        qtyQcPassed: Math.max(0, line.qtyQcPassed + (delta.qtyQcPassedDelta || 0)),
        qtyStocked: Math.max(0, line.qtyStocked + (delta.qtyStockedDelta || 0)),
        updatedAt: new Date(),
      })
      .where(eq(purchaseOrderLines.id, line.id))
  }
  const refreshed = await db
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.purchaseOrderId, header.id))
  const totalOrdered = refreshed.reduce((s, l) => s + l.qtyOrdered, 0)
  const totalReceived = refreshed.reduce((s, l) => s + l.qtyReceived, 0)
  let status = header.status
  if (status !== 'cancelled' && status !== 'closed') {
    if (totalReceived <= 0) {
      // keep
    } else if (totalReceived < totalOrdered) {
      status = 'partial_received'
    } else {
      status = 'received'
    }
  }
  await db
    .update(purchaseOrders)
    .set({ status, updatedAt: new Date() })
    .where(eq(purchaseOrders.id, header.id))
}

/* ───────── 收货 / 质检 ───────── */

export async function listPurchaseReceipts(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string } = {},
): Promise<PaginatedResult<PurchaseReceiptListRow>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(purchaseReceipts.organizationId, organizationId)]
  if (input.status && input.status !== '全部') {
    const map: Record<string, string> = {
      草稿: 'draft',
      待质检: 'qc_pending',
      已完成: 'completed',
      已取消: 'cancelled',
    }
    filters.push(eq(purchaseReceipts.status, map[input.status] ?? input.status))
  }
  const search = buildSearch(input.q, [
    purchaseReceipts.receiptNo,
    purchaseReceipts.poNo,
    purchaseReceipts.supplierName,
  ])
  if (search) filters.push(search)
  const where = and(...filters)
  const [totalRow] = await db.select({ value: count() }).from(purchaseReceipts).where(where)
  const headers = await db
    .select()
    .from(purchaseReceipts)
    .where(where)
    .orderBy(desc(purchaseReceipts.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const items: PurchaseReceiptListRow[] = []
  for (const header of headers) {
    const lines = await db
      .select()
      .from(purchaseReceiptLines)
      .where(eq(purchaseReceiptLines.purchaseReceiptId, header.id))
    const inbounds = await db
      .select({ inboundNo: stockInbounds.inboundNo })
      .from(stockInbounds)
      .where(eq(stockInbounds.purchaseReceiptId, header.id))
    const dto = mapReceipt(
      header,
      lines,
      inbounds.map((i) => i.inboundNo),
    )
    items.push({
      id: dto.id,
      receiptNo: dto.receiptNo,
      purchaseOrderId: dto.purchaseOrderId,
      supplier: dto.supplier,
      warehouse: dto.warehouse,
      status: dto.status,
      batchNo: dto.batchNo,
      arrivedAt: dto.arrivedAt,
      carrier: dto.carrier,
      trackingNo: dto.trackingNo,
      receivedBy: dto.receivedBy,
      deliveryNote: dto.deliveryNote,
      remark: dto.remark,
      qcNo: dto.qcNo,
      qcInspector: dto.qcInspector,
      qcCompletedAt: dto.qcCompletedAt,
      lineCount: dto.lines.length,
      firstSku: dto.lines[0]?.sku ?? '—',
      totalArrived: dto.lines.reduce((s, l) => s + l.qtyArrived, 0),
      totalPassed: dto.lines.reduce((s, l) => s + l.qtyPassed, 0),
      totalFailed: dto.lines.reduce((s, l) => s + l.qtyFailed, 0),
      inboundCount: dto.inboundIds.length,
    })
  }
  return { items, total: totalRow?.value ?? 0, page, pageSize }
}

export async function getPurchaseReceipt(
  db: DbLike,
  organizationId: string,
  idOrNo: string,
): Promise<PurchaseReceiptDto | null> {
  const [header] = await db
    .select()
    .from(purchaseReceipts)
    .where(
      and(
        eq(purchaseReceipts.organizationId, organizationId),
        or(eq(purchaseReceipts.id, idOrNo), eq(purchaseReceipts.receiptNo, idOrNo)),
      ),
    )
    .limit(1)
  if (!header) return null
  const lines = await db
    .select()
    .from(purchaseReceiptLines)
    .where(eq(purchaseReceiptLines.purchaseReceiptId, header.id))
  const inbounds = await db
    .select({ inboundNo: stockInbounds.inboundNo })
    .from(stockInbounds)
    .where(eq(stockInbounds.purchaseReceiptId, header.id))
  return mapReceipt(
    header,
    lines,
    inbounds.map((i) => i.inboundNo),
  )
}

export async function registerPurchaseReceipt(
  db: AppDatabase,
  organizationId: string,
  input: {
    purchaseOrderId: string
    batchNo?: string
    arrivedAt?: string
    carrier?: string
    trackingNo?: string
    receivedBy?: string
    deliveryNote?: string
    remark?: string
    lines: { poLineId: string; sku: string; qtyArrived: number; note?: string }[]
  },
): Promise<PurchaseReceiptDto> {
  return db.transaction(async (tx) => {
    const order = await getPurchaseOrder(tx as DbLike, organizationId, input.purchaseOrderId)
    if (!order) throw new Error('采购单不存在')
    if (order.status === '已取消' || order.status === '已关闭') {
      throw new Error('已取消/已关闭采购单不可收货')
    }
    if (!input.lines.length) throw new Error('请至少登记一行到货数量')

    const arrivedAt = input.arrivedAt?.trim()
      ? new Date(`${input.arrivedAt.trim()}T00:00:00`)
      : new Date()
    if (Number.isNaN(arrivedAt.getTime())) throw new Error('到货日期格式无效')

    const receiptNo = await nextDocNo(tx, organizationId, 'rcv')
    const receiptId = createId()
    await tx.insert(purchaseReceipts).values({
      id: receiptId,
      organizationId,
      receiptNo,
      purchaseOrderId: order.id,
      poNo: order.poNo,
      supplierName: order.supplier,
      warehouseCode: order.warehouse,
      status: 'qc_pending',
      batchNo: input.batchNo?.trim() || null,
      arrivedAt,
      carrier: input.carrier?.trim() || null,
      trackingNo: input.trackingNo?.trim() || null,
      receivedBy: input.receivedBy?.trim() || '当前用户',
      deliveryNote: input.deliveryNote?.trim() || null,
      remark: input.remark?.trim() || null,
    })

    const deltas: { poLineId: string; sku: string; qtyReceivedDelta: number }[] = []
    let lineNo = 0
    for (const item of input.lines) {
      const qtyArrived = Math.max(0, Math.floor(item.qtyArrived) || 0)
      if (qtyArrived <= 0) continue
      const poLine =
        order.lines.find((l) => l.id === item.poLineId) ||
        order.lines.find((l) => l.sku === item.sku)
      if (!poLine) throw new Error(`采购明细不存在：${item.sku}`)
      const variant = await resolveVariantBySku(tx, organizationId, poLine.sku)
      if (!variant) throw new Error(`SKU ${poLine.sku} 不存在`)
      lineNo += 1
      await tx.insert(purchaseReceiptLines).values({
        id: createId(),
        organizationId,
        purchaseReceiptId: receiptId,
        lineNo,
        poLineId: poLine.id,
        variantId: variant.id,
        skuCode: variant.skuCode,
        qtyOrdered: poLine.qtyOrdered,
        qtyArrived,
        qtyPendingQc: qtyArrived,
        qtyPassed: 0,
        qtyFailed: 0,
        note: item.note?.trim() || null,
        suggestedBin: 'A-01-01-01',
      })
      deltas.push({ poLineId: poLine.id, sku: poLine.sku, qtyReceivedDelta: qtyArrived })
    }
    if (!deltas.length) throw new Error('到货数量无效')

    await applyPoReceiveProjection(tx, organizationId, order.id, deltas)
    return (await getPurchaseReceipt(tx as DbLike, organizationId, receiptId))!
  })
}

export async function submitPurchaseReceiptQc(
  db: AppDatabase,
  organizationId: string,
  input: {
    receiptId: string
    inspector?: string
    lines: { lineId: string; qtyPassed: number; qtyFailed: number; suggestedBin?: string; note?: string }[]
  },
): Promise<{ receipt: PurchaseReceiptDto; inbounds: StockInboundDto[] }> {
  return db.transaction(async (tx) => {
    const receipt = await getPurchaseReceipt(tx as DbLike, organizationId, input.receiptId)
    if (!receipt) throw new Error('收货单不存在')
    if (receipt.status !== '待质检') throw new Error('仅待质检收货单可提交质检')

    const qcNo = await nextDocNo(tx, organizationId, 'qc')
    const deltas: { poLineId: string; sku: string; qtyQcPassedDelta: number }[] = []
    const createdInbounds: StockInboundDto[] = []

    for (const item of input.lines) {
      const line = receipt.lines.find((l) => l.id === item.lineId)
      if (!line) continue
      const qtyPassed = Math.max(0, Math.floor(item.qtyPassed) || 0)
      const qtyFailed = Math.max(0, Math.floor(item.qtyFailed) || 0)
      if (qtyPassed + qtyFailed !== line.qtyArrived) {
        throw new Error(`${line.sku} 合格+不合格须等于到货 ${line.qtyArrived}`)
      }
      const bin = item.suggestedBin?.trim() || line.suggestedBin || 'A-01-01-01'
      await tx
        .update(purchaseReceiptLines)
        .set({
          qtyPassed,
          qtyFailed,
          qtyPendingQc: 0,
          suggestedBin: bin,
          note: item.note !== undefined ? item.note.trim() : line.note,
          updatedAt: new Date(),
        })
        .where(eq(purchaseReceiptLines.id, line.id))

      deltas.push({ poLineId: line.poLineId, sku: line.sku, qtyQcPassedDelta: qtyPassed })

      if (qtyPassed > 0) {
        const [lineRow] = await tx
          .select()
          .from(purchaseReceiptLines)
          .where(eq(purchaseReceiptLines.id, line.id))
          .limit(1)
        if (!lineRow) continue
        const inboundNo = await nextDocNo(tx, organizationId, 'inb')
        const idempotencyKey = `ledger:purchase:${receipt.receiptNo}:${line.sku}:${inboundNo}`
        const inboundId = createId()
        const [po] = await tx
          .select()
          .from(purchaseOrders)
          .where(
            and(
              eq(purchaseOrders.organizationId, organizationId),
              or(eq(purchaseOrders.poNo, receipt.purchaseOrderId), eq(purchaseOrders.id, receipt.purchaseOrderId)),
            ),
          )
          .limit(1)
        await tx.insert(stockInbounds).values({
          id: inboundId,
          organizationId,
          inboundNo,
          sourceType: 'purchase',
          sourceDoc: receipt.receiptNo,
          purchaseOrderId: po?.id ?? null,
          poNo: receipt.purchaseOrderId,
          purchaseReceiptId: receipt.id,
          warehouseCode: receipt.warehouse,
          variantId: lineRow.variantId,
          skuCode: line.sku,
          quantity: qtyPassed,
          qcResult: qtyFailed > 0 ? `合格${qtyPassed}/不合格${qtyFailed}` : '全部合格',
          binCode: bin,
          operator: input.inspector?.trim() || '当前用户',
          status: 'pending_shelve',
          idempotencyKey,
          remark: '',
        })
        // pending_inbound += qtyPassed
        await upsertBalanceDelta(tx, {
          organizationId,
          warehouseCode: receipt.warehouse,
          binCode: bin,
          variantId: lineRow.variantId,
          pendingInboundDelta: qtyPassed,
        })
        createdInbounds.push(
          mapInbound(
            (
              await tx.select().from(stockInbounds).where(eq(stockInbounds.id, inboundId)).limit(1)
            )[0]!,
          ),
        )
      }
    }

    await tx
      .update(purchaseReceipts)
      .set({
        status: 'completed',
        qcNo,
        qcInspector: input.inspector?.trim() || '当前用户',
        qcCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(purchaseReceipts.id, receipt.id))

    const [poHeader] = await tx
      .select()
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.organizationId, organizationId),
          or(eq(purchaseOrders.poNo, receipt.purchaseOrderId), eq(purchaseOrders.id, receipt.purchaseOrderId)),
        ),
      )
      .limit(1)
    if (poHeader) {
      await applyPoReceiveProjection(tx, organizationId, poHeader.id, deltas)
    }

    const updated = (await getPurchaseReceipt(tx as DbLike, organizationId, receipt.id))!
    return { receipt: updated, inbounds: createdInbounds }
  })
}

export async function cancelPurchaseReceipt(
  db: AppDatabase,
  organizationId: string,
  receiptId: string,
): Promise<PurchaseReceiptDto> {
  const current = await getPurchaseReceipt(db, organizationId, receiptId)
  if (!current) throw new Error('收货单不存在')
  if (current.status === '已完成') throw new Error('已完成收货不可取消，请走差异调整')
  if (current.status === '已取消') throw new Error('收货单已取消')
  await db
    .update(purchaseReceipts)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(purchaseReceipts.id, current.id))
  return (await getPurchaseReceipt(db, organizationId, current.id))!
}

/* ───────── 入库上架 + 库存流水 ───────── */

async function upsertBalanceDelta(
  db: DbLike,
  input: {
    organizationId: string
    warehouseCode: string
    binCode: string
    variantId: string
    onHandDelta?: number
    pendingInboundDelta?: number
    damagedDelta?: number
  },
) {
  const [existing] = await db
    .select()
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.organizationId, input.organizationId),
        eq(inventoryBalances.warehouseCode, input.warehouseCode),
        eq(inventoryBalances.binCode, input.binCode),
        eq(inventoryBalances.variantId, input.variantId),
      ),
    )
    .limit(1)

  if (!existing) {
    await db.insert(inventoryBalances).values({
      id: createId(),
      organizationId: input.organizationId,
      warehouseCode: input.warehouseCode,
      binCode: input.binCode,
      variantId: input.variantId,
      onHand: Math.max(0, input.onHandDelta || 0),
      pendingInbound: Math.max(0, input.pendingInboundDelta || 0),
      damaged: Math.max(0, input.damagedDelta || 0),
    })
    // 新建余额行后也重算预警（available 可能从 0 变为正）。
    if (input.onHandDelta || input.damagedDelta) {
      await recomputeStockAlert(db, input.organizationId, input.variantId)
    }
    return
  }

  await db
    .update(inventoryBalances)
    .set({
      onHand: Math.max(0, existing.onHand + (input.onHandDelta || 0)),
      pendingInbound: Math.max(0, existing.pendingInbound + (input.pendingInboundDelta || 0)),
      damaged: Math.max(0, existing.damaged + (input.damagedDelta || 0)),
      version: existing.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(inventoryBalances.id, existing.id))

  // on_hand / damaged 变化才影响 available；pending_inbound 不计可用，跳过以减少写。
  if (input.onHandDelta || input.damagedDelta) {
    await recomputeStockAlert(db, input.organizationId, input.variantId)
  }
}

export async function listStockInbounds(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string } = {},
): Promise<PaginatedResult<StockInboundDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(stockInbounds.organizationId, organizationId)]
  if (input.status && input.status !== '全部') {
    const map: Record<string, string> = {
      待上架: 'pending_shelve',
      已上架: 'shelved',
      已取消: 'cancelled',
    }
    filters.push(eq(stockInbounds.status, map[input.status] ?? input.status))
  }
  const search = buildSearch(input.q, [
    stockInbounds.inboundNo,
    stockInbounds.sourceDoc,
    stockInbounds.skuCode,
    stockInbounds.poNo,
  ])
  if (search) filters.push(search)
  const where = and(...filters)
  const [totalRow] = await db.select({ value: count() }).from(stockInbounds).where(where)
  const rows = await db
    .select()
    .from(stockInbounds)
    .where(where)
    .orderBy(desc(stockInbounds.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return {
    items: rows.map(mapInbound),
    total: totalRow?.value ?? 0,
    page,
    pageSize,
  }
}

export async function getStockInbound(
  db: DbLike,
  organizationId: string,
  idOrNo: string,
): Promise<StockInboundDto | null> {
  const [row] = await db
    .select()
    .from(stockInbounds)
    .where(
      and(
        eq(stockInbounds.organizationId, organizationId),
        or(eq(stockInbounds.id, idOrNo), eq(stockInbounds.inboundNo, idOrNo)),
      ),
    )
    .limit(1)
  return row ? mapInbound(row) : null
}

export async function updateStockInboundDraft(
  db: AppDatabase,
  organizationId: string,
  inboundId: string,
  patch: { bin?: string; operator?: string; remark?: string },
): Promise<StockInboundDto> {
  const current = await getStockInbound(db, organizationId, inboundId)
  if (!current) throw new Error('入库单不存在')
  if (current.status !== '待上架') throw new Error('仅「待上架」可编辑库位与备注')
  if (patch.bin !== undefined && !patch.bin.trim()) throw new Error('目标库位不能为空')
  await db
    .update(stockInbounds)
    .set({
      binCode: patch.bin?.trim() || current.bin,
      operator: patch.operator?.trim() || current.operator,
      remark: patch.remark !== undefined ? patch.remark.trim() : current.remark,
      updatedAt: new Date(),
    })
    .where(eq(stockInbounds.id, current.id))
  return (await getStockInbound(db, organizationId, current.id))!
}

export async function cancelStockInbound(
  db: AppDatabase,
  organizationId: string,
  inboundId: string,
  reason?: string,
): Promise<StockInboundDto> {
  const current = await getStockInbound(db, organizationId, inboundId)
  if (!current) throw new Error('入库单不存在')
  if (current.status === '已上架') throw new Error('已上架不可取消，请走库存调整')
  if (current.status === '已取消') throw new Error('入库单已取消')
  const [row] = await db.select().from(stockInbounds).where(eq(stockInbounds.id, current.id)).limit(1)
  await db
    .update(stockInbounds)
    .set({
      status: 'cancelled',
      remark: reason?.trim()
        ? `${current.remark ? current.remark + '；' : ''}取消原因：${reason.trim()}`
        : current.remark,
      updatedAt: new Date(),
    })
    .where(eq(stockInbounds.id, current.id))
  if (row) {
    await upsertBalanceDelta(db, {
      organizationId,
      warehouseCode: row.warehouseCode,
      binCode: row.binCode,
      variantId: row.variantId,
      pendingInboundDelta: -row.quantity,
    })
  }
  return (await getStockInbound(db, organizationId, current.id))!
}

export async function confirmStockInboundShelve(
  db: AppDatabase,
  organizationId: string,
  inboundId: string,
  operator?: string,
): Promise<StockInboundDto> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(stockInbounds)
      .where(
        and(
          eq(stockInbounds.organizationId, organizationId),
          or(eq(stockInbounds.id, inboundId), eq(stockInbounds.inboundNo, inboundId)),
        ),
      )
      .limit(1)
    if (!row) throw new Error('入库单不存在')
    if (row.status !== 'pending_shelve') throw new Error('仅「待上架」入库单可确认上架')
    if (!row.binCode) throw new Error('缺少目标库位，无法上架')
    if (row.quantity <= 0) throw new Error('上架数量无效')

    const actor = operator?.trim() || row.operator || '当前用户'

    const [dup] = await tx
      .select({ id: inventoryMovements.id })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.organizationId, organizationId),
          eq(inventoryMovements.idempotencyKey, row.idempotencyKey),
        ),
      )
      .limit(1)

    if (!dup) {
      const [balance] = await tx
        .select()
        .from(inventoryBalances)
        .where(
          and(
            eq(inventoryBalances.organizationId, organizationId),
            eq(inventoryBalances.warehouseCode, row.warehouseCode),
            eq(inventoryBalances.binCode, row.binCode),
            eq(inventoryBalances.variantId, row.variantId),
          ),
        )
        .limit(1)
      const onHandBefore = balance?.onHand ?? 0
      const pendingBefore = balance?.pendingInbound ?? 0
      const onHandAfter = onHandBefore + row.quantity
      const pendingAfter = Math.max(0, pendingBefore - row.quantity)

      if (!balance) {
        await tx.insert(inventoryBalances).values({
          id: createId(),
          organizationId,
          warehouseCode: row.warehouseCode,
          binCode: row.binCode,
          variantId: row.variantId,
          onHand: row.quantity,
          pendingInbound: 0,
        })
      } else {
        await tx
          .update(inventoryBalances)
          .set({
            onHand: onHandAfter,
            pendingInbound: pendingAfter,
            version: balance.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(inventoryBalances.id, balance.id))
      }

      await tx.insert(inventoryMovements).values({
        id: createId(),
        organizationId,
        warehouseCode: row.warehouseCode,
        binCode: row.binCode,
        variantId: row.variantId,
        movementType: 'purchase_stock_in',
        qtyDelta: row.quantity,
        onHandAfter,
        reservedAfter: balance?.reserved ?? 0,
        qcHoldAfter: balance?.qcHold ?? 0,
        damagedAfter: balance?.damaged ?? 0,
        sourceType: 'purchase_receipt',
        sourceId: row.sourceDoc,
        operator: actor,
        idempotencyKey: row.idempotencyKey,
        occurredAt: new Date(),
        raw: {
          inboundNo: row.inboundNo,
          reason: '采购入库上架',
        },
      })
    }

    // 上架写 on_hand，available 变化：重算该 variant 的库存预警。
    await recomputeStockAlert(tx, organizationId, row.variantId)

    await tx
      .update(stockInbounds)
      .set({
        status: 'shelved',
        operator: actor,
        shelvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(stockInbounds.id, row.id))

    if (row.purchaseOrderId || row.poNo) {
      await applyPoReceiveProjection(tx, organizationId, row.purchaseOrderId || row.poNo!, [
        {
          sku: row.skuCode,
          qtyStockedDelta: row.quantity,
        },
      ])
    }

    return (await getStockInbound(tx as DbLike, organizationId, row.id))!
  })
}

export async function listSkuCodesForPurchase(
  db: AppDatabase,
  organizationId: string,
): Promise<string[]> {
  const rows = await db
    .select({ skuCode: productVariants.skuCode })
    .from(productVariants)
    .where(
      and(eq(productVariants.organizationId, organizationId), eq(productVariants.status, 'active')),
    )
    .orderBy(productVariants.skuCode)
    .limit(500)
  return rows
    .map((r) => r.skuCode)
    .filter((code): code is string => Boolean(code))
}

// silence unused helper warning in some bundlers
void toRequestListRow
void sql
