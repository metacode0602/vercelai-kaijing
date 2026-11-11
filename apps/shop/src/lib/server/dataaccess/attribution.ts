/**
 * 差评 / 退货归因：只聚合已入库的 product_reviews 与 reverse_order_items。
 * 差评 = 评分 1–2。分类顺序：人工改判 → 原因码映射 → 关键词 → 其他。
 */
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  attributionCategories,
  attributionOverrides,
  attributionReasonMaps,
  orderLines,
  productReviews,
  productVariants,
  products,
  reverseOrderItems,
  reverseOrders,
  shops,
  type AttributionCategory,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export const ATTRIBUTION_CATEGORY_LABELS: Record<AttributionCategory, string> = {
  quality: '质量',
  size: '尺码规格',
  logistics: '物流',
  description: '描述不符',
  other: '其他',
}

const BUILTIN_KEYWORDS: Array<{ category: AttributionCategory; keywords: string[] }> = [
  {
    category: 'quality',
    keywords: ['质量', '劣质', '破损', '损坏', '坏了', '故障', '瑕疵', 'defect', 'broken', 'damaged', 'poor quality', 'low quality'],
  },
  {
    category: 'size',
    keywords: ['尺码', '尺寸', '不合身', '偏小', '偏大', '太小', '太大', 'size', 'too small', 'too big', 'sizing'],
  },
  {
    category: 'logistics',
    keywords: ['物流', '快递', '配送', '延迟', '迟迟', '外箱', '包装破损', 'shipping', 'delivery', 'courier', 'late', 'delay'],
  },
  {
    category: 'description',
    keywords: ['描述不符', '与描述', '和图片', '货不对板', '名不副实', '假货', 'not as described', 'not as pictured', 'different from', 'fake'],
  },
]

export type ClassificationSource = 'override' | 'reason_code' | 'keyword' | 'default'

export type ReasonMapDto = {
  id: string
  matchType: 'reason_code' | 'keyword'
  pattern: string
  category: AttributionCategory
  categoryLabel: string
  notes: string
  status: 'enabled' | 'disabled'
  updatedAt: string | null
}

function isCategory(value: string): value is AttributionCategory {
  return (attributionCategories as readonly string[]).includes(value)
}

function mapReasonMap(row: typeof attributionReasonMaps.$inferSelect): ReasonMapDto {
  const category = isCategory(row.category) ? row.category : 'other'
  return {
    id: row.id,
    matchType: row.matchType === 'reason_code' ? 'reason_code' : 'keyword',
    pattern: row.pattern,
    category,
    categoryLabel: ATTRIBUTION_CATEGORY_LABELS[category],
    notes: row.notes ?? '',
    status: row.status === 'disabled' ? 'disabled' : 'enabled',
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  }
}

export function classifyAttribution(input: {
  reasonCode?: string | null
  text?: string | null
  overrideCategory?: AttributionCategory | null
  maps: ReasonMapDto[]
}): { category: AttributionCategory; source: ClassificationSource } {
  if (input.overrideCategory && isCategory(input.overrideCategory)) {
    return { category: input.overrideCategory, source: 'override' }
  }
  const enabled = input.maps.filter((item) => item.status === 'enabled')
  const code = input.reasonCode?.trim()
  if (code) {
    const mapped = enabled.find(
      (item) => item.matchType === 'reason_code' && item.pattern.toLowerCase() === code.toLowerCase(),
    )
    if (mapped) return { category: mapped.category, source: 'reason_code' }
  }
  const haystack = `${input.reasonCode ?? ''} ${input.text ?? ''}`.toLowerCase()
  if (haystack.trim()) {
    const keywords = enabled
      .filter((item) => item.matchType === 'keyword' && item.pattern.trim())
      .sort((a, b) => b.pattern.length - a.pattern.length)
    for (const item of keywords) {
      if (haystack.includes(item.pattern.trim().toLowerCase())) {
        return { category: item.category, source: 'keyword' }
      }
    }
    for (const group of BUILTIN_KEYWORDS) {
      if (group.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
        return { category: group.category, source: 'keyword' }
      }
    }
  }
  return { category: 'other', source: 'default' }
}

export async function listReasonMaps(db: AppDatabase, organizationId: string): Promise<ReasonMapDto[]> {
  const rows = await db
    .select()
    .from(attributionReasonMaps)
    .where(eq(attributionReasonMaps.organizationId, organizationId))
    .orderBy(attributionReasonMaps.matchType, attributionReasonMaps.pattern)
  return rows.map(mapReasonMap)
}

export async function upsertReasonMap(
  db: AppDatabase,
  organizationId: string,
  input: {
    id?: string
    matchType: 'reason_code' | 'keyword'
    pattern: string
    category: AttributionCategory
    notes?: string
    status?: 'enabled' | 'disabled'
  },
): Promise<ReasonMapDto> {
  const matchType = input.matchType === 'reason_code' ? 'reason_code' : 'keyword'
  const pattern =
    matchType === 'keyword' ? input.pattern.trim().toLowerCase() : input.pattern.trim()
  if (!pattern) throw new Error(matchType === 'reason_code' ? '请填写平台原因码' : '请填写关键词')
  if (!isCategory(input.category)) throw new Error('归因类别无效')
  const status = input.status === 'disabled' ? 'disabled' : 'enabled'

  if (input.id) {
    const [existing] = await db
      .select()
      .from(attributionReasonMaps)
      .where(and(eq(attributionReasonMaps.id, input.id), eq(attributionReasonMaps.organizationId, organizationId)))
      .limit(1)
    if (!existing) throw new Error('映射不存在')
    await db
      .update(attributionReasonMaps)
      .set({
        matchType,
        pattern,
        category: input.category,
        notes: input.notes?.trim() || null,
        status,
        updatedAt: new Date(),
      })
      .where(eq(attributionReasonMaps.id, existing.id))
    const [row] = await db.select().from(attributionReasonMaps).where(eq(attributionReasonMaps.id, existing.id)).limit(1)
    if (!row) throw new Error('更新映射后读取失败')
    return mapReasonMap(row)
  }

  const [dup] = await db
    .select()
    .from(attributionReasonMaps)
    .where(
      and(
        eq(attributionReasonMaps.organizationId, organizationId),
        eq(attributionReasonMaps.matchType, matchType),
        eq(attributionReasonMaps.pattern, pattern),
      ),
    )
    .limit(1)
  if (dup) {
    await db
      .update(attributionReasonMaps)
      .set({
        category: input.category,
        notes: input.notes?.trim() || null,
        status,
        updatedAt: new Date(),
      })
      .where(eq(attributionReasonMaps.id, dup.id))
    const [row] = await db.select().from(attributionReasonMaps).where(eq(attributionReasonMaps.id, dup.id)).limit(1)
    if (!row) throw new Error('更新映射后读取失败')
    return mapReasonMap(row)
  }

  const id = createId()
  await db.insert(attributionReasonMaps).values({
    id,
    organizationId,
    matchType,
    pattern,
    category: input.category,
    notes: input.notes?.trim() || null,
    status,
  })
  const [row] = await db.select().from(attributionReasonMaps).where(eq(attributionReasonMaps.id, id)).limit(1)
  if (!row) throw new Error('保存映射后读取失败')
  return mapReasonMap(row)
}

export async function overrideAttribution(
  db: AppDatabase,
  organizationId: string,
  input: {
    subjectType: 'review' | 'reverse_item'
    subjectId: string
    category: AttributionCategory
    note?: string
    overriddenBy?: string | null
  },
): Promise<{ subjectType: 'review' | 'reverse_item'; subjectId: string; category: AttributionCategory }> {
  if (!isCategory(input.category)) throw new Error('归因类别无效')
  const subjectType = input.subjectType === 'review' ? 'review' : 'reverse_item'
  if (subjectType === 'review') {
    const [row] = await db
      .select({ id: productReviews.id })
      .from(productReviews)
      .where(and(eq(productReviews.id, input.subjectId), eq(productReviews.organizationId, organizationId)))
      .limit(1)
    if (!row) throw new Error('评论不存在')
  } else {
    const [row] = await db
      .select({ id: reverseOrderItems.id })
      .from(reverseOrderItems)
      .where(and(eq(reverseOrderItems.id, input.subjectId), eq(reverseOrderItems.organizationId, organizationId)))
      .limit(1)
    if (!row) throw new Error('退货行不存在')
  }

  const [existing] = await db
    .select()
    .from(attributionOverrides)
    .where(
      and(
        eq(attributionOverrides.organizationId, organizationId),
        eq(attributionOverrides.subjectType, subjectType),
        eq(attributionOverrides.subjectId, input.subjectId),
      ),
    )
    .limit(1)
  if (existing) {
    await db
      .update(attributionOverrides)
      .set({
        category: input.category,
        note: input.note?.trim() || null,
        overriddenBy: input.overriddenBy ?? existing.overriddenBy,
        updatedAt: new Date(),
      })
      .where(eq(attributionOverrides.id, existing.id))
  } else {
    await db.insert(attributionOverrides).values({
      id: createId(),
      organizationId,
      subjectType,
      subjectId: input.subjectId,
      category: input.category,
      note: input.note?.trim() || null,
      overriddenBy: input.overriddenBy ?? null,
    })
  }
  return { subjectType, subjectId: input.subjectId, category: input.category }
}

export type AttributionFilter = {
  shopId?: string
  from: Date
  to: Date
  sku?: string
}

export type AttributionSkuRow = {
  sku: string
  name: string
  badReviews: number
  returns: number
  reasons: Record<AttributionCategory, number>
}

export type AttributionSummary = {
  items: AttributionSkuRow[]
  total: number
  page: number
  pageSize: number
  kpis: {
    badReviews: number
    returns: number
    skuCount: number
  }
  note: string
}

export type AttributionDrillLine = {
  id: string
  kind: 'review' | 'return'
  sku: string
  shopName: string
  rating: number | null
  content: string
  reasonCode: string
  category: AttributionCategory
  categoryLabel: string
  source: ClassificationSource
  overridden: boolean
  status: string
  at: string | null
}

type ResolvedSku = { sku: string; name: string }

function emptyReasons(): Record<AttributionCategory, number> {
  return { quality: 0, size: 0, logistics: 0, description: 0, other: 0 }
}

function reviewTime(reviewAt: Date | null, createdAt: Date | null): Date | null {
  return reviewAt ?? createdAt
}

function resolveReviewSku(input: {
  variantSku: string | null
  variantSkuCode: string | null
  productTitle: string | null
  sellerSku: string | null
  externalItemId: string
}): ResolvedSku {
  const sku = input.variantSkuCode || input.variantSku || input.sellerSku || ''
  if (sku) return { sku, name: input.productTitle || sku }
  return { sku: `ITEM:${input.externalItemId}`, name: input.productTitle || '未映射商品' }
}

function resolveReturnSku(input: {
  variantSku: string | null
  variantSkuCode: string | null
  productTitle: string | null
  lineSku: string | null
  lineSellerSku: string | null
  lineShopSku: string | null
  lineTitle: string | null
  fallbackId: string
}): ResolvedSku {
  const sku =
    input.variantSkuCode || input.variantSku || input.lineSku || input.lineSellerSku || input.lineShopSku || ''
  if (sku) return { sku, name: input.productTitle || input.lineTitle || sku }
  return { sku: `RETURN:${input.fallbackId}`, name: input.productTitle || input.lineTitle || '未映射商品' }
}

async function loadOverrides(
  db: DbLike,
  organizationId: string,
): Promise<Map<string, AttributionCategory>> {
  const rows = await db
    .select()
    .from(attributionOverrides)
    .where(eq(attributionOverrides.organizationId, organizationId))
  const map = new Map<string, AttributionCategory>()
  for (const row of rows) {
    if (isCategory(row.category)) map.set(`${row.subjectType}:${row.subjectId}`, row.category)
  }
  return map
}

async function loadReviewRows(db: DbLike, organizationId: string, filter: AttributionFilter) {
  const conditions = [
    eq(productReviews.organizationId, organizationId),
    eq(productReviews.status, 'active'),
    sql`${productReviews.rating} <= 2`,
    sql`${productReviews.rating} >= 1`,
    gte(sql`coalesce(${productReviews.reviewAt}, ${productReviews.createdAt})`, filter.from),
    lte(sql`coalesce(${productReviews.reviewAt}, ${productReviews.createdAt})`, filter.to),
  ]
  if (filter.shopId) conditions.push(eq(productReviews.shopId, filter.shopId))
  return db
    .select({
      id: productReviews.id,
      rating: productReviews.rating,
      content: productReviews.content,
      title: productReviews.title,
      sellerSku: productReviews.sellerSku,
      externalItemId: productReviews.externalItemId,
      reviewAt: productReviews.reviewAt,
      createdAt: productReviews.createdAt,
      shopName: shops.name,
      variantSku: productVariants.sku,
      variantSkuCode: productVariants.skuCode,
      productTitle: products.title,
    })
    .from(productReviews)
    .leftJoin(shops, eq(shops.id, productReviews.shopId))
    .leftJoin(productVariants, eq(productVariants.id, productReviews.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(and(...conditions))
    .orderBy(desc(sql`coalesce(${productReviews.reviewAt}, ${productReviews.createdAt})`))
}

async function loadReturnRows(db: DbLike, organizationId: string, filter: AttributionFilter) {
  const eventTime = sql`coalesce(${reverseOrders.platformCreatedAt}, ${reverseOrderItems.createdAt})`
  const conditions = [
    eq(reverseOrderItems.organizationId, organizationId),
    gte(eventTime, filter.from),
    lte(eventTime, filter.to),
  ]
  if (filter.shopId) conditions.push(eq(reverseOrderItems.shopId, filter.shopId))
  return db
    .select({
      id: reverseOrderItems.id,
      reasonCode: reverseOrderItems.reasonCode,
      reasonText: reverseOrderItems.reasonText,
      reverseStatus: reverseOrderItems.reverseStatus,
      createdAt: reverseOrderItems.createdAt,
      platformCreatedAt: reverseOrders.platformCreatedAt,
      shopName: shops.name,
      variantSku: productVariants.sku,
      variantSkuCode: productVariants.skuCode,
      productTitle: products.title,
      lineSku: orderLines.sku,
      lineSellerSku: orderLines.sellerSku,
      lineShopSku: orderLines.shopSku,
      lineTitle: orderLines.title,
    })
    .from(reverseOrderItems)
    .innerJoin(reverseOrders, eq(reverseOrders.id, reverseOrderItems.reverseOrderId))
    .leftJoin(shops, eq(shops.id, reverseOrderItems.shopId))
    .leftJoin(orderLines, eq(orderLines.id, reverseOrderItems.orderLineId))
    .leftJoin(productVariants, eq(productVariants.id, orderLines.variantId))
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(and(...conditions))
    .orderBy(desc(eventTime))
}

function skuFilterMatch(resolved: ResolvedSku, sku?: string): boolean {
  if (!sku) return true
  const q = sku.trim().toLowerCase()
  if (!q) return true
  return resolved.sku.toLowerCase().includes(q) || resolved.name.toLowerCase().includes(q)
}

export async function listAttribution(
  db: AppDatabase,
  organizationId: string,
  input: AttributionFilter & { page?: number; pageSize?: number },
): Promise<AttributionSummary> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize)
  const [maps, overrides, reviews, returns] = await Promise.all([
    listReasonMaps(db, organizationId),
    loadOverrides(db, organizationId),
    loadReviewRows(db, organizationId, input),
    loadReturnRows(db, organizationId, input),
  ])

  const buckets = new Map<string, AttributionSkuRow>()
  const touch = (resolved: ResolvedSku) => {
    const existing = buckets.get(resolved.sku)
    if (existing) {
      if (!existing.name && resolved.name) existing.name = resolved.name
      return existing
    }
    const created: AttributionSkuRow = {
      sku: resolved.sku,
      name: resolved.name,
      badReviews: 0,
      returns: 0,
      reasons: emptyReasons(),
    }
    buckets.set(resolved.sku, created)
    return created
  }

  for (const review of reviews) {
    const resolved = resolveReviewSku(review)
    if (!skuFilterMatch(resolved, input.sku)) continue
    const classified = classifyAttribution({
      text: [review.title, review.content].filter(Boolean).join(' '),
      overrideCategory: overrides.get(`review:${review.id}`) ?? null,
      maps,
    })
    const row = touch(resolved)
    row.badReviews += 1
    row.reasons[classified.category] += 1
  }
  for (const item of returns) {
    const resolved = resolveReturnSku({ ...item, fallbackId: item.id })
    if (!skuFilterMatch(resolved, input.sku)) continue
    const classified = classifyAttribution({
      reasonCode: item.reasonCode,
      text: item.reasonText,
      overrideCategory: overrides.get(`reverse_item:${item.id}`) ?? null,
      maps,
    })
    const row = touch(resolved)
    row.returns += 1
    row.reasons[classified.category] += 1
  }

  const items = Array.from(buckets.values()).sort(
    (a, b) => b.badReviews + b.returns - (a.badReviews + a.returns) || a.sku.localeCompare(b.sku),
  )
  const kpis = {
    badReviews: items.reduce((sum, item) => sum + item.badReviews, 0),
    returns: items.reduce((sum, item) => sum + item.returns, 0),
    skuCount: items.length,
  }
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    pageSize,
    kpis,
    note: '数据来自已入库的评论（评分 1–2）和退货记录；平台评论回复与售后列表拉取尚未接入。',
  }
}

export async function listAttributionDrill(
  db: AppDatabase,
  organizationId: string,
  input: AttributionFilter & { sku: string },
): Promise<{ sku: string; name: string; lines: AttributionDrillLine[] }> {
  const sku = input.sku.trim()
  if (!sku) throw new Error('请指定 SKU')
  const [maps, overrides, reviews, returns] = await Promise.all([
    listReasonMaps(db, organizationId),
    loadOverrides(db, organizationId),
    loadReviewRows(db, organizationId, input),
    loadReturnRows(db, organizationId, input),
  ])
  const lines: AttributionDrillLine[] = []
  let name = sku
  for (const review of reviews) {
    const resolved = resolveReviewSku(review)
    if (resolved.sku !== sku) continue
    if (resolved.name) name = resolved.name
    const classified = classifyAttribution({
      text: [review.title, review.content].filter(Boolean).join(' '),
      overrideCategory: overrides.get(`review:${review.id}`) ?? null,
      maps,
    })
    const at = reviewTime(review.reviewAt, review.createdAt)
    lines.push({
      id: review.id,
      kind: 'review',
      sku: resolved.sku,
      shopName: review.shopName ?? '',
      rating: review.rating,
      content: [review.title, review.content].filter(Boolean).join(' ') || '（无评论文本）',
      reasonCode: '',
      category: classified.category,
      categoryLabel: ATTRIBUTION_CATEGORY_LABELS[classified.category],
      source: classified.source,
      overridden: classified.source === 'override',
      status: `评分 ${review.rating}`,
      at: at ? at.toISOString() : null,
    })
  }
  for (const item of returns) {
    const resolved = resolveReturnSku({ ...item, fallbackId: item.id })
    if (resolved.sku !== sku) continue
    if (resolved.name) name = resolved.name
    const classified = classifyAttribution({
      reasonCode: item.reasonCode,
      text: item.reasonText,
      overrideCategory: overrides.get(`reverse_item:${item.id}`) ?? null,
      maps,
    })
    const at = item.platformCreatedAt ?? item.createdAt
    lines.push({
      id: item.id,
      kind: 'return',
      sku: resolved.sku,
      shopName: item.shopName ?? '',
      rating: null,
      content: item.reasonText || '（无退货原因文本）',
      reasonCode: item.reasonCode ?? '',
      category: classified.category,
      categoryLabel: ATTRIBUTION_CATEGORY_LABELS[classified.category],
      source: classified.source,
      overridden: classified.source === 'override',
      status: item.reverseStatus ?? '',
      at: at ? at.toISOString() : null,
    })
  }
  lines.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  return { sku, name, lines }
}

