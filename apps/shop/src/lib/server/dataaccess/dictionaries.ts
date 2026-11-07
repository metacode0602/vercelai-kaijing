/**
 * commerce_dictionaries（模块15）。
 * 租户字典配置表；种子可写入初始键，不再用 localStorage demo。
 */
import { and, asc, eq, notInArray } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { commerceDictionaries } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { formatStamp } from '@/lib/server/mappers/ops-master'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

/** 品牌 / 品类已有独立实体与维护页，不再作为普通字典暴露。 */
export const EXCLUDED_DICTIONARY_KEYS = ['product_brand', 'product_category']

export type DictionaryDto = {
  id: string
  key: string
  label: string
  description: string
  shared: boolean
  values: string[]
  /** value -> 中文标题；缺省时回退到 value 本身 */
  valueTitles: Record<string, string>
  inactiveValues: string[]
  updatedAt: string
}

function mapRow(row: typeof commerceDictionaries.$inferSelect): DictionaryDto {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description ?? '',
    shared: Boolean(row.shared),
    values: Array.isArray(row.values) ? row.values.map(String) : [],
    valueTitles:
      row.valueTitles && typeof row.valueTitles === 'object'
        ? Object.fromEntries(
            Object.entries(row.valueTitles).map(([value, title]) => [value, String(title)]),
          )
        : {},
    inactiveValues: Array.isArray(row.inactiveValues) ? row.inactiveValues.map(String) : [],
    updatedAt: formatStamp(row.updatedAt),
  }
}

export async function listDictionaries(db: AppDatabase, organizationId: string): Promise<DictionaryDto[]> {
  const rows = await db
    .select()
    .from(commerceDictionaries)
    .where(
      and(
        eq(commerceDictionaries.organizationId, organizationId),
        notInArray(commerceDictionaries.key, EXCLUDED_DICTIONARY_KEYS),
      ),
    )
    .orderBy(asc(commerceDictionaries.key))
  return rows.map(mapRow)
}

export async function getDictionary(db: AppDatabase, organizationId: string, key: string) {
  const [row] = await db
    .select()
    .from(commerceDictionaries)
    .where(and(eq(commerceDictionaries.organizationId, organizationId), eq(commerceDictionaries.key, key)))
    .limit(1)
  return row ? mapRow(row) : null
}

export async function upsertDictionary(
  db: DbLike,
  organizationId: string,
  input: {
    key: string
    label: string
    description?: string
    shared?: boolean
    values?: string[]
    valueTitles?: Record<string, string>
    inactiveValues?: string[]
  },
) {
  const key = input.key.trim()
  if (!key) throw new Error('字典 key 不能为空')
  const existing = await getDictionary(db as AppDatabase, organizationId, key)
  const now = new Date()
  if (existing) {
    await db
      .update(commerceDictionaries)
      .set({
        label: input.label.trim() || existing.label,
        description: input.description ?? existing.description,
        shared: input.shared ?? existing.shared,
        values: input.values ?? existing.values,
        valueTitles: input.valueTitles ?? existing.valueTitles,
        inactiveValues: input.inactiveValues ?? existing.inactiveValues,
        updatedAt: now,
      })
      .where(and(eq(commerceDictionaries.organizationId, organizationId), eq(commerceDictionaries.key, key)))
  } else {
    await db.insert(commerceDictionaries).values({
      id: createId(),
      organizationId,
      key,
      label: input.label.trim() || key,
      description: input.description?.trim() || '',
      shared: input.shared ?? true,
      values: input.values ?? [],
      valueTitles: input.valueTitles ?? {},
      inactiveValues: input.inactiveValues ?? [],
      createdAt: now,
      updatedAt: now,
    })
  }
  return getDictionary(db as AppDatabase, organizationId, key)
}

export async function addDictionaryValue(
  db: DbLike,
  organizationId: string,
  key: string,
  input: { value: string; title: string },
) {
  const existing = await getDictionary(db as AppDatabase, organizationId, key)
  if (!existing) throw new Error('字典不存在')
  const value = input.value.trim()
  const title = input.title.trim()
  if (!value) throw new Error('值不能为空')
  if (!title) throw new Error('标题不能为空')
  if (existing.values.includes(value)) throw new Error(`值 ${value} 已存在`)
  return upsertDictionary(db, organizationId, {
    key,
    label: existing.label,
    values: [...existing.values, value],
    valueTitles: { ...existing.valueTitles, [value]: title },
    inactiveValues: existing.inactiveValues,
    description: existing.description,
    shared: existing.shared,
  })
}

export async function updateDictionaryValue(
  db: DbLike,
  organizationId: string,
  key: string,
  input: { from: string; to: string; title: string },
) {
  const existing = await getDictionary(db as AppDatabase, organizationId, key)
  if (!existing) throw new Error('字典不存在')
  const from = input.from.trim()
  const to = input.to.trim()
  const title = input.title.trim()
  if (!from || !to) throw new Error('值不能为空')
  if (!title) throw new Error('标题不能为空')
  if (
    from !== to &&
    existing.values.some((value) => value !== from && value.toLowerCase() === to.toLowerCase())
  ) {
    throw new Error(`标准值 ${to} 已存在`)
  }
  const valueTitles = { ...existing.valueTitles }
  delete valueTitles[from]
  valueTitles[to] = title
  return upsertDictionary(db, organizationId, {
    key,
    label: existing.label,
    description: existing.description,
    shared: existing.shared,
    values: existing.values.map((value) => (value === from ? to : value)),
    valueTitles,
    inactiveValues: existing.inactiveValues.map((value) => (value === from ? to : value)),
  })
}

export async function setDictionaryValueActive(
  db: DbLike,
  organizationId: string,
  key: string,
  value: string,
  active: boolean,
) {
  const existing = await getDictionary(db as AppDatabase, organizationId, key)
  if (!existing) throw new Error('字典不存在')
  const inactive = new Set(existing.inactiveValues)
  if (active) inactive.delete(value)
  else inactive.add(value)
  return upsertDictionary(db, organizationId, {
    key,
    label: existing.label,
    values: existing.values,
    inactiveValues: [...inactive],
    description: existing.description,
    shared: existing.shared,
  })
}

export function activeDictionaryValues(row: DictionaryDto): string[] {
  const inactive = new Set(row.inactiveValues)
  return row.values.filter((v) => !inactive.has(v))
}
