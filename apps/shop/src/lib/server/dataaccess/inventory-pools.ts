/**
 * inventory_pools — 共享库存池 dataaccess。
 * 池挂在仓库上，店铺通过 shops.inventory_pool_id 加入；当前不提供独立管理页。
 */
import { and, asc, count, eq, ilike, inArray, or, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { commerceWarehouses, inventoryPools, shops } from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import { formatStamp } from '@/lib/server/mappers/wms'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type InventoryPoolDto = {
  id: string
  code: string
  name: string
  warehouseId: string
  warehouseCode: string
  status: '启用' | '停用'
  note: string
  shopCount: number
  updatedAt: string
}

function toUiPoolStatus(status: string | undefined): '启用' | '停用' {
  return status === 'disabled' || status === '停用' ? '停用' : '启用'
}

function toDbPoolStatus(status: string | undefined): 'active' | 'disabled' {
  return status === 'disabled' || status === '停用' ? 'disabled' : 'active'
}

async function resolveWarehouse(
  db: DbLike,
  organizationId: string,
  idOrCode: string,
): Promise<{ id: string; code: string }> {
  const term = idOrCode.trim()
  if (!term) throw new Error('库存池必须关联仓库')
  const [row] = await db
    .select({ id: commerceWarehouses.id, code: commerceWarehouses.code })
    .from(commerceWarehouses)
    .where(
      and(
        eq(commerceWarehouses.organizationId, organizationId),
        or(eq(commerceWarehouses.id, term), eq(commerceWarehouses.code, term)),
      ),
    )
    .limit(1)
  if (!row) throw new Error(`仓库 ${term} 不存在`)
  return row
}

async function shopCountsByPool(
  db: DbLike,
  organizationId: string,
  poolIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (poolIds.length === 0) return result
  const rows = await db
    .select({ poolId: shops.inventoryPoolId, c: count() })
    .from(shops)
    .where(
      and(
        eq(shops.organizationId, organizationId),
        inArray(shops.inventoryPoolId, poolIds),
      ),
    )
    .groupBy(shops.inventoryPoolId)
  for (const row of rows) {
    if (row.poolId) result.set(row.poolId, Number(row.c))
  }
  return result
}

export async function listInventoryPools(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; status?: string } = {},
): Promise<PaginatedResult<InventoryPoolDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const filters: SQL[] = [eq(inventoryPools.organizationId, organizationId)]
  if (input.status) {
    filters.push(eq(inventoryPools.status, toDbPoolStatus(input.status)))
  }
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(inventoryPools.code, q),
        ilike(inventoryPools.name, q),
        ilike(inventoryPools.note, q),
        ilike(commerceWarehouses.code, q),
      )!,
    )
  }
  const where = and(...filters)
  const [totalRow] = await db
    .select({ c: count() })
    .from(inventoryPools)
    .innerJoin(commerceWarehouses, eq(commerceWarehouses.id, inventoryPools.warehouseId))
    .where(where)
  const rows = await db
    .select({ pool: inventoryPools, warehouseCode: commerceWarehouses.code })
    .from(inventoryPools)
    .innerJoin(commerceWarehouses, eq(commerceWarehouses.id, inventoryPools.warehouseId))
    .where(where)
    .orderBy(asc(inventoryPools.code))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const counts = await shopCountsByPool(
    db,
    organizationId,
    rows.map((r) => r.pool.id),
  )
  return {
    items: rows.map(({ pool, warehouseCode }) => ({
      id: pool.id,
      code: pool.code,
      name: pool.name,
      warehouseId: pool.warehouseId,
      warehouseCode,
      status: toUiPoolStatus(pool.status),
      note: pool.note || '',
      shopCount: counts.get(pool.id) || 0,
      updatedAt: formatStamp(pool.updatedAt),
    })),
    total: Number(totalRow?.c ?? 0),
    page,
    pageSize,
  }
}

export async function getInventoryPool(
  db: AppDatabase | DbLike,
  organizationId: string,
  idOrCode: string,
): Promise<InventoryPoolDto | null> {
  const [row] = await db
    .select({ pool: inventoryPools, warehouseCode: commerceWarehouses.code })
    .from(inventoryPools)
    .innerJoin(commerceWarehouses, eq(commerceWarehouses.id, inventoryPools.warehouseId))
    .where(
      and(
        eq(inventoryPools.organizationId, organizationId),
        or(eq(inventoryPools.id, idOrCode), eq(inventoryPools.code, idOrCode)),
      ),
    )
    .limit(1)
  if (!row) return null
  const counts = await shopCountsByPool(db, organizationId, [row.pool.id])
  return {
    id: row.pool.id,
    code: row.pool.code,
    name: row.pool.name,
    warehouseId: row.pool.warehouseId,
    warehouseCode: row.warehouseCode,
    status: toUiPoolStatus(row.pool.status),
    note: row.pool.note || '',
    shopCount: counts.get(row.pool.id) || 0,
    updatedAt: formatStamp(row.pool.updatedAt),
  }
}

export async function createInventoryPool(
  db: AppDatabase,
  organizationId: string,
  input: {
    code: string
    name: string
    warehouseId: string
    status?: string
    note?: string
  },
): Promise<InventoryPoolDto> {
  const code = input.code.trim().toUpperCase()
  const name = input.name.trim()
  if (!code || !name) throw new Error('库存池编码与名称必填')
  return db.transaction(async (tx) => {
    const warehouse = await resolveWarehouse(tx, organizationId, input.warehouseId)
    const [dup] = await tx
      .select({ id: inventoryPools.id })
      .from(inventoryPools)
      .where(
        and(
          eq(inventoryPools.organizationId, organizationId),
          eq(inventoryPools.code, code),
        ),
      )
      .limit(1)
    if (dup) throw new Error(`库存池编码 ${code} 已存在`)
    const id = createId()
    await tx.insert(inventoryPools).values({
      id,
      organizationId,
      code,
      name,
      warehouseId: warehouse.id,
      status: toDbPoolStatus(input.status),
      note: input.note?.trim() || null,
    })
    return (await getInventoryPool(tx, organizationId, id))!
  })
}

export async function updateInventoryPool(
  db: AppDatabase,
  organizationId: string,
  id: string,
  patch: Partial<{ name: string; warehouseId: string; status: string; note: string }>,
): Promise<InventoryPoolDto> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(inventoryPools)
      .where(
        and(
          eq(inventoryPools.organizationId, organizationId),
          eq(inventoryPools.id, id),
        ),
      )
      .limit(1)
    if (!current) throw new Error('库存池不存在')
    const warehouse =
      patch.warehouseId !== undefined
        ? await resolveWarehouse(tx, organizationId, patch.warehouseId)
        : null
    // 编码创建后不可变：patch 不接收 code。
    await tx
      .update(inventoryPools)
      .set({
        name: patch.name !== undefined ? patch.name.trim() || current.name : current.name,
        warehouseId: warehouse?.id ?? current.warehouseId,
        status:
          patch.status !== undefined
            ? toDbPoolStatus(patch.status)
            : toDbPoolStatus(current.status),
        note: patch.note !== undefined ? patch.note.trim() || null : current.note,
        updatedAt: new Date(),
      })
      .where(eq(inventoryPools.id, current.id))
    return (await getInventoryPool(tx, organizationId, current.id))!
  })
}

/** 店铺加入/退出共享库存池；poolId 传 null 表示退出。 */
export async function assignShopInventoryPool(
  db: AppDatabase,
  organizationId: string,
  shopId: string,
  poolId: string | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [shop] = await tx
      .select({ id: shops.id })
      .from(shops)
      .where(and(eq(shops.organizationId, organizationId), eq(shops.id, shopId)))
      .limit(1)
    if (!shop) throw new Error('店铺不存在')
    if (poolId) {
      const pool = await getInventoryPool(tx, organizationId, poolId)
      if (!pool) throw new Error('库存池不存在')
      if (pool.status !== '启用') throw new Error('停用库存池不可加入')
    }
    await tx
      .update(shops)
      .set({ inventoryPoolId: poolId, updatedAt: new Date() })
      .where(eq(shops.id, shop.id))
  })
}
