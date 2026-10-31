'use client'

/**
 * product_reviews 原型会话 store（schema §10）— Phase 4 只读面。
 * 抓取 / 翻译为原型动作，不调用真实平台。
 */

import { createDemoStore } from '@/lib/crossborder/local-store'
import { MOCK_PRODUCT_REVIEWS } from '@/lib/crossborder/mock-data'

export const REVIEW_SENTIMENTS = ['正面', '中性', '负面'] as const
export type ReviewSentiment = (typeof REVIEW_SENTIMENTS)[number]

export type ReviewRecord = {
  id: string
  rating: number
  sentiment: ReviewSentiment
  content: string
  contentZh: string
  buyer: string
  at: string
  source: string
  images: number
  platform: string
  shop: string
  itemId: string
  /** 平台变体描述 */
  platformSku: string
  /** 内部 SKU（可空，原型默认映射） */
  internalSku: string
  spu: string
  listingId: string
  tags: string[]
  fetchedAt: string
}

function sentimentLabel(raw: string | undefined): ReviewSentiment {
  if (raw === 'pos') return '正面'
  if (raw === 'neu') return '中性'
  return '负面'
}

function seedFromMock(): ReviewRecord[] {
  const rows: ReviewRecord[] = []
  for (const [skuKey, pack] of Object.entries(MOCK_PRODUCT_REVIEWS)) {
    for (const review of pack.reviews) {
      rows.push({
        id: review.reviewId,
        rating: review.rating ?? 0,
        sentiment: sentimentLabel(review.sentiment),
        content: review.content ?? '（无正文）',
        contentZh: review.contentZh ?? '—',
        buyer: review.buyerName ?? '匿名买家',
        at: review.createdAt ?? '—',
        source: review.source === 'api' ? '接口抓取' : '人工录入',
        images: review.images?.length ?? 0,
        platform: review.platform ?? 'daraz',
        shop: 'Daraz LK',
        itemId: review.itemId ?? pack.product.itemId,
        platformSku: review.sku ?? '—',
        internalSku: 'HSY000001001',
        spu: 'HSY000001',
        listingId: 'lst-tee-daraz',
        tags: review.tags ?? [],
        fetchedAt: (pack.meta.fetchedAt ?? '').replace('T', ' ').replace('Z', ''),
      })
    }
    // extra synthetic reviews for richer KPI demo
    if (skuKey === 'TEE-001') {
      rows.push(
        {
          id: 'r5',
          rating: 4,
          sentiment: '正面',
          content: 'Good value for money. Kids love it.',
          contentZh: '性价比不错，孩子很喜欢。',
          buyer: 'A***k',
          at: '02 Oct 2026',
          source: '接口抓取',
          images: 0,
          platform: 'daraz',
          shop: 'Daraz LK',
          itemId: pack.product.itemId,
          platformSku: 'Color:Blue, Size:25cm',
          internalSku: 'HSY000001001',
          spu: 'HSY000001',
          listingId: 'lst-tee-daraz',
          tags: [],
          fetchedAt: (pack.meta.fetchedAt ?? '').replace('T', ' ').replace('Z', ''),
        },
        {
          id: 'r6',
          rating: 2,
          sentiment: '负面',
          content: 'Color mismatch and packaging damaged.',
          contentZh: '色差明显，包装破损。',
          buyer: 'S***a',
          at: '30 Sep 2026',
          source: '接口抓取',
          images: 2,
          platform: 'daraz',
          shop: 'Daraz LK',
          itemId: pack.product.itemId,
          platformSku: 'Color:Yellow, Size:25cm',
          internalSku: 'HSY000001001',
          spu: 'HSY000001',
          listingId: 'lst-tee-daraz',
          tags: ['色差', '包装'],
          fetchedAt: (pack.meta.fetchedAt ?? '').replace('T', ' ').replace('Z', ''),
        },
      )
    }
  }
  return rows
}

type ReviewState = {
  reviews: ReviewRecord[]
  lastFetchAt: string
  lastFetchNote: string
  fetchQueued: boolean
}

const store = createDemoStore<ReviewState>('open-shop.console.demo.reviews.v1', {
  reviews: seedFromMock(),
  lastFetchAt: '2026-10-28 06:32',
  lastFetchNote: '上次抓取 26 条（去重 26）',
  fetchQueued: false,
})

function nowStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function useReviews() {
  return store.useStore().reviews
}

export function useReviewMeta() {
  const state = store.useStore()
  return {
    lastFetchAt: state.lastFetchAt,
    lastFetchNote: state.lastFetchNote,
    fetchQueued: state.fetchQueued,
  }
}

export function getReviews() {
  return store.get().reviews
}

export function getReview(id: string) {
  return store.get().reviews.find((item) => item.id === id)
}

export function countReviewsKpi(rows: ReviewRecord[]) {
  const total = rows.length
  const avg = total === 0 ? 0 : rows.reduce((sum, row) => sum + row.rating, 0) / total
  return {
    total,
    avg,
    pos: rows.filter((row) => row.sentiment === '正面').length,
    neu: rows.filter((row) => row.sentiment === '中性').length,
    neg: rows.filter((row) => row.sentiment === '负面').length,
    highScoreNeg: rows.filter((row) => row.rating >= 4 && row.sentiment === '负面').length,
  }
}

/** 原型：排队评论抓取（不调用平台） */
export function queueReviewFetch(): { ok: true; note: string } {
  const state = store.get()
  store.set({
    ...state,
    fetchQueued: true,
    lastFetchAt: nowStamp(),
    lastFetchNote: '抓取运行已排队（原型）；下次按 review_fetch_runs 调度执行，未调用平台。',
  })
  return { ok: true, note: store.get().lastFetchNote }
}

export function toRelatedReviewShape(row: ReviewRecord): Record<string, unknown> {
  return {
    id: row.id,
    rating: row.rating,
    sentiment: row.sentiment,
    content: row.content,
    contentZh: row.contentZh,
    buyer: row.buyer,
    at: row.at,
    source: row.source,
    images: row.images,
    sku: row.internalSku,
    internalSku: row.internalSku,
    shop: row.shop,
    listingId: row.listingId,
    spu: row.spu,
    itemId: row.itemId,
  }
}
