/**
 * commerce_carton_specs（模块16）。
 * 箱规主数据独立于 ocean_shipment_boxes（柜次装箱行）；海运/运费可按 code 引用。
 */
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { commerceCartonSpecs } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  formatStamp,
  toDbActiveStatus,
  toUiActiveStatus,
  type UiActiveStatus,
} from '@/lib/server/mappers/ops-master'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type CartonSpecDto = {
  id: string
  code: string
  name: string
  applicablePack: string
  lengthCm: number
  widthCm: number
  heightCm: number
  grossWeightKg: number
  unitsPerCarton: number
  status: UiActiveStatus
  dbStatus: string
  note: string
  createdAt: string
  updatedAt: string
}

function num(v: string | number | null | undefined): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function mapRow(row: typeof commerceCartonSpecs.$inferSelect): CartonSpecDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    applicablePack: row.applicablePack || '单件',
    lengthCm: num(row.lengthCm),
    widthCm: num(row.widthCm),
    heightCm: num(row.heightCm),
    grossWeightKg: num(row.grossWeightKg),
    unitsPerCarton: row.unitsPerCarton ?? 1,
    status: toUiActiveStatus(row.status),
    dbStatus: row.status,
    note: row.note ?? '',
    createdAt: formatStamp(row.createdAt),
    updatedAt: formatStamp(row.updatedAt),
  }
}

export async function listCartonSpecs(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string } = {},
): Promise<PaginatedResult<CartonSpecDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize ?? 50)
  const filters: SQL[] = [eq(commerceCartonSpecs.organizationId, organizationId)]
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(commerceCartonSpecs.code, q),
        ilike(commerceCartonSpecs.name, q),
        ilike(commerceCartonSpecs.applicablePack, q),
        ilike(commerceCartonSpecs.note, q),
      )!,
    )
  }
  if (input.status === '启用' || input.status === 'active') filters.push(eq(commerceCartonSpecs.status, 'active'))
  if (input.status === '停用' || input.status === 'disabled') filters.push(eq(commerceCartonSpecs.status, 'disabled'))
  const where = and(...filters)!
  const [totalRow] = await db.select({ value: count() }).from(commerceCartonSpecs).where(where)
  const rows = await db
    .select()
    .from(commerceCartonSpecs)
    .where(where)
    .orderBy(desc(commerceCartonSpecs.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return { items: rows.map(mapRow), total: Number(totalRow?.value ?? 0), page, pageSize }
}

export async function getCartonSpec(db: AppDatabase, organizationId: string, idOrCode: string) {
  const [byId] = await db
    .select()
    .from(commerceCartonSpecs)
    .where(and(eq(commerceCartonSpecs.organizationId, organizationId), eq(commerceCartonSpecs.id, idOrCode)))
    .limit(1)
  if (byId) return mapRow(byId)
  const [byCode] = await db
    .select()
    .from(commerceCartonSpecs)
    .where(and(eq(commerceCartonSpecs.organizationId, organizationId), eq(commerceCartonSpecs.code, idOrCode)))
    .limit(1)
  return byCode ? mapRow(byCode) : null
}

async function nextCode(db: DbLike, organizationId: string) {
  const rows = await db
    .select({ code: commerceCartonSpecs.code })
    .from(commerceCartonSpecs)
    .where(eq(commerceCartonSpecs.organizationId, organizationId))
  let max = 0
  for (const row of rows) {
    const m = /^CTN-(\d+)$/.exec(row.code)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `CTN-${String(max + 1).padStart(4, '0')}`
}

export async function createCartonSpec(
  db: AppDatabase,
  organizationId: string,
  input: {
    name: string
    applicablePack?: string
    lengthCm?: number
    widthCm?: number
    heightCm?: number
    grossWeightKg?: number
    unitsPerCarton?: number
    status?: string
    note?: string
    code?: string
  },
) {
  const code = input.code?.trim() || (await nextCode(db, organizationId))
  const [existing] = await db
    .select()
    .from(commerceCartonSpecs)
    .where(and(eq(commerceCartonSpecs.organizationId, organizationId), eq(commerceCartonSpecs.code, code)))
    .limit(1)
  if (existing) throw new Error(`箱规编码已存在：${code}`)
  const now = new Date()
  const id = createId()
  await db.insert(commerceCartonSpecs).values({
    id,
    organizationId,
    code,
    name: input.name.trim(),
    applicablePack: input.applicablePack?.trim() || '单件',
    lengthCm: String(input.lengthCm ?? 0),
    widthCm: String(input.widthCm ?? 0),
    heightCm: String(input.heightCm ?? 0),
    grossWeightKg: String(input.grossWeightKg ?? 0),
    unitsPerCarton: Math.max(1, Math.floor(input.unitsPerCarton ?? 1)),
    status: toDbActiveStatus(input.status),
    note: input.note ?? '',
    createdAt: now,
    updatedAt: now,
  })
  const row = await getCartonSpec(db, organizationId, id)
  if (!row) throw new Error('创建箱规失败')
  return row
}

export async function updateCartonSpec(
  db: AppDatabase,
  organizationId: string,
  input: {
    id: string
    name?: string
    applicablePack?: string
    lengthCm?: number
    widthCm?: number
    heightCm?: number
    grossWeightKg?: number
    unitsPerCarton?: number
    status?: string
    note?: string
  },
) {
  const existing = await getCartonSpec(db, organizationId, input.id)
  if (!existing) throw new Error(`箱规不存在：${input.id}`)
  const patch: Partial<typeof commerceCartonSpecs.$inferInsert> = { updatedAt: new Date() }
  if (input.name != null) patch.name = input.name.trim()
  if (input.applicablePack != null) patch.applicablePack = input.applicablePack.trim() || '单件'
  if (input.lengthCm != null) patch.lengthCm = String(input.lengthCm)
  if (input.widthCm != null) patch.widthCm = String(input.widthCm)
  if (input.heightCm != null) patch.heightCm = String(input.heightCm)
  if (input.grossWeightKg != null) patch.grossWeightKg = String(input.grossWeightKg)
  if (input.unitsPerCarton != null) patch.unitsPerCarton = Math.max(1, Math.floor(input.unitsPerCarton))
  if (input.status != null) patch.status = toDbActiveStatus(input.status)
  if (input.note != null) patch.note = input.note
  await db
    .update(commerceCartonSpecs)
    .set(patch)
    .where(and(eq(commerceCartonSpecs.organizationId, organizationId), eq(commerceCartonSpecs.id, existing.id)))
  const row = await getCartonSpec(db, organizationId, existing.id)
  if (!row) throw new Error('更新箱规失败')
  return row
}

/** 停用箱规（软停用，不物理删除；已被装箱行引用时同样只改状态）。 */
export async function removeCartonSpec(db: AppDatabase, organizationId: string, idOrCode: string) {
  const existing = await getCartonSpec(db, organizationId, idOrCode)
  if (!existing) throw new Error('箱规不存在')
  await db
    .update(commerceCartonSpecs)
    .set({ status: toDbActiveStatus('停用'), updatedAt: new Date() })
    .where(and(eq(commerceCartonSpecs.organizationId, organizationId), eq(commerceCartonSpecs.id, existing.id)))
  return { id: existing.id, code: existing.code, status: '停用' as const }
}
