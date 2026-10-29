'use client'

import * as React from 'react'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { MOCK_PRODUCT_REVIEWS, getProductReviewsBySku } from '@/lib/crossborder/mock-data'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { LocaleLink } from '@/lib/i18n/navigation'
import { activeDictionaryValues, useDictionaries } from '@/lib/crossborder/dictionary-store'

const demo = getProductReviewsBySku('TEE-001') ?? Object.values(MOCK_PRODUCT_REVIEWS)[0]!

type ReviewRow = {
  id: string
  rating: number
  sentiment: string
  content: string
  contentZh: string
  buyer: string
  at: string
  source: string
  images: number
}

export const DEMO_REVIEWS: ReviewRow[] = demo.reviews.map((review) => ({
  id: review.reviewId,
  rating: review.rating ?? 0,
  sentiment: review.sentiment === 'pos' ? '正面' : review.sentiment === 'neu' ? '中性' : '负面',
  content: review.content ?? '（无正文）',
  contentZh: review.contentZh ?? '—',
  buyer: review.buyerName ?? '匿名买家',
  at: review.createdAt ?? '—',
  source: review.source === 'api' ? '接口抓取' : '人工录入',
  images: review.images?.length ?? 0,
}))

const sentimentVariant = (value: string) =>
  value === '负面' ? 'destructive' : value === '正面' ? 'secondary' : 'outline'

export default function ReviewsPage() {
  const [notice, setNotice] = React.useState('')
  const dictionaryState = useDictionaries()
  const sentimentOptions = activeDictionaryValues(dictionaryState, 'review_sentiment')
  return (
    <UedWorkspace
      title="商品评论"
      description="评论原文与翻译、情感标注、抓取运行状态；分析报告与关键发现按 SKU 下钻。"
      rows={DEMO_REVIEWS} detailHref={(row) => `/console/reviews/${encodeURIComponent(row.id)}`}
      searchKeys={['id', 'sentiment', 'content', 'contentZh', 'buyer', 'source']}
      searchPlaceholder="搜索评论内容、买家或情感"
      filters={[{ label: '情感', options: sentimentOptions.length > 0 ? sentimentOptions : ['正面', '中性', '负面'] }]}
      columns={[
        { key: 'id', label: '评论 ID' },
        { key: 'rating', label: '评分', render: (row) => `${row.rating} ★` },
        { key: 'sentiment', label: '情感', render: (row) => <Badge variant={sentimentVariant(row.sentiment)}>{row.sentiment}</Badge> },
        { key: 'content', label: '原文' },
        { key: 'contentZh', label: '翻译' },
        { key: 'buyer', label: '买家' },
        { key: 'at', label: '时间' },
        { key: 'source', label: '来源' },
        { key: 'images', label: '图片', render: (row) => String(row.images) },
      ]}
    >
      <UedPrototypeNotice>
        评论按负责店铺可见；高分差评（评分高但内容负面）会被情感分析标记。翻译与抓取状态为原型示例，正式链路为 review_fetch_runs 抓取 → product_reviews 存储 → 分析报告。
      </UedPrototypeNotice>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: '评论总数', value: String(demo.kpis.total) },
          { label: '平均分', value: demo.kpis.avg.toFixed(2) },
          { label: '正面', value: String(demo.kpis.pos) },
          { label: '中性', value: String(demo.kpis.neu) },
          { label: '负面', value: String(demo.kpis.neg) },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">{kpi.label}</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-semibold tabular-nums">{kpi.value}</p></CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">最近抓取：{(demo.meta.fetchedAt ?? '—').replace('T', ' ').replace('Z', ' UTC')}</Badge>
        <Badge variant="outline">SKU：{demo.product.sku} · 已抓取 {demo.meta.totalFetched} 条（去重 {demo.meta.deduped}）</Badge>
        <Button variant="outline" size="sm" onClick={() => setNotice('抓取运行已排队（原型）；下次运行按 review_fetch_runs 调度配置执行。')}>立即抓取</Button>
        <Button variant="outline" size="sm" onClick={() => setNotice('分析报告示例：负面集中在「尺寸偏小」与「色差」2 个关键发现，关联 5 条评论。')}>查看分析报告</Button>
        <Button variant="outline" size="sm" onClick={() => setNotice('高分差评视图：评分 ≥4 但情感为负面，共 2 条（示例）。')}>高分差评</Button>
        <Button variant="outline" size="sm" asChild><LocaleLink href="/console/dictionaries">管理情感标签</LocaleLink></Button>
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>
  )
}
