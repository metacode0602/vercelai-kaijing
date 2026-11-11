import { and, count, eq, ilike, or, sql } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { platformBasicsCatalog, type PlatformBasicKind } from '@workspace/db'
import {
  ensurePlatformBasicsCatalog,
  platformBasicKindLabels,
  type PlatformBasicValue,
} from '@workspace/db/platform-basics'
import { db } from '@/lib/db'
import { pageValues } from '@/lib/server/dataaccess/pagination'

/**
 * 平台基础资料目录（apps/web 平台侧维护，全局受控）。
 * 目录是初始化数据的真源：入驻审核通过时复制到 `commerce_platform_basics` 组织副本，
 * 组织内 CRUD 只写自己的副本，不回写目录。
 * @see docs/design/haoshiyun-platform-basics-ued.md §7
 */

export type PlatformBasicsItem = PlatformBasicValue & {
  id: string
  updatedAt: Date
}

function mapRow(row: typeof platformBasicsCatalog.$inferSelect): PlatformBasicsItem {
  return {
    id: row.id,
    kind: row.kind,
    code: row.code,
    name: row.name,
    status: row.status,
    description: row.description,
    sortOrder: row.sortOrder,
    region: row.region,
    timezone: row.timezone,
    defaultCurrency: row.defaultCurrency,
    symbol: row.symbol,
    decimals: row.decimals,
    countries: row.countries ?? [],
    apiReady: row.apiReady,
    updatedAt: row.updatedAt,
  }
}

async function findConflict(kind: PlatformBasicKind, code: string, excludeId?: string) {
  const filters = [eq(platformBasicsCatalog.kind, kind), eq(platformBasicsCatalog.code, code)]
  if (excludeId) {
    filters.push(sql`${platformBasicsCatalog.id} <> ${excludeId}`)
  }
  const rows = await db
    .select({ id: platformBasicsCatalog.id })
    .from(platformBasicsCatalog)
    .where(and(...filters))
    .limit(1)
  return rows.length > 0
}

async function nextSortOrder(kind: PlatformBasicKind) {
  const rows = await db
    .select({ max: sql<number | null>`max(${platformBasicsCatalog.sortOrder})` })
    .from(platformBasicsCatalog)
    .where(eq(platformBasicsCatalog.kind, kind))
  return Number(rows[0]?.max ?? 0) + 1
}

export async function listPlatformBasics(input: {
  kind: PlatformBasicKind
  page?: number
  pageSize?: number
  q?: string
  status?: string
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const filters = [eq(platformBasicsCatalog.kind, input.kind)]
  if (input.status === 'active' || input.status === 'inactive') {
    filters.push(eq(platformBasicsCatalog.status, input.status))
  }
  if (input.q?.trim()) {
    const value = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(platformBasicsCatalog.code, value),
        ilike(platformBasicsCatalog.name, value),
        ilike(platformBasicsCatalog.description, value),
      )!,
    )
  }
  const where = and(...filters)

  const totalRows = await db.select({ total: count() }).from(platformBasicsCatalog).where(where)
  const total = Number(totalRows[0]?.total ?? 0)
  const rows = await db
    .select()
    .from(platformBasicsCatalog)
    .where(where)
    .orderBy(platformBasicsCatalog.sortOrder, platformBasicsCatalog.code)
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return { items: rows.map(mapRow), total, page, pageSize }
}

export async function createPlatformBasics(input: PlatformBasicValue) {
  if (await findConflict(input.kind, input.code)) {
    throw new Error(`代码 ${input.code} 在${platformBasicKindLabels[input.kind]}下已存在`)
  }
  const [row] = await db
    .insert(platformBasicsCatalog)
    .values({
      id: createId(),
      ...input,
      sortOrder: input.sortOrder || (await nextSortOrder(input.kind)),
    })
    .returning()
  if (!row) throw new Error('保存失败')
  return mapRow(row)
}

export async function updatePlatformBasics(input: {
  id: string
  values: PlatformBasicValue
}) {
  const [existing] = await db
    .select()
    .from(platformBasicsCatalog)
    .where(eq(platformBasicsCatalog.id, input.id))
    .limit(1)
  if (!existing) throw new Error('平台基础资料不存在')
  if (await findConflict(input.values.kind, input.values.code, input.id)) {
    throw new Error(`代码 ${input.values.code} 在${platformBasicKindLabels[input.values.kind]}下已存在`)
  }
  const [row] = await db
    .update(platformBasicsCatalog)
    .set({
      ...input.values,
      sortOrder: input.values.sortOrder || existing.sortOrder,
      updatedAt: new Date(),
    })
    .where(eq(platformBasicsCatalog.id, input.id))
    .returning()
  if (!row) throw new Error('保存失败')
  return mapRow(row)
}

export async function deletePlatformBasics(id: string) {
  const rows = await db
    .delete(platformBasicsCatalog)
    .where(eq(platformBasicsCatalog.id, id))
    .returning({ id: platformBasicsCatalog.id })
  if (rows.length === 0) throw new Error('平台基础资料不存在')
  return { id }
}

/** 补齐平台初始目录（只补缺失，不覆盖平台已改过的行）。 */
export async function ensurePlatformBasicsDefaults() {
  return ensurePlatformBasicsCatalog(db)
}
