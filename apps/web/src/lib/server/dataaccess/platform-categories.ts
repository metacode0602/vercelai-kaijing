import { and, eq, inArray, sql } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { commerceCategories, platformCategoryTreesCatalog } from '@workspace/db'
import { ensurePlatformCategoryTreesCatalog } from '@workspace/db/platform-catalogs'
import { db } from '@/lib/db'
import { pageValues } from '@/lib/server/dataaccess/pagination'

export type PlatformCategoryItem = {
  id: string
  code: string
  name: string
  parentId: string | null
  parentName: string | null
  path: string
  depth: number
  sort: number
  status: 'active' | 'inactive'
  note: string
  referenced: boolean
  hasChildren: boolean
  updatedAt: Date
}

function mapBase(row: typeof platformCategoryTreesCatalog.$inferSelect) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    parentId: row.parentId ?? null,
    sort: Number(row.sort ?? 10),
    status: (row.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
    note: row.note ?? '',
    updatedAt: row.updatedAt,
  }
}

export function flattenCategoryTree<T extends { id: string; parentId: string | null; sort: number; name: string; code: string }>(
  rows: T[],
  parentId: string | null = null,
): T[] {
  return rows
    .filter((row) => row.parentId === parentId)
    .sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code))
    .flatMap((row) => [row, ...flattenCategoryTree(rows, row.id)])
}

function pathOf<T extends { id: string; parentId: string | null; name: string }>(rows: T[], node: T): string {
  const parts = [node.name]
  let parentId = node.parentId
  const seen = new Set<string>()
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = rows.find((row) => row.id === parentId)
    if (!parent) break
    parts.unshift(parent.name)
    parentId = parent.parentId
  }
  return parts.join(' / ')
}

function depthOf<T extends { id: string; parentId: string | null }>(rows: T[], node: T): number {
  let depth = 0
  let parentId = node.parentId
  const seen = new Set<string>()
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    depth += 1
    parentId = rows.find((row) => row.id === parentId)?.parentId ?? null
  }
  return depth
}

export async function listPlatformCategories(input: {
  page?: number
  pageSize?: number
  q?: string
  status?: string
}) {
  const { page, pageSize } = pageValues(input.page, input.pageSize)
  const all = await db
    .select()
    .from(platformCategoryTreesCatalog)
    .orderBy(platformCategoryTreesCatalog.sort, platformCategoryTreesCatalog.code)
  const mapped = all.map(mapBase)
  const flattened = flattenCategoryTree(mapped)
  const q = input.q?.trim().toLowerCase()
  const filtered = flattened.filter((row) => {
    if (input.status === 'active' || input.status === 'inactive') {
      if (row.status !== input.status) return false
    }
    if (q && !`${row.code} ${row.name} ${row.note}`.toLowerCase().includes(q)) return false
    return true
  })
  const total = filtered.length
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const referenced = new Set<string>()
  const childIds = new Set(all.filter((row) => row.parentId).map((row) => row.parentId as string))
  if (pageRows.length > 0) {
    const refs = await db
      .selectDistinct({ sourceId: commerceCategories.sourceId })
      .from(commerceCategories)
      .where(
        inArray(
          commerceCategories.sourceId,
          pageRows.map((row) => row.id),
        ),
      )
    for (const row of refs) {
      if (row.sourceId) referenced.add(row.sourceId)
    }
  }
  const items: PlatformCategoryItem[] = pageRows.map((row) => ({
    ...row,
    parentName: row.parentId ? (mapped.find((item) => item.id === row.parentId)?.name ?? null) : null,
    path: pathOf(mapped, row),
    depth: depthOf(mapped, row),
    referenced: referenced.has(row.id),
    hasChildren: childIds.has(row.id),
  }))
  return { items, total, page, pageSize, all: mapped.map((row) => ({ id: row.id, name: pathOf(mapped, row), code: row.code })) }
}

export type PlatformCategoryInput = {
  code: string
  name: string
  parentId?: string | null
  sort?: number
  status?: 'active' | 'inactive'
  note?: string
}

function normalizeInput(input: PlatformCategoryInput) {
  const code = input.code.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9-]{0,63}$/.test(code)) {
    throw new Error('品类编码应为大写字母开头，可含数字和连字符，如 APPAREL-TOPS')
  }
  const name = input.name.trim()
  if (!name) throw new Error('品类名称不能为空')
  return {
    code,
    name,
    parentId: input.parentId || null,
    sort: input.sort ?? 10,
    status: input.status === 'inactive' ? 'inactive' : ('active' as const),
    note: input.note?.trim() || '',
  }
}

async function assertCodeAvailable(code: string, excludeId?: string) {
  const filters = [eq(platformCategoryTreesCatalog.code, code)]
  if (excludeId) filters.push(sql`${platformCategoryTreesCatalog.id} <> ${excludeId}`)
  const rows = await db
    .select({ id: platformCategoryTreesCatalog.id })
    .from(platformCategoryTreesCatalog)
    .where(and(...filters))
    .limit(1)
  if (rows.length > 0) throw new Error(`品类编码 ${code} 已存在`)
}

async function assertParent(parentId: string | null, selfId?: string) {
  if (!parentId) return
  if (selfId && parentId === selfId) throw new Error('不能将自己设为上级')
  const [parent] = await db
    .select({ id: platformCategoryTreesCatalog.id, parentId: platformCategoryTreesCatalog.parentId })
    .from(platformCategoryTreesCatalog)
    .where(eq(platformCategoryTreesCatalog.id, parentId))
    .limit(1)
  if (!parent) throw new Error('上级品类不存在')
  if (selfId) {
    let cursor = parent.parentId
    const seen = new Set<string>([selfId, parent.id])
    while (cursor) {
      if (cursor === selfId) throw new Error('不能将下级品类设为上级')
      if (seen.has(cursor)) break
      seen.add(cursor)
      const [next] = await db
        .select({ parentId: platformCategoryTreesCatalog.parentId })
        .from(platformCategoryTreesCatalog)
        .where(eq(platformCategoryTreesCatalog.id, cursor))
        .limit(1)
      cursor = next?.parentId ?? null
    }
  }
}

export async function createPlatformCategory(input: PlatformCategoryInput) {
  const values = normalizeInput(input)
  await assertCodeAvailable(values.code)
  await assertParent(values.parentId)
  const [row] = await db
    .insert(platformCategoryTreesCatalog)
    .values({
      id: createId(),
      ...values,
    })
    .returning()
  if (!row) throw new Error('保存失败')
  return mapBase(row)
}

export async function updatePlatformCategory(input: { id: string } & PlatformCategoryInput) {
  const values = normalizeInput(input)
  const [existing] = await db
    .select()
    .from(platformCategoryTreesCatalog)
    .where(eq(platformCategoryTreesCatalog.id, input.id))
    .limit(1)
  if (!existing) throw new Error('品类目录项不存在')
  if (values.code !== existing.code) await assertCodeAvailable(values.code, input.id)
  await assertParent(values.parentId, input.id)
  const [row] = await db
    .update(platformCategoryTreesCatalog)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(platformCategoryTreesCatalog.id, input.id))
    .returning()
  if (!row) throw new Error('保存失败')
  return mapBase(row)
}

export async function deletePlatformCategory(id: string) {
  const [existing] = await db
    .select()
    .from(platformCategoryTreesCatalog)
    .where(eq(platformCategoryTreesCatalog.id, id))
    .limit(1)
  if (!existing) throw new Error('品类目录项不存在')
  const [child] = await db
    .select({ id: platformCategoryTreesCatalog.id })
    .from(platformCategoryTreesCatalog)
    .where(eq(platformCategoryTreesCatalog.parentId, id))
    .limit(1)
  if (child) throw new Error('该品类下还有子节点，请先处理子节点或改为停用，不能删除')
  const [ref] = await db
    .select({ id: commerceCategories.id })
    .from(commerceCategories)
    .where(eq(commerceCategories.sourceId, id))
    .limit(1)
  if (ref) throw new Error('已有组织引用此品类，请改为停用，不能删除')
  await db.delete(platformCategoryTreesCatalog).where(eq(platformCategoryTreesCatalog.id, id))
  return { id }
}

export async function ensurePlatformCategoryDefaults() {
  return ensurePlatformCategoryTreesCatalog(db)
}

