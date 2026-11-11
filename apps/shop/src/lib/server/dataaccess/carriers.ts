/**
 * commerce_carriers（模块15）。
 * 租户承运商主档；运费页仍读 fee_templates / ocean，不伪造承运商报价 API。
 */
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { commerceCarriers } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  formatStamp,
  toDbActiveStatus,
  toDbCarrierType,
  toUiActiveStatus,
  toUiCarrierType,
  type UiActiveStatus,
  type UiCarrierType,
} from '@/lib/server/mappers/ops-master'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type CarrierDto = {
  id: string
  code: string
  name: string
  type: UiCarrierType
  dbType: string
  coverage: string
  contact: string
  phone: string
  status: UiActiveStatus
  dbStatus: string
  note: string
  createdAt: string
  updatedAt: string
}

function mapRow(row: typeof commerceCarriers.$inferSelect): CarrierDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: toUiCarrierType(row.type),
    dbType: row.type,
    coverage: row.coverage ?? '',
    contact: row.contact ?? '',
    phone: row.phone ?? '',
    status: toUiActiveStatus(row.status),
    dbStatus: row.status,
    note: row.note ?? '',
    createdAt: formatStamp(row.createdAt),
    updatedAt: formatStamp(row.updatedAt),
  }
}

export async function listCarriers(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string } = {},
): Promise<PaginatedResult<CarrierDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize ?? 50)
  const filters: SQL[] = [eq(commerceCarriers.organizationId, organizationId)]
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(commerceCarriers.code, q),
        ilike(commerceCarriers.name, q),
        ilike(commerceCarriers.coverage, q),
        ilike(commerceCarriers.contact, q),
      )!,
    )
  }
  if (input.status === '启用' || input.status === 'active') filters.push(eq(commerceCarriers.status, 'active'))
  if (input.status === '停用' || input.status === 'disabled') filters.push(eq(commerceCarriers.status, 'disabled'))
  const where = and(...filters)!
  const [totalRow] = await db.select({ value: count() }).from(commerceCarriers).where(where)
  const rows = await db
    .select()
    .from(commerceCarriers)
    .where(where)
    .orderBy(desc(commerceCarriers.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return { items: rows.map(mapRow), total: Number(totalRow?.value ?? 0), page, pageSize }
}

export async function getCarrier(db: AppDatabase, organizationId: string, idOrCode: string) {
  const [byId] = await db
    .select()
    .from(commerceCarriers)
    .where(and(eq(commerceCarriers.organizationId, organizationId), eq(commerceCarriers.id, idOrCode)))
    .limit(1)
  if (byId) return mapRow(byId)
  const [byCode] = await db
    .select()
    .from(commerceCarriers)
    .where(and(eq(commerceCarriers.organizationId, organizationId), eq(commerceCarriers.code, idOrCode)))
    .limit(1)
  return byCode ? mapRow(byCode) : null
}

async function nextCode(db: DbLike, organizationId: string) {
  const rows = await db
    .select({ code: commerceCarriers.code })
    .from(commerceCarriers)
    .where(eq(commerceCarriers.organizationId, organizationId))
  let max = 0
  for (const row of rows) {
    const m = /^CAR-(\d+)$/.exec(row.code)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `CAR-${String(max + 1).padStart(4, '0')}`
}

export async function createCarrier(
  db: DbLike,
  organizationId: string,
  input: {
    name: string
    type?: string
    coverage?: string
    contact?: string
    phone?: string
    status?: string
    note?: string
    code?: string
  },
) {
  const code = (input.code?.trim() || (await nextCode(db, organizationId))).toUpperCase()
  const id = createId()
  const now = new Date()
  await db.insert(commerceCarriers).values({
    id,
    organizationId,
    code,
    name: input.name.trim() || '未命名承运商',
    type: toDbCarrierType(input.type),
    coverage: input.coverage?.trim() || '',
    contact: input.contact?.trim() || '',
    phone: input.phone?.trim() || '',
    status: toDbActiveStatus(input.status),
    note: input.note?.trim() || '',
    createdAt: now,
    updatedAt: now,
  })
  return getCarrier(db as AppDatabase, organizationId, id)
}

export async function updateCarrier(
  db: DbLike,
  organizationId: string,
  input: {
    id: string
    name?: string
    type?: string
    coverage?: string
    contact?: string
    phone?: string
    status?: string
    note?: string
  },
) {
  const existing = await getCarrier(db as AppDatabase, organizationId, input.id)
  if (!existing) throw new Error('承运商不存在')
  await db
    .update(commerceCarriers)
    .set({
      name: input.name?.trim() ?? existing.name,
      type: input.type != null ? toDbCarrierType(input.type) : existing.dbType,
      coverage: input.coverage ?? existing.coverage,
      contact: input.contact ?? existing.contact,
      phone: input.phone ?? existing.phone,
      status: input.status != null ? toDbActiveStatus(input.status) : existing.dbStatus,
      note: input.note ?? existing.note,
      updatedAt: new Date(),
    })
    .where(and(eq(commerceCarriers.organizationId, organizationId), eq(commerceCarriers.id, existing.id)))
  return getCarrier(db as AppDatabase, organizationId, existing.id)
}

/** 停用承运商（软停用，不物理删除；已被业务引用时同样只改状态）。 */
export async function removeCarrier(db: AppDatabase, organizationId: string, idOrCode: string) {
  const existing = await getCarrier(db, organizationId, idOrCode)
  if (!existing) throw new Error('承运商不存在')
  await db
    .update(commerceCarriers)
    .set({ status: toDbActiveStatus('停用'), updatedAt: new Date() })
    .where(and(eq(commerceCarriers.organizationId, organizationId), eq(commerceCarriers.id, existing.id)))
  return { id: existing.id, code: existing.code, status: '停用' as const }
}
