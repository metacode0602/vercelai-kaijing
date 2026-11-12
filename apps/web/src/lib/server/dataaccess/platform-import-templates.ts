import { and, count, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { commerceImportTemplates, platformImportTemplatesCatalog } from '@workspace/db'
import { ensurePlatformImportTemplatesCatalog } from '@workspace/db/platform-catalogs'
import { db } from '@/lib/db'
import { pageValues } from '@/lib/server/dataaccess/pagination'

export type PlatformImportTemplateItem = {
  id: string
  kind: string
  version: string
  fields: string
  duplicateStrategy: string
  rollbackStrategy: string
  note: string
  status: 'active' | 'inactive'
  sortOrder: number
  referenced: boolean
  updatedAt: Date
}

function mapRow(
  row: typeof platformImportTemplatesCatalog.$inferSelect,
  referenced = false,
): PlatformImportTemplateItem {
  return {
    id: row.id,
    kind: row.kind,
    version: row.version,
    fields: row.fields ?? '',
    duplicateStrategy: row.duplicateStrategy ?? '',
    rollbackStrategy: row.rollbackStrategy ?? '',
    note: row.note ?? '',
    status: row.status === 'inactive' ? 'inactive' : 'active',
    sortOrder: Number(row.sortOrder ?? 0),
    referenced,
    updatedAt: row.updatedAt,
  }
}

async function findConflict(kind: string, version: string, excludeId?: string) {
  const filters = [
    eq(platformImportTemplatesCatalog.kind, kind),
    eq(platformImportTemplatesCatalog.version, version),
  ]
  if (excludeId) filters.push(sql`${platformImportTemplatesCatalog.id} <> ${excludeId}`)
  const rows = await db
    .select({ id: platformImportTemplatesCatalog.id })
    .from(platformImportTemplatesCatalog)
    .where(and(...filters))
    .limit(1)
  return rows.length > 0
}

async function referencedIds(ids: string[]) {
  if (ids.length === 0) return new Set<string>()
  const rows = await db
    .selectDistinct({ sourceId: commerceImportTemplates.sourceId })
    .from(commerceImportTemplates)
    .where(inArray(commerceImportTemplates.sourceId, ids))
  return new Set(rows.map((row) => row.sourceId).filter((id): id is string => Boolean(id)))
}

export async function listPlatformImportTemplates(input: {
  page?: number
  pageSize?: number
  q?: string
  status?: string
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const filters: SQL[] = []
  if (input.status === 'active' || input.status === 'inactive') {
    filters.push(eq(platformImportTemplatesCatalog.status, input.status))
  }
  if (input.q?.trim()) {
    const value = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(platformImportTemplatesCatalog.kind, value),
        ilike(platformImportTemplatesCatalog.version, value),
        ilike(platformImportTemplatesCatalog.fields, value),
        ilike(platformImportTemplatesCatalog.note, value),
      )!,
    )
  }
  const where = filters.length > 0 ? and(...filters) : undefined
  const totalRows = await db.select({ total: count() }).from(platformImportTemplatesCatalog).where(where)
  const total = Number(totalRows[0]?.total ?? 0)
  const rows = await db
    .select()
    .from(platformImportTemplatesCatalog)
    .where(where)
    .orderBy(platformImportTemplatesCatalog.sortOrder, platformImportTemplatesCatalog.kind)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const referenced = await referencedIds(rows.map((row) => row.id))
  return { items: rows.map((row) => mapRow(row, referenced.has(row.id))), total, page, pageSize }
}

export type PlatformImportTemplateInput = {
  kind: string
  version?: string
  fields?: string
  duplicateStrategy?: string
  rollbackStrategy?: string
  note?: string
  status?: 'active' | 'inactive'
  sortOrder?: number
}

function normalizeInput(input: PlatformImportTemplateInput) {
  const kind = input.kind.trim()
  if (!kind) throw new Error('模板类型不能为空')
  if (kind.length > 64) throw new Error('模板类型不能超过 64 个字符')
  const version = (input.version?.trim() || 'v1')
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(version)) {
    throw new Error('版本号应为字母、数字、点、连字符或下划线，如 v1')
  }
  return {
    kind,
    version,
    fields: input.fields?.trim() || '',
    duplicateStrategy: input.duplicateStrategy?.trim() || '',
    rollbackStrategy: input.rollbackStrategy?.trim() || '',
    note: input.note?.trim() || '',
    status: input.status === 'inactive' ? 'inactive' : ('active' as const),
    sortOrder: input.sortOrder ?? 0,
  }
}

async function nextSortOrder() {
  const rows = await db
    .select({ max: sql<number | null>`max(${platformImportTemplatesCatalog.sortOrder})` })
    .from(platformImportTemplatesCatalog)
  return Number(rows[0]?.max ?? 0) + 10
}

export async function createPlatformImportTemplate(input: PlatformImportTemplateInput) {
  const values = normalizeInput(input)
  if (await findConflict(values.kind, values.version)) {
    throw new Error(`导入模板 ${values.kind} ${values.version} 已存在`)
  }
  const [row] = await db
    .insert(platformImportTemplatesCatalog)
    .values({
      id: createId(),
      ...values,
      sortOrder: values.sortOrder || (await nextSortOrder()),
    })
    .returning()
  if (!row) throw new Error('保存失败')
  return mapRow(row)
}

export async function updatePlatformImportTemplate(input: { id: string } & PlatformImportTemplateInput) {
  const values = normalizeInput(input)
  const [existing] = await db
    .select()
    .from(platformImportTemplatesCatalog)
    .where(eq(platformImportTemplatesCatalog.id, input.id))
    .limit(1)
  if (!existing) throw new Error('导入模板目录项不存在')
  if (await findConflict(values.kind, values.version, input.id)) {
    throw new Error(`导入模板 ${values.kind} ${values.version} 已存在`)
  }
  const [row] = await db
    .update(platformImportTemplatesCatalog)
    .set({
      ...values,
      sortOrder: values.sortOrder || existing.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(platformImportTemplatesCatalog.id, input.id))
    .returning()
  if (!row) throw new Error('保存失败')
  return mapRow(row)
}

export async function deletePlatformImportTemplate(id: string) {
  const [existing] = await db
    .select({ id: platformImportTemplatesCatalog.id, kind: platformImportTemplatesCatalog.kind })
    .from(platformImportTemplatesCatalog)
    .where(eq(platformImportTemplatesCatalog.id, id))
    .limit(1)
  if (!existing) throw new Error('导入模板目录项不存在')
  const refs = await db
    .select({ id: commerceImportTemplates.id })
    .from(commerceImportTemplates)
    .where(eq(commerceImportTemplates.sourceId, id))
    .limit(1)
  if (refs.length > 0) {
    throw new Error('已有组织引用此导入模板，请改为停用，不能删除')
  }
  await db.delete(platformImportTemplatesCatalog).where(eq(platformImportTemplatesCatalog.id, id))
  return { id }
}

export async function ensurePlatformImportTemplateDefaults() {
  return ensurePlatformImportTemplatesCatalog(db)
}
