/**
 * commerce_categories（模块15 内部品类树）。
 * platform_categories 仍为平台同步缓存，不在此页伪造平台类目树。
 */
import { and, asc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { commerceCategories } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  formatStamp,
  toDbActiveStatus,
  toUiActiveStatus,
  type UiActiveStatus,
} from '@/lib/server/mappers/ops-master'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type CategoryDto = {
  id: string
  code: string
  name: string
  parentId: string | null
  sort: number
  status: UiActiveStatus
  dbStatus: string
  note: string
  coverImage?: string
  screenshots?: string[]
  createdAt: string
  updatedAt: string
}

function mapRow(row: typeof commerceCategories.$inferSelect): CategoryDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    parentId: row.parentId ?? null,
    sort: Number(row.sort ?? 10),
    status: toUiActiveStatus(row.status),
    dbStatus: row.status,
    note: row.note ?? '',
    coverImage: row.coverImage ?? undefined,
    screenshots: Array.isArray(row.screenshots) ? row.screenshots : [],
    createdAt: formatStamp(row.createdAt),
    updatedAt: formatStamp(row.updatedAt),
  }
}

export async function listCategories(
  db: AppDatabase,
  organizationId: string,
  input: { q?: string; status?: string } = {},
): Promise<CategoryDto[]> {
  const filters: SQL[] = [eq(commerceCategories.organizationId, organizationId)]
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(or(ilike(commerceCategories.code, q), ilike(commerceCategories.name, q))!)
  }
  if (input.status === '启用' || input.status === 'active') filters.push(eq(commerceCategories.status, 'active'))
  if (input.status === '停用' || input.status === 'disabled') filters.push(eq(commerceCategories.status, 'disabled'))
  const rows = await db
    .select()
    .from(commerceCategories)
    .where(and(...filters)!)
    .orderBy(asc(commerceCategories.sort), asc(commerceCategories.name))
  return rows.map(mapRow)
}

export async function getCategory(db: AppDatabase, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(commerceCategories)
    .where(and(eq(commerceCategories.organizationId, organizationId), eq(commerceCategories.id, id)))
    .limit(1)
  return row ? mapRow(row) : null
}

export async function createCategory(
  db: DbLike,
  organizationId: string,
  input: {
    name: string
    code: string
    parentId?: string | null
    sort?: number
    status?: string
    note?: string
    coverImage?: string
    screenshots?: string[]
  },
) {
  const code = input.code.trim().toUpperCase() || 'CATEGORY'
  const id = createId()
  const now = new Date()
  if (input.parentId) {
    const parent = await getCategory(db as AppDatabase, organizationId, input.parentId)
    if (!parent) throw new Error('上级品类不存在')
  }
  await db.insert(commerceCategories).values({
    id,
    organizationId,
    code,
    name: input.name.trim() || '未命名品类',
    parentId: input.parentId || null,
    sort: input.sort ?? 10,
    status: toDbActiveStatus(input.status),
    note: input.note?.trim() || '',
    coverImage: input.coverImage,
    screenshots: input.screenshots ?? [],
    createdAt: now,
    updatedAt: now,
  })
  return getCategory(db as AppDatabase, organizationId, id)
}

export async function updateCategory(
  db: DbLike,
  organizationId: string,
  input: {
    id: string
    name?: string
    code?: string
    parentId?: string | null
    sort?: number
    status?: string
    note?: string
    coverImage?: string
    screenshots?: string[]
  },
) {
  const existing = await getCategory(db as AppDatabase, organizationId, input.id)
  if (!existing) throw new Error('品类不存在')
  if (input.parentId) {
    if (input.parentId === input.id) throw new Error('不能将自己设为上级')
    const parent = await getCategory(db as AppDatabase, organizationId, input.parentId)
    if (!parent) throw new Error('上级品类不存在')
  }
  await db
    .update(commerceCategories)
    .set({
      name: input.name?.trim() ?? existing.name,
      code: input.code?.trim().toUpperCase() ?? existing.code,
      parentId: input.parentId === undefined ? existing.parentId : input.parentId,
      sort: input.sort ?? existing.sort,
      status: input.status != null ? toDbActiveStatus(input.status) : existing.dbStatus,
      note: input.note ?? existing.note,
      coverImage: input.coverImage === undefined ? existing.coverImage : input.coverImage,
      screenshots: input.screenshots ?? existing.screenshots ?? [],
      updatedAt: new Date(),
    })
    .where(and(eq(commerceCategories.organizationId, organizationId), eq(commerceCategories.id, input.id)))
  return getCategory(db as AppDatabase, organizationId, input.id)
}

export function categoryPath(rows: CategoryDto[], node: CategoryDto): string {
  const parts = [node.name]
  let parentId = node.parentId
  const seen = new Set<string>()
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = rows.find((r) => r.id === parentId)
    if (!parent) break
    parts.unshift(parent.name)
    parentId = parent.parentId
  }
  return parts.join(' / ')
}

export function activeCategoryPaths(rows: CategoryDto[]): string[] {
  return rows.filter((r) => r.status === '启用').map((r) => categoryPath(rows, r))
}
