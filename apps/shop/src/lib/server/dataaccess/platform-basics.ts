/**
 * 平台基础资料（组织副本 commerce_platform_basics）。
 *
 * 平台目录在企业入驻审核通过时初始化到组织下；组织内的增删改只写本表，
 * 不影响其他组织，也不回写平台目录 `platform_basics_catalog`。
 * @see docs/design/haoshiyun-platform-basics-ued.md §7
 */
import { and, count, eq, ilike, or, sql } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import type { AppDatabase } from '@workspace/db'
import { commercePlatformBasics, type PlatformBasicKind } from '@workspace/db/schema'
import {
  platformBasicKindLabels,
  type PlatformBasicValue,
} from '@workspace/db/platform-basics'
import { formatStamp } from '@/lib/server/mappers/ops-master'
import { normalizePage, normalizePageSize, type PaginatedResult } from './pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type PlatformBasicsItem = PlatformBasicValue & {
  id: string
  /** 平台初始化来源；组织内手工新增为 null */
  sourceId: string | null
  origin: 'platform' | 'custom'
  updatedAt: string
}

function mapRow(row: typeof commercePlatformBasics.$inferSelect): PlatformBasicsItem {
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
    sourceId: row.sourceId,
    origin: row.sourceId ? 'platform' : 'custom',
    updatedAt: formatStamp(row.updatedAt),
  }
}

async function findConflict(
  db: DbLike,
  organizationId: string,
  kind: PlatformBasicKind,
  code: string,
  excludeId?: string,
) {
  const filters = [
    eq(commercePlatformBasics.organizationId, organizationId),
    eq(commercePlatformBasics.kind, kind),
    eq(commercePlatformBasics.code, code),
  ]
  if (excludeId) filters.push(sql`${commercePlatformBasics.id} <> ${excludeId}`)
  const rows = await db
    .select({ id: commercePlatformBasics.id })
    .from(commercePlatformBasics)
    .where(and(...filters))
    .limit(1)
  return rows.length > 0
}

async function nextSortOrder(db: DbLike, organizationId: string, kind: PlatformBasicKind) {
  const rows = await db
    .select({ max: sql<number | null>`max(${commercePlatformBasics.sortOrder})` })
    .from(commercePlatformBasics)
    .where(
      and(
        eq(commercePlatformBasics.organizationId, organizationId),
        eq(commercePlatformBasics.kind, kind),
      ),
    )
  return Number(rows[0]?.max ?? 0) + 1
}

export async function listPlatformBasics(
  db: AppDatabase,
  organizationId: string,
  input: {
    kind: PlatformBasicKind
    page?: number
    pageSize?: number
    q?: string
    status?: string
  },
): Promise<PaginatedResult<PlatformBasicsItem>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters = [
    eq(commercePlatformBasics.organizationId, organizationId),
    eq(commercePlatformBasics.kind, input.kind),
  ]
  if (input.status === 'active' || input.status === 'inactive') {
    filters.push(eq(commercePlatformBasics.status, input.status))
  }
  if (input.q?.trim()) {
    const value = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(commercePlatformBasics.code, value),
        ilike(commercePlatformBasics.name, value),
        ilike(commercePlatformBasics.description, value),
      )!,
    )
  }
  const where = and(...filters)
  const [totalRow] = await db
    .select({ c: count() })
    .from(commercePlatformBasics)
    .where(where)
  const rows = await db
    .select()
    .from(commercePlatformBasics)
    .where(where)
    .orderBy(commercePlatformBasics.sortOrder, commercePlatformBasics.code)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return {
    items: rows.map(mapRow),
    total: Number(totalRow?.c ?? 0),
    page,
    pageSize,
  }
}

export async function createPlatformBasics(
  db: DbLike,
  organizationId: string,
  input: PlatformBasicValue,
) {
  if (await findConflict(db, organizationId, input.kind, input.code)) {
    throw new Error(`代码 ${input.code} 在${platformBasicKindLabels[input.kind]}下已存在`)
  }
  const [row] = await db
    .insert(commercePlatformBasics)
    .values({
      id: createId(),
      organizationId,
      sourceId: null,
      ...input,
      sortOrder: input.sortOrder || (await nextSortOrder(db, organizationId, input.kind)),
    })
    .returning()
  if (!row) throw new Error('保存失败')
  return mapRow(row)
}

export async function updatePlatformBasics(
  db: DbLike,
  organizationId: string,
  input: { id: string; values: PlatformBasicValue },
) {
  const [existing] = await db
    .select()
    .from(commercePlatformBasics)
    .where(
      and(
        eq(commercePlatformBasics.organizationId, organizationId),
        eq(commercePlatformBasics.id, input.id),
      ),
    )
    .limit(1)
  if (!existing) throw new Error('平台基础资料不存在')
  if (await findConflict(db, organizationId, input.values.kind, input.values.code, input.id)) {
    throw new Error(
      `代码 ${input.values.code} 在${platformBasicKindLabels[input.values.kind]}下已存在`,
    )
  }
  const [row] = await db
    .update(commercePlatformBasics)
    .set({
      ...input.values,
      sortOrder: input.values.sortOrder || existing.sortOrder,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(commercePlatformBasics.organizationId, organizationId),
        eq(commercePlatformBasics.id, input.id),
      ),
    )
    .returning()
  if (!row) throw new Error('保存失败')
  return mapRow(row)
}

export async function deletePlatformBasics(db: DbLike, organizationId: string, id: string) {
  const rows = await db
    .delete(commercePlatformBasics)
    .where(
      and(
        eq(commercePlatformBasics.organizationId, organizationId),
        eq(commercePlatformBasics.id, id),
      ),
    )
    .returning({ id: commercePlatformBasics.id })
  if (rows.length === 0) throw new Error('平台基础资料不存在')
  return { id }
}
