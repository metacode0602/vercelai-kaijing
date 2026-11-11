/**
 * commerce_brands 品牌主档 dataaccess。
 * 勿与 platform_brands（平台类目/品牌缓存）混用。
 */
import { and, asc, count, desc, eq, ilike, isNull, ne, or, sql, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { commerceBrands, products } from '@workspace/db/schema'
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
import { withUniqueGuard } from '@/lib/server/errors/unique-constraint'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type BrandDto = {
  id: string
  code: string
  name: string
  status: UiActiveStatus
  dbStatus: string
  note: string
  coverImage?: string
  productCount: number
  updatedAt: string
}

async function nextBrandCode(db: DbLike, organizationId: string): Promise<string> {
  const rows = await db
    .select({ code: commerceBrands.code })
    .from(commerceBrands)
    .where(eq(commerceBrands.organizationId, organizationId))
  let max = 0
  for (const row of rows) {
    const m = /^BRD-(\d+)$/.exec(row.code)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `BRD-${String(max + 1).padStart(4, '0')}`
}

function mapRow(row: typeof commerceBrands.$inferSelect, productCount = 0): BrandDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: toUiActiveStatus(row.status),
    dbStatus: row.status,
    note: row.note ?? '',
    coverImage: row.coverImage ?? undefined,
    productCount,
    updatedAt: formatStamp(row.updatedAt),
  }
}

export async function listBrands(
  db: AppDatabase,
  organizationId: string,
  input: {
    page?: number
    pageSize?: number
    q?: string
    status?: string
    activeOnly?: boolean
  } = {},
): Promise<PaginatedResult<BrandDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(commerceBrands.organizationId, organizationId)]
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(or(ilike(commerceBrands.code, q), ilike(commerceBrands.name, q))!)
  }
  if (input.activeOnly || input.status === '启用' || input.status === 'active') {
    filters.push(eq(commerceBrands.status, 'active'))
  } else if (input.status === '停用' || input.status === 'disabled') {
    filters.push(eq(commerceBrands.status, 'disabled'))
  }
  const where = and(...filters)
  const [totalRow] = await db.select({ c: count() }).from(commerceBrands).where(where)
  const rows = await db
    .select({
      brand: commerceBrands,
      productCount: sql<number>`(
        select count(*)::int from ${products}
        where ${products.brandId} = ${commerceBrands.id}
          and ${products.deletedAt} is null
      )`,
    })
    .from(commerceBrands)
    .where(where)
    .orderBy(desc(commerceBrands.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  return {
    items: rows.map((row) => mapRow(row.brand, Number(row.productCount ?? 0))),
    total: Number(totalRow?.c ?? 0),
    page,
    pageSize,
  }
}

export async function brandStats(db: AppDatabase, organizationId: string) {
  const [total] = await db
    .select({ c: count() })
    .from(commerceBrands)
    .where(eq(commerceBrands.organizationId, organizationId))
  const [active] = await db
    .select({ c: count() })
    .from(commerceBrands)
    .where(and(eq(commerceBrands.organizationId, organizationId), eq(commerceBrands.status, 'active')))
  const [disabled] = await db
    .select({ c: count() })
    .from(commerceBrands)
    .where(
      and(eq(commerceBrands.organizationId, organizationId), eq(commerceBrands.status, 'disabled')),
    )
  return {
    total: Number(total?.c ?? 0),
    active: Number(active?.c ?? 0),
    disabled: Number(disabled?.c ?? 0),
  }
}

export async function listBrandsForSelect(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select({ id: commerceBrands.id, code: commerceBrands.code, name: commerceBrands.name })
    .from(commerceBrands)
    .where(and(eq(commerceBrands.organizationId, organizationId), eq(commerceBrands.status, 'active')))
    .orderBy(asc(commerceBrands.name))
  return rows
}

export async function getBrand(db: AppDatabase, organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(commerceBrands)
    .where(and(eq(commerceBrands.organizationId, organizationId), eq(commerceBrands.id, id)))
    .limit(1)
  if (!row) return null
  const [pc] = await db
    .select({ c: count() })
    .from(products)
    .where(
      and(eq(products.organizationId, organizationId), eq(products.brandId, id), isNull(products.deletedAt)),
    )
  return mapRow(row, Number(pc?.c ?? 0))
}

export async function getBrandByCode(db: AppDatabase, organizationId: string, code: string) {
  const [row] = await db
    .select()
    .from(commerceBrands)
    .where(and(eq(commerceBrands.organizationId, organizationId), eq(commerceBrands.code, code)))
    .limit(1)
  if (!row) return null
  return getBrand(db, organizationId, row.id)
}

export async function createBrand(
  db: DbLike,
  organizationId: string,
  input: { name: string; code?: string; status?: string; note?: string; coverImage?: string },
) {
  const name = input.name.trim()
  if (!name) throw new Error('品牌名称不能为空')
  const code = (input.code?.trim().toUpperCase() || (await nextBrandCode(db, organizationId))).toUpperCase()
  const existing = await db
    .select({ id: commerceBrands.id })
    .from(commerceBrands)
    .where(and(eq(commerceBrands.organizationId, organizationId), eq(commerceBrands.code, code)))
    .limit(1)
  if (existing[0]) throw new Error(`品牌编码 ${code} 已存在`)
  const [nameExisting] = await db
    .select({ id: commerceBrands.id })
    .from(commerceBrands)
    .where(and(eq(commerceBrands.organizationId, organizationId), eq(commerceBrands.name, name)))
    .limit(1)
  if (nameExisting) throw new Error(`品牌名称 ${name} 已存在`)
  const id = createId()
  const now = new Date()
  const coverImage = input.coverImage?.trim() || null
  await withUniqueGuard(
    () =>
      db.insert(commerceBrands).values({
        id,
        organizationId,
        code,
        name,
        status: toDbActiveStatus(input.status),
        note: input.note?.trim() || '',
        coverImage,
        createdAt: now,
        updatedAt: now,
      }),
    {
      commerce_brands_org_name_uidx: `品牌名称 ${name} 已存在`,
      commerce_brands_org_code_uidx: `品牌编码 ${code} 已存在`,
    },
    '品牌名称或编码已存在',
  )
  return getBrand(db as AppDatabase, organizationId, id)
}

export async function updateBrand(
  db: DbLike,
  organizationId: string,
  input: { id: string; name?: string; status?: string; note?: string; coverImage?: string | null },
) {
  const existing = await getBrand(db as AppDatabase, organizationId, input.id)
  if (!existing) throw new Error('品牌不存在')
  const nextName = input.name?.trim() ?? existing.name
  if (!nextName) throw new Error('品牌名称不能为空')
  const [nameExisting] = await db
    .select({ id: commerceBrands.id })
    .from(commerceBrands)
    .where(
      and(
        eq(commerceBrands.organizationId, organizationId),
        eq(commerceBrands.name, nextName),
        ne(commerceBrands.id, input.id),
      ),
    )
    .limit(1)
  if (nameExisting) throw new Error(`品牌名称 ${nextName} 已存在`)
  const nextCover =
    input.coverImage === undefined
      ? existing.coverImage ?? null
      : input.coverImage?.trim() || null
  await withUniqueGuard(
    () =>
      db
        .update(commerceBrands)
        .set({
          name: nextName,
          status: input.status != null ? toDbActiveStatus(input.status) : existing.dbStatus,
          note: input.note ?? existing.note,
          coverImage: nextCover,
          updatedAt: new Date(),
        })
        .where(and(eq(commerceBrands.organizationId, organizationId), eq(commerceBrands.id, input.id))),
    {
      commerce_brands_org_name_uidx: `品牌名称 ${nextName} 已存在`,
      commerce_brands_org_code_uidx: `品牌编码 ${existing.code} 已存在`,
    },
    '品牌名称或编码已存在',
  )

  // 同步兼容展示名
  if (input.name != null && nextName !== existing.name) {
    await db
      .update(products)
      .set({ brand: nextName, updatedAt: new Date() })
      .where(and(eq(products.organizationId, organizationId), eq(products.brandId, input.id)))
  }

  return getBrand(db as AppDatabase, organizationId, input.id)
}

/** 解析品牌：优先 brandId，其次按名称匹配启用品牌 */
export async function resolveBrandForProduct(
  db: DbLike,
  organizationId: string,
  input: { brandId?: string | null; brand?: string | null },
): Promise<{ brandId: string | null; brandName: string }> {
  if (input.brandId) {
    const [row] = await db
      .select()
      .from(commerceBrands)
      .where(
        and(eq(commerceBrands.organizationId, organizationId), eq(commerceBrands.id, input.brandId)),
      )
      .limit(1)
    if (!row) throw new Error('所选品牌不存在')
    if (row.status === 'disabled') throw new Error('所选品牌已停用')
    return { brandId: row.id, brandName: row.name }
  }
  const name = input.brand?.trim() ?? ''
  if (!name) return { brandId: null, brandName: '' }
  const [row] = await db
    .select()
    .from(commerceBrands)
    .where(
      and(
        eq(commerceBrands.organizationId, organizationId),
        eq(commerceBrands.name, name),
        eq(commerceBrands.status, 'active'),
      ),
    )
    .limit(1)
  if (row) return { brandId: row.id, brandName: row.name }
  return { brandId: null, brandName: name }
}
