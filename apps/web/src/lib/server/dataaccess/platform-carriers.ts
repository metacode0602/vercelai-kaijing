import { and, count, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { commerceCarriers, platformCarriersCatalog } from '@workspace/db'
import { ensurePlatformCarriersCatalog } from '@workspace/db/platform-catalogs'
import {
  PLATFORM_CARRIER_TYPES,
  type PlatformCarrierType,
} from '@/lib/console/platform-catalog-options'
import { db } from '@/lib/db'
import { pageValues } from '@/lib/server/dataaccess/pagination'

export { PLATFORM_CARRIER_TYPES, type PlatformCarrierType }

export type PlatformCarrierItem = {
  id: string
  code: string
  name: string
  type: PlatformCarrierType
  coverage: string
  note: string
  status: 'active' | 'inactive'
  sortOrder: number
  referenced: boolean
  updatedAt: Date
}

const CARRIER_TYPE_VALUES = new Set<string>(PLATFORM_CARRIER_TYPES.map((item) => item.value))

function normalizeType(value: string | null | undefined): PlatformCarrierType {
  const raw = (value ?? '').trim().toLowerCase()
  if (raw === '平台物流') return 'platform'
  if (raw === '国际快递') return 'express'
  if (raw === '海运') return 'ocean'
  if (raw === '尾程派送') return 'last_mile'
  if (CARRIER_TYPE_VALUES.has(raw)) return raw as PlatformCarrierType
  return 'platform'
}

function mapRow(row: typeof platformCarriersCatalog.$inferSelect, referenced = false): PlatformCarrierItem {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: normalizeType(row.type),
    coverage: row.coverage ?? '',
    note: row.note ?? '',
    status: row.status === 'inactive' ? 'inactive' : 'active',
    sortOrder: Number(row.sortOrder ?? 0),
    referenced,
    updatedAt: row.updatedAt,
  }
}

async function findConflict(code: string, excludeId?: string) {
  const filters = [eq(platformCarriersCatalog.code, code)]
  if (excludeId) filters.push(sql`${platformCarriersCatalog.id} <> ${excludeId}`)
  const rows = await db
    .select({ id: platformCarriersCatalog.id })
    .from(platformCarriersCatalog)
    .where(and(...filters))
    .limit(1)
  return rows.length > 0
}

async function referencedIds(ids: string[]) {
  if (ids.length === 0) return new Set<string>()
  const rows = await db
    .selectDistinct({ sourceId: commerceCarriers.sourceId })
    .from(commerceCarriers)
    .where(inArray(commerceCarriers.sourceId, ids))
  return new Set(rows.map((row) => row.sourceId).filter((id): id is string => Boolean(id)))
}

export async function listPlatformCarriers(input: {
  page?: number
  pageSize?: number
  q?: string
  status?: string
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const filters: SQL[] = []
  if (input.status === 'active' || input.status === 'inactive') {
    filters.push(eq(platformCarriersCatalog.status, input.status))
  }
  if (input.q?.trim()) {
    const value = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(platformCarriersCatalog.code, value),
        ilike(platformCarriersCatalog.name, value),
        ilike(platformCarriersCatalog.coverage, value),
        ilike(platformCarriersCatalog.note, value),
      )!,
    )
  }
  const where = filters.length > 0 ? and(...filters) : undefined
  const totalRows = await db.select({ total: count() }).from(platformCarriersCatalog).where(where)
  const total = Number(totalRows[0]?.total ?? 0)
  const rows = await db
    .select()
    .from(platformCarriersCatalog)
    .where(where)
    .orderBy(platformCarriersCatalog.sortOrder, platformCarriersCatalog.code)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const referenced = await referencedIds(rows.map((row) => row.id))
  return { items: rows.map((row) => mapRow(row, referenced.has(row.id))), total, page, pageSize }
}

export type PlatformCarrierInput = {
  code: string
  name: string
  type?: string
  coverage?: string
  note?: string
  status?: 'active' | 'inactive'
  sortOrder?: number
}

function normalizeInput(input: PlatformCarrierInput) {
  const code = input.code.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9_-]{1,63}$/.test(code)) {
    throw new Error('承运商编码应为大写字母开头，可含数字、连字符或下划线，如 CAR-LGS')
  }
  const name = input.name.trim()
  if (!name) throw new Error('承运商名称不能为空')
  return {
    code,
    name,
    type: normalizeType(input.type),
    coverage: input.coverage?.trim() || '',
    note: input.note?.trim() || '',
    status: input.status === 'inactive' ? 'inactive' : ('active' as const),
    sortOrder: input.sortOrder ?? 0,
  }
}

async function nextSortOrder() {
  const rows = await db
    .select({ max: sql<number | null>`max(${platformCarriersCatalog.sortOrder})` })
    .from(platformCarriersCatalog)
  return Number(rows[0]?.max ?? 0) + 10
}

export async function createPlatformCarrier(input: PlatformCarrierInput) {
  const values = normalizeInput(input)
  if (await findConflict(values.code)) {
    throw new Error(`承运商 ${values.code} 已存在`)
  }
  const [row] = await db
    .insert(platformCarriersCatalog)
    .values({
      id: createId(),
      ...values,
      sortOrder: values.sortOrder || (await nextSortOrder()),
    })
    .returning()
  if (!row) throw new Error('保存失败')
  return mapRow(row)
}

export async function updatePlatformCarrier(input: { id: string } & PlatformCarrierInput) {
  const values = normalizeInput(input)
  const [existing] = await db
    .select()
    .from(platformCarriersCatalog)
    .where(eq(platformCarriersCatalog.id, input.id))
    .limit(1)
  if (!existing) throw new Error('承运商目录项不存在')
  if (await findConflict(values.code, input.id)) {
    throw new Error(`承运商 ${values.code} 已存在`)
  }
  const [row] = await db
    .update(platformCarriersCatalog)
    .set({
      ...values,
      sortOrder: values.sortOrder || existing.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(platformCarriersCatalog.id, input.id))
    .returning()
  if (!row) throw new Error('保存失败')
  return mapRow(row)
}

export async function deletePlatformCarrier(id: string) {
  const [existing] = await db
    .select({ id: platformCarriersCatalog.id, name: platformCarriersCatalog.name })
    .from(platformCarriersCatalog)
    .where(eq(platformCarriersCatalog.id, id))
    .limit(1)
  if (!existing) throw new Error('承运商目录项不存在')
  const refs = await db
    .select({ id: commerceCarriers.id })
    .from(commerceCarriers)
    .where(eq(commerceCarriers.sourceId, id))
    .limit(1)
  if (refs.length > 0) {
    throw new Error('已有组织引用此承运商，请改为停用，不能删除')
  }
  await db.delete(platformCarriersCatalog).where(eq(platformCarriersCatalog.id, id))
  return { id }
}

export async function ensurePlatformCarrierDefaults() {
  return ensurePlatformCarriersCatalog(db)
}
