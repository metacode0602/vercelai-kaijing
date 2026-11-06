export const UI_REVIEW_SOURCES = ['接口抓取', 'AI 抓取', '人工录入', '混合'] as const
export type UiReviewSource = (typeof UI_REVIEW_SOURCES)[number]

export const UI_REVIEW_STATUSES = ['有效', '隐藏', '已删除'] as const
export type UiReviewStatus = (typeof UI_REVIEW_STATUSES)[number]

export const UI_REPLY_STATUSES = ['未回复', '待回复', '已回复', '已排队(stub)'] as const
export type UiReplyStatus = (typeof UI_REPLY_STATUSES)[number]

export const UI_REVIEW_SENTIMENTS = ['正面', '中性', '负面'] as const
export type UiReviewSentiment = (typeof UI_REVIEW_SENTIMENTS)[number]

export function toUiReviewSource(v: string | null | undefined): UiReviewSource {
  switch ((v ?? '').toLowerCase()) {
    case 'api':
      return '接口抓取'
    case 'ai_scrape':
      return 'AI 抓取'
    case 'manual':
      return '人工录入'
    case 'mixed':
      return '混合'
    default:
      return '接口抓取'
  }
}

export function toUiReviewStatus(v: string | null | undefined): UiReviewStatus {
  switch ((v ?? '').toLowerCase()) {
    case 'hidden':
      return '隐藏'
    case 'removed':
      return '已删除'
    default:
      return '有效'
  }
}

export function toUiReplyStatus(v: string | null | undefined): UiReplyStatus {
  switch ((v ?? '').toLowerCase()) {
    case 'pending':
      return '待回复'
    case 'replied':
      return '已回复'
    case 'stub_queued':
      return '已排队(stub)'
    default:
      return '未回复'
  }
}

export function toDbReplyStatus(v: string | null | undefined): string {
  const x = (v ?? '').trim()
  if (x === '待回复' || x === 'pending') return 'pending'
  if (x === '已回复' || x === 'replied') return 'replied'
  if (x === '已排队(stub)' || x === 'stub_queued') return 'stub_queued'
  return 'none'
}

export function sentimentFromRating(rating: number, tags: string[] = []): UiReviewSentiment {
  if (tags.some((t) => /负面|差评|neg/i.test(t))) return '负面'
  if (tags.some((t) => /正面|好评|pos/i.test(t))) return '正面'
  if (rating >= 4) return '正面'
  if (rating <= 2) return '负面'
  return '中性'
}

export function formatStamp(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const x = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(x.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:${pad(x.getMinutes())}`
}
