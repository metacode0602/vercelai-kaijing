/**
 * 供应商主档 + 供应商货号 dataaccess（模块12）。
 */
import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  commerceSuppliers,
  productVariants,
  purchaseRequestLines,
  purchaseRequests,
  supplierSkus,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  formatDateOnly,
  formatStamp,
  money,
  toDbSupplierSkuStatus,
  toDbSupplierStatus,
  toUiSupplierSkuStatus,
  toUiSupplierStatus,
  type UiSupplierSkuStatus,
  type UiSupplierStatus,
} from '@/lib/server/mappers/suppliers'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type SupplierDto = {
  id: string
  code: string
  name: string
  contact: string
  phone: string
  email: string
  settlement: string
  status: UiSupplierStatus
  note: string
  skuCount: number
  updatedAt: string
}

export type SupplierSkuDto = {
  id: string
  sku: string
  variantId: string
  supplierId: string
  supplier: string
  supplierCode: string
  factoryCode: string
  price: number
  currency: string
  moq: number
  leadDays: number
  effective: string
  preferred: boolean
  status: UiSupplierSkuStatus
  remark: string
  updatedAt: string
}

async function nextSupplierCode(db: DbLike, organizationId: string): Promise<string> {
  const rows = await db
    .select({ code: commerceSuppliers.code })
    .from(commerceSuppliers)
    .where(eq(commerceSuppliers.organizationId, organizationId))
  let max = 0
  for (const row of rows) {
    const m = /^SUP-(\d+)$/.exec(row.code)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `SUP-${String(max + 1).padStart(4, '0')}`
}

function mapSupplier(
  row: typeof commerceSuppliers.$inferSelect,
  skuCount = 0,
): SupplierDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    contact: row.contact ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    settlement: row.settlement ?? '',
    status: toUiSupplierStatus(row.status),
    note: row.note ?? '',
    skuCount,
    updatedAt: formatStamp(row.updatedAt),
  }
}

function mapSku(
  row: typeof supplierSkus.$inferSelect,
  supplierName: string,
  supplierCode: string,
): SupplierSkuDto {
  return {
    id: row.id,
    sku: row.skuCode,
    variantId: row.variantId,
    supplierId: row.supplierId,
    supplier: supplierName,
    supplierCode,
    factoryCode: row.factoryCode,
    price: money(row.unitPrice),
    currency: row.currency,
    moq: row.moq,
    leadDays: row.leadDays,
    effective: formatDateOnly(row.effectiveFrom),
    preferred: row.preferred,
    status: toUiSupplierSkuStatus(row.status),
    remark: row.remark ?? '',
    updatedAt: formatStamp(row.updatedAt),
  }
}

async function resolveVariant(
  db: DbLike,
  organizationId: string,
  sku: string,
): Promise<{ id: string; skuCode: string }> {
  const code = sku.trim()
  const [row] = await db
    .select({
      id: productVariants.id,
      skuCode: productVariants.skuCode,
      sku: productVariants.sku,
    })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        or(eq(productVariants.skuCode, code), eq(productVariants.sku, code)),
      ),
    )
    .limit(1)
  if (!row) throw new Error(`内部 SKU ${code} 不存在`)
  return { id: row.id, skuCode: row.skuCode || row.sku || code }
}

export async function listSuppliers(
  db: DbLike,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string } = {},
): Promise<PaginatedResult<SupplierDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(commerceSuppliers.organizationId, organizationId)]
  if (input.status && input.status !== '全部') {
    filters.push(eq(commerceSuppliers.status, toDbSupplierStatus(input.status)))
  }
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(commerceSuppliers.code, q),
        ilike(commerceSuppliers.name, q),
        ilike(commerceSuppliers.contact, q),
        ilike(commerceSuppliers.phone, q),
      )!,
    )
  }
  const where = and(...filters)
  const [totalRow] = await db.select({ c: count() }).from(commerceSuppliers).where(where)
  const rows = await db
    .select()
    .from(commerceSuppliers)
    .where(where)
    .orderBy(desc(commerceSuppliers.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const ids = rows.map((r) => r.id)
  const countMap = new Map<string, number>()
  if (ids.length) {
    const counts = await db
      .select({
        supplierId: supplierSkus.supplierId,
        c: count(),
      })
      .from(supplierSkus)
      .where(
        and(
          eq(supplierSkus.organizationId, organizationId),
          sql`${supplierSkus.supplierId} in (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      )
      .groupBy(supplierSkus.supplierId)
    for (const c of counts) countMap.set(c.supplierId, Number(c.c))
  }

  return {
    items: rows.map((r) => mapSupplier(r, countMap.get(r.id) ?? 0)),
    total: Number(totalRow?.c ?? 0),
    page,
    pageSize,
  }
}

export async function supplierStats(db: DbLike, organizationId: string) {
  const rows = await db
    .select({ status: commerceSuppliers.status, c: count() })
    .from(commerceSuppliers)
    .where(eq(commerceSuppliers.organizationId, organizationId))
    .groupBy(commerceSuppliers.status)
  let total = 0
  let active = 0
  let disabled = 0
  for (const r of rows) {
    const n = Number(r.c)
    total += n
    if (r.status === 'active') active += n
    if (r.status === 'disabled') disabled += n
  }
  return { total, active, disabled }
}

export async function getSupplier(
  db: DbLike,
  organizationId: string,
  idOrCode: string,
): Promise<SupplierDto | null> {
  const [row] = await db
    .select()
    .from(commerceSuppliers)
    .where(
      and(
        eq(commerceSuppliers.organizationId, organizationId),
        or(eq(commerceSuppliers.id, idOrCode), eq(commerceSuppliers.code, idOrCode)),
      ),
    )
    .limit(1)
  if (!row) return null
  const [c] = await db
    .select({ c: count() })
    .from(supplierSkus)
    .where(
      and(eq(supplierSkus.organizationId, organizationId), eq(supplierSkus.supplierId, row.id)),
    )
  return mapSupplier(row, Number(c?.c ?? 0))
}

export async function createSupplier(
  db: DbLike,
  organizationId: string,
  input: {
    name: string
    contact?: string
    phone?: string
    email?: string
    settlement?: string
    status?: string
    note?: string
    code?: string
  },
): Promise<SupplierDto> {
  const name = input.name.trim()
  if (!name) throw new Error('供应商名称不能为空')
  const code = (input.code?.trim() || (await nextSupplierCode(db, organizationId))).toUpperCase()
  const [dup] = await db
    .select({ id: commerceSuppliers.id })
    .from(commerceSuppliers)
    .where(and(eq(commerceSuppliers.organizationId, organizationId), eq(commerceSuppliers.code, code)))
    .limit(1)
  if (dup) throw new Error(`供应商编码 ${code} 已存在`)
  const id = createId()
  await db.insert(commerceSuppliers).values({
    id,
    organizationId,
    code,
    name,
    contact: input.contact?.trim() || '',
    phone: input.phone?.trim() || '',
    email: input.email?.trim() || '',
    settlement: input.settlement?.trim() || '',
    status: toDbSupplierStatus(input.status),
    note: input.note?.trim() || null,
  })
  const created = await getSupplier(db, organizationId, id)
  if (!created) throw new Error('创建供应商失败')
  return created
}

export async function updateSupplier(
  db: DbLike,
  organizationId: string,
  input: {
    id: string
    name?: string
    contact?: string
    phone?: string
    email?: string
    settlement?: string
    status?: string
    note?: string
  },
): Promise<SupplierDto> {
  const existing = await getSupplier(db, organizationId, input.id)
  if (!existing) throw new Error(`供应商 ${input.id} 不存在`)
  await db
    .update(commerceSuppliers)
    .set({
      name: input.name?.trim() ?? existing.name,
      contact: input.contact?.trim() ?? existing.contact,
      phone: input.phone?.trim() ?? existing.phone,
      email: input.email?.trim() ?? existing.email,
      settlement: input.settlement?.trim() ?? existing.settlement,
      status: input.status != null ? toDbSupplierStatus(input.status) : toDbSupplierStatus(existing.status),
      note: input.note !== undefined ? input.note.trim() || null : existing.note || null,
      updatedAt: new Date(),
    })
    .where(and(eq(commerceSuppliers.organizationId, organizationId), eq(commerceSuppliers.id, existing.id)))
  const updated = await getSupplier(db, organizationId, existing.id)
  if (!updated) throw new Error('更新供应商失败')
  return updated
}

export async function listSupplierSkus(
  db: DbLike,
  organizationId: string,
  input: {
    page?: number
    pageSize?: number
    q?: string
    status?: string
    supplierId?: string
    sku?: string
    preferredOnly?: boolean
  } = {},
): Promise<PaginatedResult<SupplierSkuDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(supplierSkus.organizationId, organizationId)]
  if (input.status && input.status !== '全部') {
    filters.push(eq(supplierSkus.status, toDbSupplierSkuStatus(input.status)))
  }
  if (input.supplierId) filters.push(eq(supplierSkus.supplierId, input.supplierId))
  if (input.sku) filters.push(eq(supplierSkus.skuCode, input.sku.trim()))
  if (input.preferredOnly) filters.push(eq(supplierSkus.preferred, true))
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(supplierSkus.skuCode, q),
        ilike(supplierSkus.factoryCode, q),
        ilike(commerceSuppliers.name, q),
        ilike(supplierSkus.id, q),
      )!,
    )
  }
  const where = and(...filters)
  const [totalRow] = await db
    .select({ c: count() })
    .from(supplierSkus)
    .innerJoin(commerceSuppliers, eq(supplierSkus.supplierId, commerceSuppliers.id))
    .where(where)
  const rows = await db
    .select({
      sku: supplierSkus,
      supplierName: commerceSuppliers.name,
      supplierCode: commerceSuppliers.code,
    })
    .from(supplierSkus)
    .innerJoin(commerceSuppliers, eq(supplierSkus.supplierId, commerceSuppliers.id))
    .where(where)
    .orderBy(desc(supplierSkus.preferred), desc(supplierSkus.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    items: rows.map((r) => mapSku(r.sku, r.supplierName, r.supplierCode)),
    total: Number(totalRow?.c ?? 0),
    page,
    pageSize,
  }
}

export async function supplierSkuStats(db: DbLike, organizationId: string) {
  const rows = await db
    .select({
      status: supplierSkus.status,
      preferred: supplierSkus.preferred,
      c: count(),
    })
    .from(supplierSkus)
    .where(eq(supplierSkus.organizationId, organizationId))
    .groupBy(supplierSkus.status, supplierSkus.preferred)
  let total = 0
  let active = 0
  let preferred = 0
  let disabled = 0
  for (const r of rows) {
    const n = Number(r.c)
    total += n
    if (r.status === 'active') active += n
    if (r.status === 'disabled') disabled += n
    if (r.preferred) preferred += n
  }
  return { total, active, preferred, disabled }
}

export async function getSupplierSku(
  db: DbLike,
  organizationId: string,
  id: string,
): Promise<SupplierSkuDto | null> {
  const [row] = await db
    .select({
      sku: supplierSkus,
      supplierName: commerceSuppliers.name,
      supplierCode: commerceSuppliers.code,
    })
    .from(supplierSkus)
    .innerJoin(commerceSuppliers, eq(supplierSkus.supplierId, commerceSuppliers.id))
    .where(and(eq(supplierSkus.organizationId, organizationId), eq(supplierSkus.id, id)))
    .limit(1)
  if (!row) return null
  return mapSku(row.sku, row.supplierName, row.supplierCode)
}

async function clearPreferredForSku(
  db: DbLike,
  organizationId: string,
  skuCode: string,
  exceptId?: string,
) {
  const conds: SQL[] = [
    eq(supplierSkus.organizationId, organizationId),
    eq(supplierSkus.skuCode, skuCode),
    eq(supplierSkus.preferred, true),
  ]
  if (exceptId) conds.push(sql`${supplierSkus.id} <> ${exceptId}`)
  await db.update(supplierSkus).set({ preferred: false, updatedAt: new Date() }).where(and(...conds))
}

export async function createSupplierSku(
  db: DbLike,
  organizationId: string,
  input: {
    sku: string
    supplierId?: string
    supplierName?: string
    factoryCode: string
    price: number
    currency?: string
    moq?: number
    leadDays?: number
    effective?: string
    preferred?: boolean
    status?: string
    remark?: string
  },
): Promise<SupplierSkuDto> {
  const variant = await resolveVariant(db, organizationId, input.sku)
  let supplierId = input.supplierId?.trim()
  if (!supplierId && input.supplierName?.trim()) {
    const [s] = await db
      .select()
      .from(commerceSuppliers)
      .where(
        and(
          eq(commerceSuppliers.organizationId, organizationId),
          eq(commerceSuppliers.name, input.supplierName.trim()),
        ),
      )
      .limit(1)
    if (!s) throw new Error(`供应商 ${input.supplierName} 不存在，请先在供应商管理创建`)
    supplierId = s.id
  }
  if (!supplierId) throw new Error('请选择供应商')
  const [supplier] = await db
    .select()
    .from(commerceSuppliers)
    .where(and(eq(commerceSuppliers.organizationId, organizationId), eq(commerceSuppliers.id, supplierId)))
    .limit(1)
  if (!supplier) throw new Error('供应商不存在')
  const factoryCode = input.factoryCode.trim()
  if (!factoryCode) throw new Error('厂家款号不能为空')

  const [dup] = await db
    .select({ id: supplierSkus.id })
    .from(supplierSkus)
    .where(
      and(
        eq(supplierSkus.organizationId, organizationId),
        eq(supplierSkus.supplierId, supplierId),
        eq(supplierSkus.skuCode, variant.skuCode),
        eq(supplierSkus.factoryCode, factoryCode),
      ),
    )
    .limit(1)
  if (dup) throw new Error('同一供应商下该 SKU + 厂家款号已存在')

  const preferred = Boolean(input.preferred)
  if (preferred) await clearPreferredForSku(db, organizationId, variant.skuCode)

  const id = createId()
  const effective =
    input.effective?.trim() ||
    new Date().toISOString().slice(0, 10)
  await db.insert(supplierSkus).values({
    id,
    organizationId,
    supplierId,
    variantId: variant.id,
    skuCode: variant.skuCode,
    factoryCode,
    unitPrice: String(input.price ?? 0),
    currency: (input.currency || 'CNY').toUpperCase().slice(0, 3),
    moq: Math.max(1, Math.floor(input.moq ?? 1)),
    leadDays: Math.max(0, Math.floor(input.leadDays ?? 0)),
    effectiveFrom: effective,
    preferred,
    status: toDbSupplierSkuStatus(input.status),
    remark: input.remark?.trim() || null,
  })
  const created = await getSupplierSku(db, organizationId, id)
  if (!created) throw new Error('创建供应商货号失败')
  return created
}

export async function updateSupplierSku(
  db: DbLike,
  organizationId: string,
  input: {
    id: string
    factoryCode?: string
    price?: number
    currency?: string
    moq?: number
    leadDays?: number
    effective?: string
    preferred?: boolean
    status?: string
    remark?: string
  },
): Promise<SupplierSkuDto> {
  const existing = await getSupplierSku(db, organizationId, input.id)
  if (!existing) throw new Error(`供应商货号 ${input.id} 不存在`)
  if (input.preferred === true) {
    await clearPreferredForSku(db, organizationId, existing.sku, existing.id)
  }
  await db
    .update(supplierSkus)
    .set({
      factoryCode: input.factoryCode?.trim() || existing.factoryCode,
      unitPrice: input.price != null ? String(input.price) : String(existing.price),
      currency: input.currency?.toUpperCase().slice(0, 3) || existing.currency,
      moq: input.moq != null ? Math.max(1, Math.floor(input.moq)) : existing.moq,
      leadDays: input.leadDays != null ? Math.max(0, Math.floor(input.leadDays)) : existing.leadDays,
      effectiveFrom: input.effective?.trim() || existing.effective,
      preferred: input.preferred != null ? input.preferred : existing.preferred,
      status: input.status != null ? toDbSupplierSkuStatus(input.status) : toDbSupplierSkuStatus(existing.status),
      remark: input.remark !== undefined ? input.remark.trim() || null : existing.remark || null,
      updatedAt: new Date(),
    })
    .where(and(eq(supplierSkus.organizationId, organizationId), eq(supplierSkus.id, existing.id)))
  const updated = await getSupplierSku(db, organizationId, existing.id)
  if (!updated) throw new Error('更新供应商货号失败')
  return updated
}

/** 采购申请参考价：取首选（否则最新启用）供应源 */
export async function getPreferredForSku(
  db: DbLike,
  organizationId: string,
  sku: string,
): Promise<SupplierSkuDto | null> {
  const list = await listSupplierSkus(db, organizationId, {
    page: 1,
    pageSize: 5,
    sku,
    status: '启用',
  })
  const preferred = list.items.find((i) => i.preferred)
  return preferred ?? list.items[0] ?? null
}

/** 将采购申请行挂上 supplier_sku_id（按厂家货号或首选） */
export async function linkPurchaseRequestSupplier(
  db: DbLike,
  organizationId: string,
  purchaseRequestId: string,
  supplierId?: string,
): Promise<void> {
  if (supplierId) {
    await db
      .update(purchaseRequests)
      .set({ supplierId, updatedAt: new Date() })
      .where(
        and(
          eq(purchaseRequests.organizationId, organizationId),
          eq(purchaseRequests.id, purchaseRequestId),
        ),
      )
  }
  const lines = await db
    .select()
    .from(purchaseRequestLines)
    .where(
      and(
        eq(purchaseRequestLines.organizationId, organizationId),
        eq(purchaseRequestLines.purchaseRequestId, purchaseRequestId),
      ),
    )
  for (const line of lines) {
    if (line.supplierSkuId) continue
    let match: SupplierSkuDto | null = null
    if (line.supplierSku) {
      const [row] = await db
        .select({
          sku: supplierSkus,
          supplierName: commerceSuppliers.name,
          supplierCode: commerceSuppliers.code,
        })
        .from(supplierSkus)
        .innerJoin(commerceSuppliers, eq(supplierSkus.supplierId, commerceSuppliers.id))
        .where(
          and(
            eq(supplierSkus.organizationId, organizationId),
            eq(supplierSkus.skuCode, line.skuCode),
            eq(supplierSkus.factoryCode, line.supplierSku),
          ),
        )
        .limit(1)
      if (row) match = mapSku(row.sku, row.supplierName, row.supplierCode)
    }
    if (!match) match = await getPreferredForSku(db, organizationId, line.skuCode)
    if (!match) continue
    await db
      .update(purchaseRequestLines)
      .set({
        supplierSkuId: match.id,
        supplierSku: match.factoryCode,
        updatedAt: new Date(),
      })
      .where(eq(purchaseRequestLines.id, line.id))
  }
}

export async function listSuppliersForSelect(db: DbLike, organizationId: string) {
  const rows = await db
    .select({
      id: commerceSuppliers.id,
      code: commerceSuppliers.code,
      name: commerceSuppliers.name,
      status: commerceSuppliers.status,
    })
    .from(commerceSuppliers)
    .where(
      and(
        eq(commerceSuppliers.organizationId, organizationId),
        eq(commerceSuppliers.status, 'active'),
      ),
    )
    .orderBy(commerceSuppliers.name)
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    status: toUiSupplierStatus(r.status),
  }))
}
