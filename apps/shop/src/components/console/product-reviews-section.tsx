'use client'

import * as React from 'react'
import { DetailSection } from '@/components/console/detail'
import { Button } from '@workspace/ui/components/button'
import { Badge } from '@workspace/ui/components/badge'
import { getProductReviewsBySku, type ProductReviewsData, type ReviewItem } from '@/lib/crossborder/mock-data'
import { RefreshCw, ExternalLink, Star } from 'lucide-react'
import { toast } from 'sonner'

function sentimentVariant(s: ReviewItem['sentiment']) {
  if (s === 'pos') return 'default' as const
  if (s === 'neg') return 'destructive' as const
  if (s === 'neu') return 'secondary' as const
  return 'outline' as const
}

function sentimentLabel(s: ReviewItem['sentiment']) {
  if (s === 'pos') return '正向'
  if (s === 'neg') return '负向'
  if (s === 'neu') return '中性'
  return '其他'
}

export function ProductReviewsSection({ sku }: { sku: string }) {
  const [data, setData] = React.useState<ProductReviewsData | null>(() => getProductReviewsBySku(sku))
  const [refreshing, setRefreshing] = React.useState(false)
  const [filter, setFilter] = React.useState<'all' | 'pos' | 'neu' | 'neg' | 'highneg'>('all')
  const [onlyImage, setOnlyImage] = React.useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    toast.message('正在刷新评论数据（优先 API，其次 AI 自动抓取）')
    await new Promise((r) => setTimeout(r, 800))
    // Mock refresh: keep data but update meta
    setData((prev) =>
      prev
        ? {
            ...prev,
            meta: {
              ...prev.meta,
              fetchedAt: new Date().toISOString(),
              source: prev.meta.source === 'ai_scrape' ? 'mixed' : prev.meta.source ?? 'api',
            },
          }
        : prev,
    )
    setRefreshing(false)
    toast.success('评论数据已刷新')
  }

  const reviews = React.useMemo(() => {
    if (!data) return []
    return data.reviews.filter((r) => {
      if (onlyImage && (!r.images || r.images.length === 0)) return false
      if (filter === 'highneg') return r.tags?.includes('高分差评')
      if (filter === 'pos') return r.sentiment === 'pos'
      if (filter === 'neu') return r.sentiment === 'neu'
      if (filter === 'neg') return r.sentiment === 'neg'
      return true
    })
  }, [data, filter, onlyImage])

  if (!data) {
    return (
      <DetailSection title="评论列表" description="商品评价数据（后台抓取）">
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">暂无评论数据</p>
          <Button onClick={handleRefresh} disabled={refreshing} size="sm">
            {refreshing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            手动刷新（优先 API，其次 AI）
          </Button>
        </div>
      </DetailSection>
    )
  }

  const desc = `商品评价数据（后台抓取） · 上次刷新：${data.meta.fetchedAt ? new Date(data.meta.fetchedAt).toLocaleString() : '—'} · 来源：${
    data.meta.source === 'api' ? 'API' : data.meta.source === 'ai_scrape' ? 'AI' : data.meta.source === 'mixed' ? 'API 优先（混合）' : '—'
  }`
  return (
    <DetailSection
      title="评论列表"
      description={desc}
      action={
        <div className="flex items-center gap-2">
          {data.product.platformUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={data.product.platformUrl} target="_blank" rel="noreferrer">
                平台链接 <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          )}
          <Button onClick={handleRefresh} disabled={refreshing} size="sm">
            {refreshing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            手动刷新
          </Button>
        </div>
      }
    >
      <div className="mb-4 grid grid-cols-6 gap-2">
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">实抓</div>
          <div className="text-lg font-semibold">{data.kpis.total}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">样本平均分</div>
          <div className="text-lg font-semibold">{data.kpis.avg.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">正向</div>
          <div className="text-lg font-semibold text-green-600">{data.kpis.pos}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">中性</div>
          <div className="text-lg font-semibold text-amber-600">{data.kpis.neu}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">负向</div>
          <div className="text-lg font-semibold text-red-600">{data.kpis.neg}</div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-xs text-muted-foreground">带图</div>
          <div className="text-lg font-semibold">{data.kpis.withImage}</div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>
          全部
        </Button>
        <Button variant={filter === 'pos' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('pos')}>
          正向
        </Button>
        <Button variant={filter === 'neu' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('neu')}>
          中性
        </Button>
        <Button variant={filter === 'neg' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('neg')}>
          负向
        </Button>
        <Button variant={filter === 'highneg' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('highneg')}>
          高分差评
        </Button>
        <Button variant={onlyImage ? 'default' : 'outline'} size="sm" onClick={() => setOnlyImage((v) => !v)}>
          仅带图
        </Button>
        <div className="ml-auto">
          <Button variant="outline" size="sm" asChild>
            <a href="/design/comments/Daraz评价分析报告-3D打印机器人.html" target="_blank" rel="noreferrer">
              查看 HTML 报告 <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {reviews.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">无匹配评论</div>
        ) : (
          reviews.map((r) => (
            <div key={r.reviewId} className="rounded-lg border p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`} />
                  ))}
                </div>
                <Badge variant={sentimentVariant(r.sentiment)}>{sentimentLabel(r.sentiment)}</Badge>
                {r.tags?.includes('高分差评') && <Badge variant="destructive">高分差评</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">{r.createdAt} · 买家 {r.buyerName}</span>
              </div>
              {r.sku && <div className="mb-2 text-xs text-blue-600">SKU：{r.sku}</div>}
              {r.content && <div className="mb-1 text-sm">{r.content}</div>}
              {r.contentZh && <div className="mb-2 rounded bg-muted/40 p-2 text-sm text-muted-foreground">{r.contentZh}</div>}
              {r.images && r.images.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.images.map((img, idx) => (
                    <a key={idx} href={img.url} target="_blank" rel="noreferrer">
                      <img src={img.url} alt="" className="h-16 w-16 rounded border object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </DetailSection>
  )
}
