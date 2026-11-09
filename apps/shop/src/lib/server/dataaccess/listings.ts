/**
 * 刊登 listings + 关联 seller_sku_mappings dataaccess（模块11）。
 * 刊登拉取经 apps/api OpenAPI；平台新建/更新/下架写入本轮不做。
 */
import { and, count, desc, eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  listings,
  productVariants,
  products,
  sellerSkuMappings,
  shops,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  formatDateOnly,
  formatStamp,
  platformLabel,
  publishStateForListingStatus,
  toDbListingStatus,
  toDbPublishState,
  toUiListingStatus,
  toUiPublishState,
  type UiListingPublishState,
  type UiListingStatus,
} from '@/lib/server/mappers/listings'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'
import * as mappingsDa from '@/lib/server/dataaccess/mappings'
import * as syncDa from '@/lib/server/dataaccess/sync'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type ListingMappingLine = {
  id: string
  shop: string
  platform: string
  site: string
  itemId: string
  sellerSku: string
  internalSku: string
  color: string
  size: string
  listingStatus: string
  mappingStatus: string
  href: string
}

export type ListingDto = {
  id: string
  spu: string
  sku: string
  productId: string
  primaryVariantId: string
  shopId: string
  shopName: string
  platform: string
  site: string
  sellerSku: string
  title: string
  sellPrice: number
  currency: string
  status: UiListingStatus
  publishState: UiListingPublishState
  stockOnHand: number
  warehouseCode: string
  logisticsChannel: string
  brandName: string
  brandExternalId: string
  categoryPath: string
  categoryExternalId: string
  externalItemId: string
  platformSku: string
  lastError: string
  submittedAt: string
  liveAt: string
  updatedAt: string
  note: string
  /** 封面图存储 URI / URL（payload.cover） */
  coverImage: string | null
  /** 商品截图存储 URI / URL 列表（payload.images） */
  images: string[]
  mappingLineCount: number
  mappingLines: ListingMappingLine[]
}

export type ListingListRow = Omit<ListingDto, 'mappingLines' | 'note' | 'brandExternalId' | 'categoryExternalId' | 'platformSku' | 'submittedAt' | 'liveAt'> & {
  shop: string
  priceAmount: number
  priceCurrency: string
}

function readPayload(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {}
}

function num(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value
  if (value == null || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

async function loadShop(
  db: DbLike,
  organizationId: string,
  shopId: string,
): Promise<typeof shops.$inferSelect | undefined> {
  const [row] = await db
    .select()
    .from(shops)
    .where(and(eq(shops.organizationId, organizationId), eq(shops.id, shopId)))
    .limit(1)
  return row
}

async function resolveVariantBySku(
  db: DbLike,
  organizationId: string,
  sku: string,
): Promise<{ variant: typeof productVariants.$inferSelect; product: typeof products.$inferSelect }> {
  const [variant] = await db
    .select()
    .from(productVariants)
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        or(eq(productVariants.skuCode, sku), eq(productVariants.sku, sku)),
      ),
    )
    .limit(1)
  if (!variant) throw new Error(`未找到内部 SKU ${sku}`)
  const [product] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.organizationId, organizationId),
        eq(products.id, variant.productId),
        isNull(products.deletedAt),
      ),
    )
    .limit(1)
  if (!product) throw new Error(`SKU ${sku} 缺少所属 SPU`)
  return { variant, product }
}

async function loadMappingLines(
  db: DbLike,
  organizationId: string,
  listingId: string,
): Promise<ListingMappingLine[]> {
  const result = await mappingsDa.listMappings(db as AppDatabase, organizationId, {
    listingId,
    page: 1,
    pageSize: 100,
  })
  return result.items.map((item) => ({
    id: item.id,
    shop: item.shop,
    platform: item.platform,
    site: item.site,
    itemId: item.itemId,
    sellerSku: item.sellerSku,
    internalSku: item.internalSku,
    color: item.color,
    size: item.size,
    listingStatus: item.listingStatus,
    mappingStatus: item.mappingStatus,
    href: item.href,
  }))
}

function toListRow(detail: ListingDto): ListingListRow {
  return {
    id: detail.id,
    title: detail.title,
    sku: detail.sku,
    spu: detail.spu,
    productId: detail.productId,
    primaryVariantId: detail.primaryVariantId,
    shop: detail.shopName,
    shopId: detail.shopId,
    shopName: detail.shopName,
    platform: detail.platform,
    site: detail.site,
    sellerSku: detail.sellerSku,
    status: detail.status,
    publishState: detail.publishState,
    brandName: detail.brandName || '—',
    categoryPath: detail.categoryPath || '—',
    externalItemId: detail.externalItemId || '—',
    stockOnHand: detail.stockOnHand,
    warehouseCode: detail.warehouseCode || '—',
    logisticsChannel: detail.logisticsChannel || '—',
    priceAmount: detail.sellPrice,
    priceCurrency: detail.currency,
    sellPrice: detail.sellPrice,
    currency: detail.currency,
    updatedAt: detail.updatedAt,
    lastError: detail.lastError,
    coverImage: detail.coverImage,
    images: detail.images,
    mappingLineCount: detail.mappingLineCount,
  }
}

async function hydrateListing(
  db: DbLike,
  organizationId: string,
  row: typeof listings.$inferSelect,
  opts?: { withLines?: boolean },
): Promise<ListingDto> {
  const shop = await loadShop(db, organizationId, row.shopId)
  const payload = readPayload(row.payload)
  let sku = String(payload.primarySku ?? '')
  let spu = String(payload.spuCode ?? '')
  let sellerSku = String(payload.sellerSku ?? '')

  if (row.primaryVariantId || row.variantId) {
    const variantId = row.primaryVariantId || row.variantId!
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(
        and(
          eq(productVariants.organizationId, organizationId),
          eq(productVariants.id, variantId),
        ),
      )
      .limit(1)
    if (variant) {
      sku = variant.skuCode ?? variant.sku
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, variant.productId))
        .limit(1)
      spu = product?.spuCode ?? spu
    }
  }
  if (!spu && row.productId) {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, row.productId))
      .limit(1)
    spu = product?.spuCode ?? ''
  }

  const lines =
    opts?.withLines === false
      ? []
      : await loadMappingLines(db, organizationId, row.id)
  if (!sellerSku && lines[0]) sellerSku = lines[0].sellerSku
  if (!sku && lines[0]) sku = lines[0].internalSku

  const status = toUiListingStatus(row.status)
  const publishState = row.publishState
    ? toUiPublishState(row.publishState)
    : publishStateForListingStatus(status)

  return {
    id: row.id,
    spu,
    sku,
    productId: row.productId,
    primaryVariantId: row.primaryVariantId ?? row.variantId ?? '',
    shopId: row.shopId,
    shopName: shop?.name ?? String(payload.shopName ?? '—'),
    platform: platformLabel(shop?.platform ?? String(payload.platform ?? '')),
    site: shop?.marketplaceCountry || shop?.region || String(payload.site ?? '—'),
    sellerSku,
    title: row.listingTitle || row.title || '',
    sellPrice: num(row.priceAmount),
    currency: row.priceCurrency || shop?.currency || 'USD',
    status,
    publishState,
    stockOnHand: row.stockOnHand ?? 0,
    warehouseCode: row.warehouseCode ?? '',
    logisticsChannel: row.logisticsChannel ?? '',
    brandName: row.brandName ?? '',
    brandExternalId: row.brandExternalId ?? '',
    categoryPath: row.categoryPath ?? '',
    categoryExternalId: row.categoryExternalId ?? '',
    externalItemId: row.externalItemId ?? '',
    platformSku: String(payload.platformSku ?? sellerSku),
    lastError: row.lastError ?? '',
    submittedAt: formatDateOnly(row.submittedAt) || formatStamp(row.submittedAt),
    liveAt: formatDateOnly(row.liveAt) || formatStamp(row.liveAt),
    updatedAt: formatDateOnly(row.updatedAt) || formatStamp(row.updatedAt),
    note: String(payload.note ?? ''),
    coverImage: typeof payload.cover === 'string' && payload.cover ? payload.cover : null,
    images: Array.isArray(payload.images)
      ? payload.images.filter((item): item is string => typeof item === 'string' && !!item)
      : [],
    mappingLineCount: lines.length,
    mappingLines: lines,
  }
}

export async function listListings(
  db: AppDatabase,
  organizationId: string,
  input: {
    page?: number
    pageSize?: number
    q?: string
    status?: string
    publishState?: string
    shopId?: string
    platform?: string
    sku?: string
    spu?: string
  } = {},
): Promise<PaginatedResult<ListingListRow>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const offset = (page - 1) * pageSize
  const filters: SQL[] = [eq(listings.organizationId, organizationId)]
  if (input.shopId) filters.push(eq(listings.shopId, input.shopId))
  if (input.status) filters.push(eq(listings.status, toDbListingStatus(input.status)))
  if (input.publishState) {
    filters.push(eq(listings.publishState, toDbPublishState(input.publishState)))
  }
  const term = input.q?.trim()
  if (term) {
    const pattern = `%${term}%`
    filters.push(
      or(
        ilike(listings.title, pattern),
        ilike(listings.listingTitle, pattern),
        ilike(listings.externalItemId, pattern),
        ilike(listings.brandName, pattern),
        ilike(listings.categoryPath, pattern),
      )!,
    )
  }
  if (input.platform) {
    const shopRows = await db
      .select({ id: shops.id })
      .from(shops)
      .where(
        and(
          eq(shops.organizationId, organizationId),
          ilike(shops.platform, input.platform.toLowerCase()),
        ),
      )
    const ids = shopRows.map((s) => s.id)
    if (ids.length === 0) return { items: [], total: 0, page, pageSize }
    filters.push(inArray(listings.shopId, ids))
  }
  if (input.sku?.trim()) {
    const { variant } = await resolveVariantBySku(db, organizationId, input.sku.trim())
    filters.push(
      or(eq(listings.primaryVariantId, variant.id), eq(listings.variantId, variant.id))!,
    )
  }
  if (input.spu?.trim()) {
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.organizationId, organizationId),
          eq(products.spuCode, input.spu.trim()),
          isNull(products.deletedAt),
        ),
      )
      .limit(1)
    if (!product) return { items: [], total: 0, page, pageSize }
    filters.push(eq(listings.productId, product.id))
  }

  const where = and(...filters)
  const [totalRow] = await db.select({ total: count() }).from(listings).where(where)
  const rows = await db
    .select()
    .from(listings)
    .where(where)
    .orderBy(desc(listings.updatedAt))
    .limit(pageSize)
    .offset(offset)

  const items: ListingListRow[] = []
  for (const row of rows) {
    const detail = await hydrateListing(db, organizationId, row, { withLines: true })
    items.push(toListRow(detail))
  }
  return { items, total: Number(totalRow?.total ?? 0), page, pageSize }
}

export async function listingStats(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select({ status: listings.status, total: count() })
    .from(listings)
    .where(eq(listings.organizationId, organizationId))
    .groupBy(listings.status)
  let total = 0
  let live = 0
  let draftish = 0
  let failed = 0
  for (const row of rows) {
    const n = Number(row.total)
    total += n
    const ui = toUiListingStatus(row.status)
    if (ui === '在售') live += n
    else if (ui === '草稿' || ui === '待审') draftish += n
    else if (ui === '失败') failed += n
  }
  return { total, live, draftish, failed }
}

export async function getListing(
  db: AppDatabase,
  organizationId: string,
  id: string,
): Promise<ListingDto | null> {
  const [row] = await db
    .select()
    .from(listings)
    .where(and(eq(listings.organizationId, organizationId), eq(listings.id, id)))
    .limit(1)
  if (!row) return null
  return hydrateListing(db, organizationId, row, { withLines: true })
}

export type CreateListingInput = {
  shopId?: string
  shopName?: string
  sku: string
  sellerSku: string
  title: string
  sellPrice: number
  currency?: string
  status?: string
  warehouseCode?: string
  logisticsChannel?: string
  brandName?: string
  categoryPath?: string
  note?: string
  color?: string
  size?: string
}

export async function createListing(
  db: AppDatabase,
  organizationId: string,
  input: CreateListingInput,
): Promise<ListingDto> {
  if (!input.sku.trim()) throw new Error('请选择内部 SKU')
  if (!input.sellerSku.trim()) throw new Error('请填写 Seller SKU')
  if (!input.title.trim()) throw new Error('请填写刊登标题')
  if (!Number.isFinite(input.sellPrice) || input.sellPrice <= 0) {
    throw new Error('售价必须大于 0')
  }

  let shop: typeof shops.$inferSelect | undefined
  if (input.shopId) {
    shop = await loadShop(db, organizationId, input.shopId)
  }
  if (!shop && input.shopName) {
    const [byName] = await db
      .select()
      .from(shops)
      .where(
        and(
          eq(shops.organizationId, organizationId),
          eq(shops.name, input.shopName),
          isNull(shops.deletedAt),
        ),
      )
      .limit(1)
    shop = byName
  }
  if (!shop) throw new Error('请选择有效店铺')

  const { variant, product } = await resolveVariantBySku(db, organizationId, input.sku.trim())
  const sellerSku = input.sellerSku.trim()

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

  const statusUi = (input.status as UiListingStatus) || '草稿'
  const status = toDbListingStatus(statusUi)
  const publishState = toDbPublishState(publishStateForListingStatus(statusUi))
  const id = createId()
  const now = new Date()

  await db.transaction(async (tx) => {
    await tx.insert(listings).values({
      id,
      organizationId,
      shopId: shop!.id,
      productId: product.id,
      variantId: variant.id,
      primaryVariantId: variant.id,
      status,
      title: input.title.trim(),
      listingTitle: input.title.trim(),
      brandName: input.brandName?.trim() || product.brand || null,
      categoryPath: input.categoryPath?.trim() || product.categoryHint || null,
      priceAmount: String(input.sellPrice),
      priceCurrency: input.currency?.trim() || shop!.currency || 'USD',
      stockOnHand: 0,
      warehouseCode: input.warehouseCode?.trim() || 'WH-CN-XMN-001',
      logisticsChannel: input.logisticsChannel?.trim() || null,
      publishState,
      payload: {
        note: input.note?.trim() || '',
        sellerSku,
        primarySku: variant.skuCode ?? variant.sku,
        spuCode: product.spuCode,
        shopName: shop!.name,
        platform: shop!.platform,
        site: shop!.marketplaceCountry || shop!.region,
      },
      submittedAt: status === 'draft' ? null : now,
      liveAt: status === 'live' ? now : null,
    })

    await tx.insert(sellerSkuMappings).values({
      id: createId(),
      organizationId,
      shopId: shop!.id,
      listingId: id,
      itemId: null,
      platformSkuId: null,
      sellerSku,
      variantId: variant.id,
      status: 'pending',
      source: 'listing',
      meta: {
        color: input.color?.trim() || '',
        size: input.size?.trim() || '',
        listingStatus: statusUi === '在售' ? '在线' : '草稿',
        site: shop!.marketplaceCountry || shop!.region || '',
        platform: shop!.platform,
        internalSku: variant.skuCode ?? variant.sku,
      },
    })
  })

  const created = await getListing(db, organizationId, id)
  if (!created) throw new Error('创建刊登失败')
  return created
}

export type UpdateListingInput = {
  title?: string
  sellPrice?: number
  currency?: string
  status?: string
  publishState?: string
  warehouseCode?: string
  logisticsChannel?: string
  brandName?: string
  categoryPath?: string
  note?: string
  stockOnHand?: number
  externalItemId?: string
  lastError?: string
  coverImage?: string | null
  images?: string[]
}

export async function updateListing(
  db: AppDatabase,
  organizationId: string,
  id: string,
  patch: UpdateListingInput,
): Promise<ListingDto> {
  const [row] = await db
    .select()
    .from(listings)
    .where(and(eq(listings.organizationId, organizationId), eq(listings.id, id)))
    .limit(1)
  if (!row) throw new Error(`刊登不存在：${id}`)
  if (patch.sellPrice != null && (!Number.isFinite(patch.sellPrice) || patch.sellPrice <= 0)) {
    throw new Error('售价必须大于 0')
  }
  if (patch.title != null && !patch.title.trim()) throw new Error('标题不能为空')

  const statusUi = patch.status != null ? toUiListingStatus(toDbListingStatus(patch.status)) : toUiListingStatus(row.status)
  const status = patch.status != null ? toDbListingStatus(patch.status) : row.status
  const publishState =
    patch.publishState != null
      ? toDbPublishState(patch.publishState)
      : patch.status != null
        ? toDbPublishState(publishStateForListingStatus(statusUi))
        : row.publishState

  const payload = {
    ...readPayload(row.payload),
    ...(patch.note != null ? { note: patch.note } : {}),
    ...(patch.coverImage !== undefined
      ? { cover: patch.coverImage ?? '' }
      : {}),
    ...(patch.images !== undefined
      ? { images: patch.images.filter((item) => typeof item === 'string' && !!item) }
      : {}),
  }
  const now = new Date()

  await db
    .update(listings)
    .set({
      title: patch.title?.trim() ?? row.title,
      listingTitle: patch.title?.trim() ?? row.listingTitle,
      priceAmount: patch.sellPrice != null ? String(patch.sellPrice) : row.priceAmount,
      priceCurrency: patch.currency?.trim() ?? row.priceCurrency,
      status,
      publishState,
      warehouseCode: patch.warehouseCode ?? row.warehouseCode,
      logisticsChannel: patch.logisticsChannel ?? row.logisticsChannel,
      brandName: patch.brandName ?? row.brandName,
      categoryPath: patch.categoryPath ?? row.categoryPath,
      stockOnHand: patch.stockOnHand ?? row.stockOnHand,
      externalItemId: patch.externalItemId ?? row.externalItemId,
      lastError: patch.lastError ?? row.lastError,
      payload,
      submittedAt:
        status !== 'draft' && !row.submittedAt ? now : row.submittedAt,
      liveAt: status === 'live' ? row.liveAt || now : row.liveAt,
      updatedAt: now,
    })
    .where(eq(listings.id, id))

  const updated = await getListing(db, organizationId, id)
  if (!updated) throw new Error('更新刊登失败')
  return updated
}

/** 上下架：在售 ↔ 下架（本地状态；不调用平台） */
export async function setListingShelfStatus(
  db: AppDatabase,
  organizationId: string,
  id: string,
  onShelf: boolean,
): Promise<ListingDto> {
  return updateListing(db, organizationId, id, {
    status: onShelf ? '在售' : '下架',
  })
}

export async function addListingMappingLine(
  db: AppDatabase,
  organizationId: string,
  listingId: string,
  input: {
    sellerSku: string
    internalSku: string
    color?: string
    size?: string
    itemId?: string
    platformSkuId?: string
  },
): Promise<ListingDto> {
  const listing = await getListing(db, organizationId, listingId)
  if (!listing) throw new Error('刊登不存在')
  await mappingsDa.createMapping(db, organizationId, {
    shopId: listing.shopId,
    sellerSku: input.sellerSku,
    internalSku: input.internalSku,
    color: input.color,
    size: input.size,
    itemId: input.itemId || listing.externalItemId,
    platformSkuId: input.platformSkuId,
    listingId,
    listingStatus: listing.status === '在售' ? '在线' : '草稿',
    mappingStatus: '待确认',
    source: 'listing',
  })
  const updated = await getListing(db, organizationId, listingId)
  if (!updated) throw new Error('添加映射行失败')
  return updated
}

/**
 * 拉取平台刊登（读同步）。不做新建/更新/下架平台写入。
 */
export async function requestPlatformSyncStub(
  db: AppDatabase,
  organizationId: string,
  id: string,
): Promise<{ ok: boolean; stub: false; message: string; listing: ListingDto; syncTaskId?: string }> {
  const current = await getListing(db, organizationId, id)
  if (!current) throw new Error(`刊登不存在：${id}`)

  const task = await syncDa.enqueueOrRetrySyncTask(db, organizationId, {
    type: '刊登同步',
    target: `listing:${current.externalItemId || id}`,
    shopId: current.shopId || undefined,
    actor: 'console',
    note: '刊登拉取：apps/api → Lazop /products/get（不推送平台写）',
  })

  const listing = await getListing(db, organizationId, id)
  if (!listing) throw new Error('同步后读取失败')
  const ok = task.status === '成功'
  if (!ok) {
    await updateListing(db, organizationId, id, {
      publishState: '同步失败',
      lastError: task.error !== '—' ? task.error : '刊登拉取失败',
    })
  }
  return {
    ok,
    stub: false,
    message: ok
      ? `已拉取平台刊登（task=${task.taskNo}）。本轮不推送新建/上下架。`
      : task.error !== '—'
        ? task.error
        : '刊登拉取失败：请检查店铺凭证与 API 配置',
    listing: (await getListing(db, organizationId, id))!,
    syncTaskId: task.id,
  }
}

export function toRelatedListingShape(listing: ListingDto): Record<string, unknown> {
  return {
    id: listing.id,
    sku: listing.sku,
    spu: listing.spu,
    shop: listing.shopName,
    platform: listing.platform,
    site: listing.site,
    sellerSku: listing.sellerSku,
    title: listing.title,
    sellPrice: listing.sellPrice,
    currency: listing.currency,
    status: listing.status,
    publishState: listing.publishState,
    stockOnHand: listing.stockOnHand,
    externalItemId: listing.externalItemId || '—',
    href: `/console/listings/${encodeURIComponent(listing.id)}`,
  }
}
