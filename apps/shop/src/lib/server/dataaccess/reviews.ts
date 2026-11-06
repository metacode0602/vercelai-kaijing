/**
 * product_reviews / product_review_media（模块15）。
 * 列表/详情/回复状态落库；平台回复真实 API 仅 stub（stub_queued），禁止假成功。
 */
import { and, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import {
  productReviewMedia,
  productReviews,
  productVariants,
  shops,
} from '@workspace/db/schema'
import type { AppDatabase } from '@workspace/db'
import {
  formatStamp,
  sentimentFromRating,
  toDbReplyStatus,
  toUiReplyStatus,
  toUiReviewSource,
  toUiReviewStatus,
  type UiReplyStatus,
  type UiReviewSentiment,
  type UiReviewSource,
  type UiReviewStatus,
} from '@/lib/server/mappers/reviews'
import {
  normalizePage,
  normalizePageSize,
  type PaginatedResult,
} from '@/lib/server/dataaccess/pagination'

type DbLike = AppDatabase | Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

export type ReviewMediaDto = {
  id: string
  mediaType: string
  url: string
  sortOrder: number
}

export type ReviewDto = {
  id: string
  rating: number
  sentiment: UiReviewSentiment
  content: string
  contentZh: string
  buyer: string
  at: string
  source: UiReviewSource
  dbSource: string
  status: UiReviewStatus
  images: number
  media: ReviewMediaDto[]
  platform: string
  shop: string
  shopId: string
  itemId: string
  platformSku: string
  internalSku: string
  listingId: string
  tags: string[]
  fetchedAt: string
  replyStatus: UiReplyStatus
  dbReplyStatus: string
  replyContent: string
  repliedAt: string
  replySource: string
}

function tagsFromRaw(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return []
  const tags = (raw as { tags?: unknown }).tags
  return Array.isArray(tags) ? tags.map(String) : []
}

function mapRow(
  row: typeof productReviews.$inferSelect,
  shopName: string,
  platform: string,
  sku: string,
  media: ReviewMediaDto[],
): ReviewDto {
  const tags = tagsFromRaw(row.raw)
  return {
    id: row.id,
    rating: Number(row.rating ?? 0),
    sentiment: sentimentFromRating(Number(row.rating ?? 0), tags),
    content: row.content ?? '（无正文）',
    contentZh: row.contentZh ?? '',
    buyer: row.isAnonymous ? '匿名买家' : row.buyerDisplayName || '买家',
    at: formatStamp(row.reviewAt ?? row.fetchedAt),
    source: toUiReviewSource(row.source),
    dbSource: row.source,
    status: toUiReviewStatus(row.status),
    images: media.length,
    media,
    platform: platform || '—',
    shop: shopName || '—',
    shopId: row.shopId,
    itemId: row.externalItemId,
    platformSku: row.sellerSku || '—',
    internalSku: sku || '—',
    listingId: row.listingId || '',
    tags,
    fetchedAt: formatStamp(row.fetchedAt),
    replyStatus: toUiReplyStatus(row.replyStatus),
    dbReplyStatus: row.replyStatus ?? 'none',
    replyContent: row.replyContent ?? '',
    repliedAt: formatStamp(row.repliedAt),
    replySource: row.replySource ?? '',
  }
}

export async function listReviews(
  db: AppDatabase,
  organizationId: string,
  input: { page?: number; pageSize?: number; q?: string; sentiment?: string; replyStatus?: string } = {},
): Promise<PaginatedResult<ReviewDto>> {
  const page = normalizePage(input.page)
  const pageSize = normalizePageSize(input.pageSize ?? 50)
  const filters: SQL[] = [eq(productReviews.organizationId, organizationId)]
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`
    filters.push(
      or(
        ilike(productReviews.content, q),
        ilike(productReviews.contentZh, q),
        ilike(productReviews.buyerDisplayName, q),
        ilike(productReviews.externalItemId, q),
        ilike(productReviews.sellerSku, q),
        ilike(productReviews.externalReviewId, q),
      )!,
    )
  }
  if (input.replyStatus && input.replyStatus !== 'all') {
    filters.push(eq(productReviews.replyStatus, toDbReplyStatus(input.replyStatus)))
  }
  const where = and(...filters)!

  const [totalRow] = await db.select({ value: count() }).from(productReviews).where(where)
  const rows = await db
    .select({
      review: productReviews,
      shopName: shops.name,
      platform: shops.platform,
      sku: productVariants.sku,
    })
    .from(productReviews)
    .leftJoin(shops, eq(productReviews.shopId, shops.id))
    .leftJoin(productVariants, eq(productReviews.variantId, productVariants.id))
    .where(where)
    .orderBy(desc(productReviews.reviewAt), desc(productReviews.fetchedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const ids = rows.map((r) => r.review.id)
  const mediaByReview = new Map<string, ReviewMediaDto[]>()
  if (ids.length > 0) {
    const mediaRows = await db
      .select()
      .from(productReviewMedia)
      .where(
        and(
          eq(productReviewMedia.organizationId, organizationId),
          inArray(productReviewMedia.reviewId, ids),
        ),
      )
      .orderBy(productReviewMedia.sortOrder)
    for (const m of mediaRows) {
      const list = mediaByReview.get(m.reviewId) ?? []
      list.push({ id: m.id, mediaType: m.mediaType, url: m.url, sortOrder: m.sortOrder })
      mediaByReview.set(m.reviewId, list)
    }
  }

  let items = rows.map((r) =>
    mapRow(r.review, r.shopName ?? '', r.platform ?? '', r.sku ?? '', mediaByReview.get(r.review.id) ?? []),
  )
  if (input.sentiment && input.sentiment !== 'all') {
    items = items.filter((i) => i.sentiment === input.sentiment)
  }

  return { items, total: Number(totalRow?.value ?? 0), page, pageSize }
}

export async function reviewStats(db: AppDatabase, organizationId: string) {
  const rows = await db
    .select({
      rating: productReviews.rating,
      replyStatus: productReviews.replyStatus,
    })
    .from(productReviews)
    .where(eq(productReviews.organizationId, organizationId))
  const total = rows.length
  const avg = total ? rows.reduce((s, r) => s + Number(r.rating ?? 0), 0) / total : 0
  let pos = 0
  let neu = 0
  let neg = 0
  let unreplied = 0
  for (const r of rows) {
    const rating = Number(r.rating ?? 0)
    const sent = sentimentFromRating(rating)
    if (sent === '正面') pos += 1
    else if (sent === '负面') neg += 1
    else neu += 1
    if ((r.replyStatus ?? 'none') === 'none' || r.replyStatus === 'pending') unreplied += 1
  }
  return { total, avg, pos, neu, neg, unreplied }
}

export async function getReview(db: AppDatabase, organizationId: string, id: string): Promise<ReviewDto | null> {
  const [row] = await db
    .select({
      review: productReviews,
      shopName: shops.name,
      platform: shops.platform,
      sku: productVariants.sku,
    })
    .from(productReviews)
    .leftJoin(shops, eq(productReviews.shopId, shops.id))
    .leftJoin(productVariants, eq(productReviews.variantId, productVariants.id))
    .where(and(eq(productReviews.organizationId, organizationId), eq(productReviews.id, id)))
    .limit(1)
  if (!row) return null
  const mediaRows = await db
    .select()
    .from(productReviewMedia)
    .where(
      and(eq(productReviewMedia.organizationId, organizationId), eq(productReviewMedia.reviewId, id)),
    )
    .orderBy(productReviewMedia.sortOrder)
  const media = mediaRows.map((m) => ({
    id: m.id,
    mediaType: m.mediaType,
    url: m.url,
    sortOrder: m.sortOrder,
  }))
  return mapRow(row.review, row.shopName ?? '', row.platform ?? '', row.sku ?? '', media)
}

/** 手工录入回复（ERP 内）；不调用平台 */
export async function saveManualReply(
  db: DbLike,
  organizationId: string,
  input: { id: string; content: string; actor?: string },
) {
  const content = input.content.trim()
  if (!content) throw new Error('回复内容不能为空')
  const [existing] = await db
    .select()
    .from(productReviews)
    .where(and(eq(productReviews.organizationId, organizationId), eq(productReviews.id, input.id)))
    .limit(1)
  if (!existing) throw new Error('评论不存在')
  const now = new Date()
  await db
    .update(productReviews)
    .set({
      replyStatus: 'replied',
      replyContent: content,
      repliedAt: now,
      replySource: 'manual',
      updatedAt: now,
      raw: {
        ...(existing.raw && typeof existing.raw === 'object' ? existing.raw : {}),
        lastReplyActor: input.actor ?? 'console',
      },
    })
    .where(eq(productReviews.id, input.id))
  return getReview(db as AppDatabase, organizationId, input.id)
}

/**
 * 平台回复 stub：只标记 stub_queued，明确未调用 OpenAPI。
 * 禁止写成「已同步平台」。
 */
export async function queuePlatformReplyStub(
  db: DbLike,
  organizationId: string,
  input: { id: string; content?: string },
) {
  const [existing] = await db
    .select()
    .from(productReviews)
    .where(and(eq(productReviews.organizationId, organizationId), eq(productReviews.id, input.id)))
    .limit(1)
  if (!existing) throw new Error('评论不存在')
  const now = new Date()
  const draft = (input.content ?? existing.replyContent ?? '').trim()
  await db
    .update(productReviews)
    .set({
      replyStatus: 'stub_queued',
      replyContent: draft || existing.replyContent,
      replySource: 'platform_stub',
      updatedAt: now,
      raw: {
        ...(existing.raw && typeof existing.raw === 'object' ? existing.raw : {}),
        platformReplyStubAt: now.toISOString(),
        platformReplyNote: '平台回复 OpenAPI 未授权/未联调；仅排队 stub，未发往平台',
      },
    })
    .where(eq(productReviews.id, input.id))
  return {
    ok: true as const,
    note: '已标记 stub_queued：平台回复 API 未接，未发往 Daraz/Lazada。',
    row: await getReview(db as AppDatabase, organizationId, input.id),
  }
}
