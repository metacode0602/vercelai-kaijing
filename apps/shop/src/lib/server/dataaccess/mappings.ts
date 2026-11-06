/**
 * Seller SKU 映射 + mapping_exceptions dataaccess（模块11）。
 */
import { and, count, desc, eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  mappingExceptions,
  productVariants,
  sellerSkuMappings,
  shops,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  formatStamp,
  platformLabel,
  toDbExceptionKind,
  toDbExceptionStatus,
  toDbMappingStatus,
  toUiExceptionKind,
  toUiExceptionStatus,
  toUiMappingStatus,
  type UiMappingExceptionKind,
  type UiMappingExceptionStatus,
  type UiMappingStatus,
} from '@/lib/server/mappers/listings'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type MappingListItem = {
  id: string
  shopId: string
  shop: string
  platform: string
  site: string
  itemId: string
  platformSkuId: string
  sellerSku: string
  internalSku: string
  variantId: string
  color: string
  size: string
  listingId: string
  listingStatus: string
  mappingStatus: UiMappingStatus
  source: string
  syncedAt: string
  updatedAt: string
  href: string
}

export type MappingExceptionDto = {
  id: string
  shopId: string
  shop: string
  platform: string
  order: string
  sellerSku: string
  internalSku: string
  itemId: string
  platformSkuId: string
  kind: UiMappingExceptionKind
  reason: string
  status: UiMappingExceptionStatus
  blocksReservation: boolean
  payloadSummary: string
  detail: string
  updatedAt: string
  createdAt: string
  resolvedAt: string
  resolution: string
}

function readMeta(meta: unknown): Record<string, unknown> {
  return meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : {}
}

function mappingHref(id: string) {
  return `/console/mappings/${encodeURIComponent(id)}`
}

async function loadShopMap(db: DbLike, organizationId: string, shopIds: string[]) {
  const uniq = [...new Set(shopIds.filter(Boolean))]
  if (uniq.length === 0) return new Map<string, typeof shops.$inferSelect>()
  const rows = await db
    .select()
    .from(shops)
    .where(and(eq(shops.organizationId, organizationId), inArray(shops.id, uniq)))
  return new Map(rows.map((row) => [row.id, row]))
}

async function loadVariantMap(db: DbLike, organizationId: string, variantIds: string[]) {
  const uniq = [...new Set(variantIds.filter(Boolean))]
  if (uniq.length === 0) return new Map<string, typeof productVariants.$inferSelect>()
  const rows = await db
    .select()
    .from(productVariants)
    .where(
      and(eq(productVariants.organizationId, organizationId), inArray(productVariants.id, uniq)),
    )
  return new Map(rows.map((row) => [row.id, row]))
}

function mapMappingRow(
  row: typeof sellerSkuMappings.$inferSelect,
  shop: typeof shops.$inferSelect | undefined,
  variant: typeof productVariants.$inferSelect | undefined,
): MappingListItem {
  const meta = readMeta(row.meta)
  const attrs =
    variant?.attrs && typeof variant.attrs === 'object' && !Array.isArray(variant.attrs)
      ? (variant.attrs as Record<string, unknown>)
      : {}
  const site =
    String(meta.site ?? shop?.marketplaceCountry ?? shop?.region ?? '').trim() || '—'
  const listingStatus = String(meta.listingStatus ?? '—')
  return {
    id: row.id,
    shopId: row.shopId,
    shop: shop?.name ?? '—',
    platform: platformLabel(shop?.platform ?? String(meta.platform ?? '')),
    site,
    itemId: row.itemId ?? '',
    platformSkuId: row.platformSkuId ?? '',
    sellerSku: row.sellerSku,
    internalSku: variant?.skuCode ?? variant?.sku ?? String(meta.internalSku ?? '—'),
    variantId: row.variantId ?? '',
    color: String(meta.color ?? attrs.color ?? '—'),
    size: String(meta.size ?? attrs.size ?? '—'),
    listingId: row.listingId ?? '',
    listingStatus,
    mappingStatus: toUiMappingStatus(row.status),
    source: row.source,
    syncedAt: formatStamp(row.syncedAt),
    updatedAt: formatStamp(row.updatedAt),
    href: mappingHref(row.id),
  }
}

function searchClause(q: string | undefined): SQL | undefined {
  const term = q?.trim()
  if (!term) return undefined
  const pattern = `%${term}%`
  return or(
    ilike(sellerSkuMappings.sellerSku, pattern),
    ilike(sellerSkuMappings.itemId, pattern),
    ilike(sellerSkuMappings.platformSkuId, pattern),
  )
}

export async function listMappings(
  db: AppDatabase,
  organizationId: string,
  input: {
    page?: number
    pageSize?: number
    q?: string
    status?: string
    shopId?: string
    listingId?: string
    internalSku?: string
  } = {},
): Promise<PaginatedResult<MappingListItem>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const offset = (page - 1) * pageSize
  const filters: SQL[] = [eq(sellerSkuMappings.organizationId, organizationId)]
  const search = searchClause(input.q)
  if (search) filters.push(search)
  if (input.shopId) filters.push(eq(sellerSkuMappings.shopId, input.shopId))
  if (input.listingId) filters.push(eq(sellerSkuMappings.listingId, input.listingId))
  if (input.status) {
    filters.push(eq(sellerSkuMappings.status, toDbMappingStatus(input.status)))
  }

  let variantIdsForSku: string[] | undefined
  if (input.internalSku?.trim()) {
    const variants = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.organizationId, organizationId),
          or(
            eq(productVariants.skuCode, input.internalSku.trim()),
            eq(productVariants.sku, input.internalSku.trim()),
          ),
        ),
      )
    variantIdsForSku = variants.map((v) => v.id)
    if (variantIdsForSku.length === 0) {
      return { items: [], total: 0, page, pageSize }
    }
    filters.push(inArray(sellerSkuMappings.variantId, variantIdsForSku))
  }

  const where = and(...filters)
  const [totalRow] = await db.select({ total: count() }).from(sellerSkuMappings).where(where)
  const rows = await db
    .select()
    .from(sellerSkuMappings)
    .where(where)
    .orderBy(desc(sellerSkuMappings.updatedAt))
    .limit(pageSize)
    .offset(offset)

  const shopMap = await loadShopMap(
    db,
    organizationId,
    rows.map((r) => r.shopId),
  )
  const variantMap = await loadVariantMap(
    db,
    organizationId,
    rows.map((r) => r.variantId ?? ''),
  )

  return {
    items: rows.map((row) =>
      mapMappingRow(row, shopMap.get(row.shopId), variantMap.get(row.variantId ?? '')),
    ),
    total: Number(totalRow?.total ?? 0),
    page,
    pageSize,
  }
}

export async function mappingStats(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select({ status: sellerSkuMappings.status, total: count() })
    .from(sellerSkuMappings)
    .where(eq(sellerSkuMappings.organizationId, organizationId))
    .groupBy(sellerSkuMappings.status)

  let total = 0
  let enabled = 0
  let pending = 0
  let abnormal = 0
  for (const row of rows) {
    const n = Number(row.total)
    total += n
    const ui = toUiMappingStatus(row.status)
    if (ui === '启用') enabled += n
    else if (ui === '待确认') pending += n
    else if (ui === '异常') abnormal += n
  }

  const [unmappedRow] = await db
    .select({ total: count() })
    .from(sellerSkuMappings)
    .where(
      and(
        eq(sellerSkuMappings.organizationId, organizationId),
        or(isNull(sellerSkuMappings.variantId), eq(sellerSkuMappings.status, 'exception')),
      ),
    )

  return {
    total,
    enabled,
    pending,
    abnormal,
    unmapped: Number(unmappedRow?.total ?? 0),
  }
}

export async function getMapping(
  db: AppDatabase,
  organizationId: string,
  id: string,
): Promise<MappingListItem | null> {
  const [row] = await db
    .select()
    .from(sellerSkuMappings)
    .where(and(eq(sellerSkuMappings.organizationId, organizationId), eq(sellerSkuMappings.id, id)))
    .limit(1)
  if (!row) return null
  const shopMap = await loadShopMap(db, organizationId, [row.shopId])
  const variantMap = await loadVariantMap(db, organizationId, [row.variantId ?? ''])
  return mapMappingRow(row, shopMap.get(row.shopId), variantMap.get(row.variantId ?? ''))
}

export async function getMappingByShopSellerSku(
  db: AppDatabase,
  organizationId: string,
  shopKey: string,
  sellerSku: string,
): Promise<MappingListItem | null> {
  const shopRows = await db
    .select()
    .from(shops)
    .where(
      and(
        eq(shops.organizationId, organizationId),
        or(eq(shops.id, shopKey), eq(shops.name, shopKey), ilike(shops.name, shopKey)),
      ),
    )
    .limit(5)
  if (shopRows.length === 0) return null
  for (const shop of shopRows) {
    const [row] = await db
      .select()
      .from(sellerSkuMappings)
      .where(
        and(
          eq(sellerSkuMappings.organizationId, organizationId),
          eq(sellerSkuMappings.shopId, shop.id),
          eq(sellerSkuMappings.sellerSku, sellerSku),
        ),
      )
      .limit(1)
    if (row) {
      const variantMap = await loadVariantMap(db, organizationId, [row.variantId ?? ''])
      return mapMappingRow(row, shop, variantMap.get(row.variantId ?? ''))
    }
  }
  return null
}

async function resolveShopId(
  db: DbLike,
  organizationId: string,
  shopIdOrName: string,
): Promise<typeof shops.$inferSelect> {
  const [byId] = await db
    .select()
    .from(shops)
    .where(
      and(
        eq(shops.organizationId, organizationId),
        eq(shops.id, shopIdOrName),
        isNull(shops.deletedAt),
      ),
    )
    .limit(1)
  if (byId) return byId
  const [byName] = await db
    .select()
    .from(shops)
    .where(
      and(
        eq(shops.organizationId, organizationId),
        eq(shops.name, shopIdOrName),
        isNull(shops.deletedAt),
      ),
    )
    .limit(1)
  if (byName) return byName
  throw new Error(`店铺不存在：${shopIdOrName}`)
}

async function resolveVariant(
  db: DbLike,
  organizationId: string,
  internalSku: string,
): Promise<typeof productVariants.$inferSelect> {
  const code = internalSku.trim()
  if (!code || code === '—') {
    throw new Error('请选择内部 SKU')
  }
  const [row] = await db
    .select()
    .from(productVariants)
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        or(eq(productVariants.skuCode, code), eq(productVariants.sku, code)),
      ),
    )
    .limit(1)
  if (!row) throw new Error(`未找到内部 SKU ${code}`)
  return row
}

export type CreateMappingInput = {
  shopId?: string
  shop?: string
  itemId?: string
  platformSkuId?: string
  sellerSku: string
  internalSku: string
  color?: string
  size?: string
  listingId?: string
  listingStatus?: string
  mappingStatus?: string
  source?: string
}

export async function createMapping(
  db: AppDatabase,
  organizationId: string,
  input: CreateMappingInput,
): Promise<MappingListItem> {
  const shop = await resolveShopId(db, organizationId, input.shopId || input.shop || '')
  const sellerSku = input.sellerSku.trim()
  if (!sellerSku) throw new Error('请填写 Seller SKU')

  const [dup] = await db
    .select({ id: sellerSkuMappings.id })
    .from(sellerSkuMappings)
    .where(
      and(
        eq(sellerSkuMappings.organizationId, organizationId),
        eq(sellerSkuMappings.shopId, shop.id),
        eq(sellerSkuMappings.sellerSku, sellerSku),
      ),
    )
    .limit(1)
  if (dup) throw new Error(`店铺 ${shop.name} 已存在 Seller SKU ${sellerSku}`)

  const variant = await resolveVariant(db, organizationId, input.internalSku)
  const id = createId()
  await db.insert(sellerSkuMappings).values({
    id,
    organizationId,
    shopId: shop.id,
    listingId: input.listingId || null,
    itemId: input.itemId?.trim() || null,
    platformSkuId: input.platformSkuId?.trim() || null,
    sellerSku,
    variantId: variant.id,
    status: toDbMappingStatus(input.mappingStatus || '待确认'),
    source: input.source || 'manual',
    meta: {
      color: input.color?.trim() || '',
      size: input.size?.trim() || '',
      listingStatus: input.listingStatus || '待同步',
      site: shop.marketplaceCountry || shop.region || '',
      platform: shop.platform,
      internalSku: variant.skuCode ?? variant.sku,
    },
  })
  const created = await getMapping(db, organizationId, id)
  if (!created) throw new Error('创建映射失败')
  return created
}

export type UpdateMappingInput = {
  itemId?: string
  platformSkuId?: string
  internalSku?: string
  color?: string
  size?: string
  listingStatus?: string
  mappingStatus?: string
  listingId?: string | null
}

export async function updateMapping(
  db: AppDatabase,
  organizationId: string,
  id: string,
  patch: UpdateMappingInput,
): Promise<MappingListItem> {
  const [row] = await db
    .select()
    .from(sellerSkuMappings)
    .where(and(eq(sellerSkuMappings.organizationId, organizationId), eq(sellerSkuMappings.id, id)))
    .limit(1)
  if (!row) throw new Error(`映射不存在：${id}`)

  let variantId = row.variantId
  let internalSkuMeta: string | undefined
  if (patch.internalSku != null) {
    const variant = await resolveVariant(db, organizationId, patch.internalSku)
    variantId = variant.id
    internalSkuMeta = variant.skuCode ?? variant.sku
  }

  const meta = {
    ...readMeta(row.meta),
    ...(patch.color != null ? { color: patch.color } : {}),
    ...(patch.size != null ? { size: patch.size } : {}),
    ...(patch.listingStatus != null ? { listingStatus: patch.listingStatus } : {}),
    ...(internalSkuMeta != null ? { internalSku: internalSkuMeta } : {}),
  }

  await db
    .update(sellerSkuMappings)
    .set({
      itemId: patch.itemId !== undefined ? patch.itemId.trim() || null : row.itemId,
      platformSkuId:
        patch.platformSkuId !== undefined
          ? patch.platformSkuId.trim() || null
          : row.platformSkuId,
      variantId,
      listingId: patch.listingId !== undefined ? patch.listingId : row.listingId,
      status:
        patch.mappingStatus != null ? toDbMappingStatus(patch.mappingStatus) : row.status,
      meta,
      updatedAt: new Date(),
    })
    .where(eq(sellerSkuMappings.id, id))

  const updated = await getMapping(db, organizationId, id)
  if (!updated) throw new Error('更新映射失败')
  return updated
}

/** 确认映射：绑定内部 SKU 并启用 */
export async function confirmMapping(
  db: AppDatabase,
  organizationId: string,
  id: string,
  internalSku?: string,
): Promise<MappingListItem> {
  const patch: UpdateMappingInput = { mappingStatus: '启用' }
  if (internalSku) patch.internalSku = internalSku
  return updateMapping(db, organizationId, id, patch)
}

/** 解绑：清空 variant，状态回待确认 */
export async function unbindMapping(
  db: AppDatabase,
  organizationId: string,
  id: string,
): Promise<MappingListItem> {
  const [row] = await db
    .select()
    .from(sellerSkuMappings)
    .where(and(eq(sellerSkuMappings.organizationId, organizationId), eq(sellerSkuMappings.id, id)))
    .limit(1)
  if (!row) throw new Error(`映射不存在：${id}`)
  const meta = { ...readMeta(row.meta), internalSku: '—' }
  await db
    .update(sellerSkuMappings)
    .set({
      variantId: null,
      status: 'pending',
      meta,
      updatedAt: new Date(),
    })
    .where(eq(sellerSkuMappings.id, id))
  const updated = await getMapping(db, organizationId, id)
  if (!updated) throw new Error('解绑失败')
  return updated
}

function exceptionBlocks(status: string, meta: Record<string, unknown>): boolean {
  if (status !== 'open') return false
  if (typeof meta.blocksReservation === 'boolean') return meta.blocksReservation
  return true
}

function mapExceptionRow(
  row: typeof mappingExceptions.$inferSelect,
  shop: typeof shops.$inferSelect | undefined,
): MappingExceptionDto {
  const meta = readMeta(row.meta)
  const kind = toUiExceptionKind(row.reason)
  const blocks = exceptionBlocks(row.status, meta)
  return {
    id: row.id,
    shopId: row.shopId ?? '',
    shop: shop?.name ?? String(meta.shop ?? '—'),
    platform: platformLabel(shop?.platform ?? String(meta.platform ?? '')),
    order: row.externalOrderId ?? String(meta.order ?? ''),
    sellerSku: row.sellerSku ?? '',
    internalSku: String(meta.internalSku ?? '—'),
    itemId: String(meta.itemId ?? ''),
    platformSkuId: row.platformSkuId ?? '',
    kind,
    reason: kind,
    status: toUiExceptionStatus(row.status, blocks),
    blocksReservation: blocks,
    payloadSummary: row.detail ?? String(meta.payloadSummary ?? ''),
    detail: row.detail ?? '',
    updatedAt: formatStamp(row.updatedAt),
    createdAt: formatStamp(row.createdAt),
    resolvedAt: formatStamp(row.resolvedAt),
    resolution: String(meta.resolution ?? ''),
  }
}

export async function listExceptions(
  db: AppDatabase,
  organizationId: string,
  input: {
    page?: number
    pageSize?: number
    q?: string
    status?: string
    kind?: string
    shopId?: string
  } = {},
): Promise<PaginatedResult<MappingExceptionDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const offset = (page - 1) * pageSize
  const filters: SQL[] = [eq(mappingExceptions.organizationId, organizationId)]
  if (input.shopId) filters.push(eq(mappingExceptions.shopId, input.shopId))
  if (input.status) {
    filters.push(eq(mappingExceptions.status, toDbExceptionStatus(input.status)))
  }
  if (input.kind) {
    filters.push(eq(mappingExceptions.reason, toDbExceptionKind(input.kind)))
  }
  const term = input.q?.trim()
  if (term) {
    const pattern = `%${term}%`
    filters.push(
      or(
        ilike(mappingExceptions.sellerSku, pattern),
        ilike(mappingExceptions.externalOrderId, pattern),
        ilike(mappingExceptions.platformSkuId, pattern),
        ilike(mappingExceptions.detail, pattern),
      )!,
    )
  }
  const where = and(...filters)
  const [totalRow] = await db.select({ total: count() }).from(mappingExceptions).where(where)
  const rows = await db
    .select()
    .from(mappingExceptions)
    .where(where)
    .orderBy(desc(mappingExceptions.updatedAt))
    .limit(pageSize)
    .offset(offset)
  const shopMap = await loadShopMap(
    db,
    organizationId,
    rows.map((r) => r.shopId ?? ''),
  )
  return {
    items: rows.map((row) => mapExceptionRow(row, shopMap.get(row.shopId ?? ''))),
    total: Number(totalRow?.total ?? 0),
    page,
    pageSize,
  }
}

export async function exceptionStats(db: AppDatabase, organizationId: string) {
  const rows = await listExceptions(db, organizationId, { page: 1, pageSize: 500 })
  const items = rows.items
  return {
    total: rows.total,
    open: items.filter((item) => item.status === '开放' || item.status === '阻断扣库').length,
    unmapped: items.filter((item) => item.kind === '未映射').length,
    conflict: items.filter(
      (item) => item.kind === '冲突' || item.kind === '重复 Seller SKU',
    ).length,
    disabled: items.filter((item) => item.kind === '停用 SKU').length,
    blocking: items.filter((item) => item.blocksReservation).length,
  }
}

export async function getException(
  db: AppDatabase,
  organizationId: string,
  id: string,
): Promise<MappingExceptionDto | null> {
  const [row] = await db
    .select()
    .from(mappingExceptions)
    .where(and(eq(mappingExceptions.organizationId, organizationId), eq(mappingExceptions.id, id)))
    .limit(1)
  if (!row) return null
  const shopMap = await loadShopMap(db, organizationId, [row.shopId ?? ''])
  return mapExceptionRow(row, shopMap.get(row.shopId ?? ''))
}

export async function resolveException(
  db: AppDatabase,
  organizationId: string,
  id: string,
  resolution: string,
  resolvedBy?: string,
): Promise<MappingExceptionDto> {
  if (!resolution.trim()) throw new Error('请填写修复说明')
  const [row] = await db
    .select()
    .from(mappingExceptions)
    .where(and(eq(mappingExceptions.organizationId, organizationId), eq(mappingExceptions.id, id)))
    .limit(1)
  if (!row) throw new Error(`异常不存在：${id}`)
  const meta = {
    ...readMeta(row.meta),
    resolution: resolution.trim(),
    blocksReservation: false,
  }
  await db
    .update(mappingExceptions)
    .set({
      status: 'resolved',
      resolvedAt: new Date(),
      resolvedBy: resolvedBy || null,
      meta,
      updatedAt: new Date(),
    })
    .where(eq(mappingExceptions.id, id))
  const updated = await getException(db, organizationId, id)
  if (!updated) throw new Error('修复失败')
  return updated
}

export async function ignoreException(
  db: AppDatabase,
  organizationId: string,
  id: string,
  note: string,
  resolvedBy?: string,
): Promise<MappingExceptionDto> {
  const [row] = await db
    .select()
    .from(mappingExceptions)
    .where(and(eq(mappingExceptions.organizationId, organizationId), eq(mappingExceptions.id, id)))
    .limit(1)
  if (!row) throw new Error(`异常不存在：${id}`)
  const meta = {
    ...readMeta(row.meta),
    resolution: note.trim() || '运营忽略',
    blocksReservation: false,
  }
  await db
    .update(mappingExceptions)
    .set({
      status: 'ignored',
      resolvedAt: new Date(),
      resolvedBy: resolvedBy || null,
      meta,
      updatedAt: new Date(),
    })
    .where(eq(mappingExceptions.id, id))
  const updated = await getException(db, organizationId, id)
  if (!updated) throw new Error('忽略失败')
  return updated
}

export async function listShopsForSelect(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select()
    .from(shops)
    .where(and(eq(shops.organizationId, organizationId), isNull(shops.deletedAt)))
    .orderBy(desc(shops.updatedAt))
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    platform: platformLabel(row.platform),
    site: row.marketplaceCountry || row.region || '',
    status: row.status,
    currency: row.currency,
  }))
}

/** 供 related-info / 主档详情注入 */
export function toRelatedMappingShape(row: MappingListItem): Record<string, unknown> {
  return {
    id: row.id,
    shop: row.shop,
    platform: row.platform,
    site: row.site,
    itemId: row.itemId,
    platformSkuId: row.platformSkuId,
    sellerSku: row.sellerSku,
    internalSku: row.internalSku,
    color: row.color,
    size: row.size,
    listingStatus: row.listingStatus,
    mappingStatus: row.mappingStatus,
    href: row.href,
  }
}
