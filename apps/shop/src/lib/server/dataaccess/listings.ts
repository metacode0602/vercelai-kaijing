/**
 * 刊登 listings + 关联 seller_sku_mappings dataaccess（模块11）。
 * 读同步经 apps/api OpenAPI（resource=listings）；
 * 平台写（publish / update / deactivate）经同步任务 resource=listing_write。
 */
import { and, count, desc, eq, ilike, inArray, isNull, like, or, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  listings,
  pendingActions,
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
import { assertHsCompliance } from '@/lib/server/dataaccess/compliance'

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
): Promise<{ variant: typeof productVariants.$inferSelect; product: typeof products.$inferSelect } | null> {
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
  if (!variant) return null
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
  if (!product) return null
  return { variant, product }
}

async function countMappings(
  db: DbLike,
  organizationId: string,
  listingId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(sellerSkuMappings)
    .where(
      and(
        eq(sellerSkuMappings.organizationId, organizationId),
        eq(sellerSkuMappings.listingId, listingId),
      ),
    )
  return Number(row?.value ?? 0)
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
  const mappingLineCount = await countMappings(db, organizationId, row.id)
  if (!sellerSku && lines[0]) sellerSku = lines[0].sellerSku
  if (!sku && lines[0]) sku = lines[0].internalSku
  if ((!sellerSku || !sku) && mappingLineCount > 0) {
    // 列表态不加载全部映射行，但缺 sellerSku/sku 时回退首条映射行（DB 级 limit 1）。
    const [firstMap] = await db
      .select({
        sellerSku: sellerSkuMappings.sellerSku,
        variantId: sellerSkuMappings.variantId,
        meta: sellerSkuMappings.meta,
      })
      .from(sellerSkuMappings)
      .where(
        and(
          eq(sellerSkuMappings.organizationId, organizationId),
          eq(sellerSkuMappings.listingId, row.id),
        ),
      )
      .orderBy(sellerSkuMappings.createdAt)
      .limit(1)
    if (firstMap) {
      if (!sellerSku) sellerSku = firstMap.sellerSku
      if (!sku) {
        const metaSku = String(readPayload(firstMap.meta).internalSku ?? '')
        if (metaSku) sku = metaSku
        else if (firstMap.variantId) {
          const [mapVariant] = await db
            .select({ skuCode: productVariants.skuCode, sku: productVariants.sku })
            .from(productVariants)
            .where(
              and(
                eq(productVariants.organizationId, organizationId),
                eq(productVariants.id, firstMap.variantId),
              ),
            )
            .limit(1)
          sku = mapVariant?.skuCode ?? mapVariant?.sku ?? sku
        }
      }
    }
  }

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
    mappingLineCount,
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
    const resolved = await resolveVariantBySku(db, organizationId, input.sku.trim())
    if (!resolved) return { items: [], total: 0, page, pageSize }
    filters.push(
      or(eq(listings.primaryVariantId, resolved.variant.id), eq(listings.variantId, resolved.variant.id))!,
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
    const detail = await hydrateListing(db, organizationId, row, { withLines: false })
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
  /** 平台类目 ID（PrimaryCategory）；发布到平台前必填。 */
  categoryExternalId?: string
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

  const resolved = await resolveVariantBySku(db, organizationId, input.sku.trim())
  if (!resolved) throw new Error(`未找到内部 SKU ${input.sku.trim()} 或缺少所属 SPU`)
  const { variant, product } = resolved
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
      categoryExternalId: input.categoryExternalId?.trim() || null,
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
  /** 平台类目 ID（PrimaryCategory）。 */
  categoryExternalId?: string
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
      categoryExternalId: patch.categoryExternalId ?? row.categoryExternalId,
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

/**
 * 上下架。
 * - 上架：仅本地状态（平台无 activate 端点，禁止臆造）；需通过 HS 合规校验。
 * - 下架：本地状态 + 若已有平台 item_id 则入队 listing_write#deactivate 同步任务，
 *   经 apps/api → connector.deactivateListing 推平台（结果回写 publishState / 任务状态）。
 */
export async function setListingShelfStatus(
  db: AppDatabase,
  organizationId: string,
  id: string,
  onShelf: boolean,
  actor?: string,
): Promise<{ listing: ListingDto; task?: syncDa.SyncTaskDto; message: string }> {
  if (onShelf) {
    const current = await getListing(db, organizationId, id)
    if (!current) throw new Error('刊登不存在')
    const [product] = await db
      .select({ id: products.id, hsCode: products.hsCode })
      .from(products)
      .where(and(eq(products.id, current.productId), eq(products.organizationId, organizationId)))
      .limit(1)
    let hsCode = product?.hsCode ?? null
    let variantId: string | null = current.primaryVariantId || null
    if (current.primaryVariantId) {
      const [variant] = await db
        .select({ id: productVariants.id, hsCode: productVariants.hsCode })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.id, current.primaryVariantId),
            eq(productVariants.organizationId, organizationId),
          ),
        )
        .limit(1)
      if (variant?.hsCode) hsCode = variant.hsCode
      variantId = variant?.id ?? variantId
    }
    await assertHsCompliance(db, organizationId, {
      hsCode,
      productId: product?.id ?? current.productId,
      variantId,
    })
  }

  const updated = await updateListing(db, organizationId, id, {
    status: onShelf ? '在售' : '下架',
  })

  if (onShelf) {
    return {
      listing: updated,
      message:
        '本地状态已改为「在售」。平台无商品上架（activate）端点，不会调用平台；发布请走「发布到平台」。',
    }
  }

  if (!updated.externalItemId) {
    return { listing: updated, message: '本地状态已改为「下架」（尚未发布到平台，无平台动作）。' }
  }

  const task = await syncDa.enqueueOrRetrySyncTask(db, organizationId, {
    type: '状态同步',
    target: `listing:${id}#deactivate`,
    shopId: updated.shopId,
    actor,
    note: '本地下架 → 平台 /product/deactivate（Daraz/Lazada）',
  })
  const fresh = (await getListing(db, organizationId, id)) ?? updated
  const ok = task.status === '成功'
  return {
    listing: fresh,
    task,
    message: ok
      ? `本地与平台均已下架（task=${task.taskNo}）。`
      : `本地已下架，平台下架任务失败：${task.error !== '—' ? task.error : task.status}（task=${task.taskNo}）`,
  }
}

export type PublishListingResult = {
  listing: ListingDto
  task: syncDa.SyncTaskDto
  message: string
}

/**
 * 发布到平台：入队「发布刊登」同步任务 → apps/api resource=listing_write →
 * connector.createListing（无 item_id）/ updateListing（已有 item_id），回执回写 listings。
 * 不以 HTTP 200 为准，成功必须拿到平台 item_id（create）或明确状态（update/deactivate）。
 */
export async function publishListing(
  db: AppDatabase,
  organizationId: string,
  id: string,
  actor?: string,
): Promise<PublishListingResult> {
  const current = await getListing(db, organizationId, id)
  if (!current) throw new Error(`刊登不存在：${id}`)
  if (!current.externalItemId) {
    if (!current.categoryExternalId?.trim()) {
      throw new Error('缺少平台类目 ID（PrimaryCategory），请先在「编辑刊登」补全')
    }
    if (current.mappingLineCount < 1) {
      throw new Error('缺少 Seller SKU 映射行，无法组装平台 SKU')
    }
    if (!(current.sellPrice > 0)) throw new Error('售价必须大于 0')
  }

  const task = await syncDa.enqueueOrRetrySyncTask(db, organizationId, {
    type: '发布刊登',
    target: `listing:${id}`,
    shopId: current.shopId,
    actor,
    note: current.externalItemId
      ? '更新平台刊登（connector.updateListing）'
      : '新建平台刊登（connector.createListing）',
  })
  const listing = await getListing(db, organizationId, id)
  if (!listing) throw new Error('发布后读取刊登失败')
  const ok = task.status === '成功'
  return {
    listing,
    task,
    message: ok
      ? `平台发布成功（task=${task.taskNo}，item_id=${listing.externalItemId || '—'}）。`
      : `平台发布失败：${task.error !== '—' ? task.error : task.status}（task=${task.taskNo}）`,
  }
}

export type SubmitForReviewResult = {
  listing: ListingDto
  pendingId: string
  message: string
}

/**
 * 提交审核：草稿/失败 → 待审，并生成 listing_submit 待审单（mode=link）。
 * 确认（pending.confirm）后刊登保持待审/待同步，由「发布到平台」执行平台写入。
 */
export async function submitForReview(
  db: AppDatabase,
  organizationId: string,
  id: string,
  actor?: string,
): Promise<SubmitForReviewResult> {
  const current = await getListing(db, organizationId, id)
  if (!current) throw new Error(`刊登不存在：${id}`)
  if (current.status !== '草稿' && current.status !== '失败') {
    throw new Error(`当前状态不可提交审核：${current.status}`)
  }
  const [dup] = await db
    .select({ id: pendingActions.id })
    .from(pendingActions)
    .where(
      and(
        eq(pendingActions.organizationId, organizationId),
        eq(pendingActions.kind, 'listing_submit'),
        eq(pendingActions.status, 'pending'),
        like(pendingActions.idempotencyKey, `listing_submit:listing:${id}:%`),
      ),
    )
    .limit(1)
  if (dup) throw new Error('该刊登已有待审单，请先在待审队列处理')

  const now = new Date()
  const pendingId = createId()
  await db.transaction(async (tx) => {
    await tx.insert(pendingActions).values({
      id: pendingId,
      organizationId,
      shopId: current.shopId,
      kind: 'listing_submit',
      status: 'pending',
      title: `刊登提交：${current.title}`,
      payload: { mode: 'link', listingId: current.id, source: 'listing' },
      idempotencyKey: `listing_submit:listing:${current.id}:${now.getTime()}`,
      createdBy: actor?.trim() || 'console',
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      updatedAt: now,
    })
    await tx
      .update(listings)
      .set({
        status: toDbListingStatus('待审'),
        publishState: toDbPublishState('待同步'),
        updatedAt: now,
      })
      .where(and(eq(listings.id, current.id), eq(listings.organizationId, organizationId)))
  })

  const listing = await getListing(db, organizationId, id)
  if (!listing) throw new Error('提交审核后读取刊登失败')
  return {
    listing,
    pendingId,
    message: `已提交审核，待审单已生成（${pendingId}）。确认后可「发布到平台」。`,
  }
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
 * 拉取平台刊登（读同步，apps/api resource=listings）。
 * 平台写入走 publishListing / setListingShelfStatus（resource=listing_write）。
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
  } else {
    await updateListing(db, organizationId, id, { lastError: '' })
  }
  return {
    ok,
    stub: false,
    message: ok
      ? `已拉取平台刊登并回写本地状态（task=${task.taskNo}）。`
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
