import { and, count, eq, ilike, inArray, notInArray, or, sql } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { commerceDictionaries, platformDictionariesCatalog } from '@workspace/db'
import {
  EXCLUDED_DICTIONARY_KEYS,
  ensurePlatformDictionariesCatalog,
} from '@workspace/db/platform-catalogs'
import { db } from '@/lib/db'
import { pageValues } from '@/lib/server/dataaccess/pagination'

export type PlatformDictionaryItem = {
  id: string
  key: string
  label: string
  description: string
  values: string[]
  valueTitles: Record<string, string>
  inactiveValues: string[]
  status: 'active' | 'inactive'
  sortOrder: number
  referenced: boolean
  updatedAt: Date
}

function mapTitles(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
}

function mapRow(
  row: typeof platformDictionariesCatalog.$inferSelect,
  referenced = false,
): PlatformDictionaryItem {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description ?? '',
    values: Array.isArray(row.values) ? row.values.map(String) : [],
    valueTitles: mapTitles(row.valueTitles),
    inactiveValues: Array.isArray(row.inactiveValues) ? row.inactiveValues.map(String) : [],
    status: row.status === 'inactive' ? 'inactive' : 'active',
    sortOrder: Number(row.sortOrder ?? 0),
    referenced,
    updatedAt: row.updatedAt,
  }
}

const excludedKeys = [...EXCLUDED_DICTIONARY_KEYS]

async function findConflict(key: string, excludeId?: string) {
  const filters = [eq(platformDictionariesCatalog.key, key)]
  if (excludeId) filters.push(sql`${platformDictionariesCatalog.id} <> ${excludeId}`)
  const rows = await db
    .select({ id: platformDictionariesCatalog.id })
    .from(platformDictionariesCatalog)
    .where(and(...filters))
    .limit(1)
  return rows.length > 0
}

async function referencedIds(ids: string[]) {
  if (ids.length === 0) return new Set<string>()
  const rows = await db
    .selectDistinct({ sourceId: commerceDictionaries.sourceId })
    .from(commerceDictionaries)
    .where(inArray(commerceDictionaries.sourceId, ids))
  return new Set(rows.map((row) => row.sourceId).filter((id): id is string => Boolean(id)))
}

export async function listPlatformDictionaries(input: {
  page?: number
  pageSize?: number
  q?: string
  status?: string
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const filters = [notInArray(platformDictionariesCatalog.key, excludedKeys)]
  if (input.status === 'active' || input.status === 'inactive') {
    filters.push(eq(platformDictionariesCatalog.status, input.status))
  }
  if (input.q?.trim()) {
    const value = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(platformDictionariesCatalog.key, value),
        ilike(platformDictionariesCatalog.label, value),
        ilike(platformDictionariesCatalog.description, value),
      )!,
    )
  }
  const where = and(...filters)
  const totalRows = await db.select({ total: count() }).from(platformDictionariesCatalog).where(where)
  const total = Number(totalRows[0]?.total ?? 0)
  const rows = await db
    .select()
    .from(platformDictionariesCatalog)
    .where(where)
    .orderBy(platformDictionariesCatalog.sortOrder, platformDictionariesCatalog.key)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const referenced = await referencedIds(rows.map((row) => row.id))
  return { items: rows.map((row) => mapRow(row, referenced.has(row.id))), total, page, pageSize }
}

export type PlatformDictionaryInput = {
  key: string
  label: string
  description?: string
  values?: string[]
  valueTitles?: Record<string, string>
  inactiveValues?: string[]
  status?: 'active' | 'inactive'
  sortOrder?: number
}

function normalizeInput(input: PlatformDictionaryInput) {
  const key = input.key.trim().toLowerCase()
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(key)) {
    throw new Error('字典 key 应为小写字母开头的标识，如 product_color')
  }
  if (excludedKeys.includes(key as (typeof excludedKeys)[number])) {
    throw new Error('品牌和品类已有独立主档，不能作为字典')
  }
  const label = input.label.trim()
  if (!label) throw new Error('字典名称不能为空')
  const values = Array.from(new Set((input.values ?? []).map((item) => item.trim()).filter(Boolean)))
  const valueTitles = Object.fromEntries(
    Object.entries(input.valueTitles ?? {})
      .map(([value, title]) => [value.trim(), String(title).trim()] as const)
      .filter(([value, title]) => value && title && values.includes(value)),
  )
  const inactiveValues = Array.from(
    new Set((input.inactiveValues ?? []).map((item) => item.trim()).filter((item) => values.includes(item))),
  )
  return {
    key,
    label,
    description: input.description?.trim() || '',
    values,
    valueTitles,
    inactiveValues,
    status: input.status === 'inactive' ? 'inactive' : ('active' as const),
    sortOrder: input.sortOrder ?? 0,
  }
}

async function nextSortOrder() {
  const rows = await db
    .select({ max: sql<number | null>`max(${platformDictionariesCatalog.sortOrder})` })
    .from(platformDictionariesCatalog)
  return Number(rows[0]?.max ?? 0) + 10
}

export async function createPlatformDictionary(input: PlatformDictionaryInput) {
  const values = normalizeInput(input)
  if (await findConflict(values.key)) {
    throw new Error(`字典 ${values.key} 已存在`)
  }
  const [row] = await db
    .insert(platformDictionariesCatalog)
    .values({
      id: createId(),
      ...values,
      sortOrder: values.sortOrder || (await nextSortOrder()),
    })
    .returning()
  if (!row) throw new Error('保存失败')
  return mapRow(row)
}

export async function updatePlatformDictionary(input: { id: string } & PlatformDictionaryInput) {
  const values = normalizeInput(input)
  const [existing] = await db
    .select()
    .from(platformDictionariesCatalog)
    .where(eq(platformDictionariesCatalog.id, input.id))
    .limit(1)
  if (!existing) throw new Error('字典目录项不存在')
  if (await findConflict(values.key, input.id)) {
    throw new Error(`字典 ${values.key} 已存在`)
  }
  const [row] = await db
    .update(platformDictionariesCatalog)
    .set({
      ...values,
      sortOrder: values.sortOrder || existing.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(platformDictionariesCatalog.id, input.id))
    .returning()
  if (!row) throw new Error('保存失败')
  return mapRow(row)
}

export async function deletePlatformDictionary(id: string) {
  const [existing] = await db
    .select({ id: platformDictionariesCatalog.id, label: platformDictionariesCatalog.label })
    .from(platformDictionariesCatalog)
    .where(eq(platformDictionariesCatalog.id, id))
    .limit(1)
  if (!existing) throw new Error('字典目录项不存在')
  const refs = await db
    .select({ id: commerceDictionaries.id })
    .from(commerceDictionaries)
    .where(eq(commerceDictionaries.sourceId, id))
    .limit(1)
  if (refs.length > 0) {
    throw new Error('已有组织引用此字典，请改为停用，不能删除')
  }
  await db.delete(platformDictionariesCatalog).where(eq(platformDictionariesCatalog.id, id))
  return { id }
}

export async function ensurePlatformDictionaryDefaults() {
  return ensurePlatformDictionariesCatalog(db)
}
