'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  REVIEW_SENTIMENTS,
  countReviewsKpi,
  queueReviewFetch,
  useReviewMeta,
  useReviews,
} from '@/lib/crossborder/review-store'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function sentimentVariant(value: string) {
  if (value === '负面') return 'destructive' as const
  if (value === '正面') return 'secondary' as const
  return 'outline' as const
}

export default function ReviewsPage() {
  const rows = useReviews()
  const meta = useReviewMeta()
  const kpi = React.useMemo(() => countReviewsKpi(rows), [rows])
  const [notice, setNotice] = React.useState('')

  const kpiItems = React.useMemo(
    () => [
      { label: '评论数', value: String(kpi.total) },
      { label: '均分', value: kpi.avg ? kpi.avg.toFixed(1) : '—' },
      { label: '正面', value: String(kpi.pos) },
      { label: '中性', value: String(kpi.neu) },
      { label: '负面', value: String(kpi.neg), hint: kpi.highScoreNeg ? `含高分差评 ${kpi.highScoreNeg}` : undefined },
    ],
    [kpi],
  )

  return (
    <UedWorkspace
      title="商品评论"
      description="product_reviews 只读面：星级、情感、原文/译文；关联刊登 / SKU / SPU。抓取与翻译为原型动作。"
      rows={rows}
      detailHref={(row) => `/console/reviews/${encodeURIComponent(row.id)}`}
      searchKeys={['id', 'content', 'contentZh', 'buyer', 'shop', 'internalSku', 'itemId', 'sentiment', 'platformSku']}
      searchPlaceholder="搜索评论、买家、SKU 或 Item ID"
      filters={[{ label: '情感', options: [...REVIEW_SENTIMENTS], key: 'sentiment' }]}
      emptyText="暂无评论。可排队原型抓取；正式环境由 review_fetch_runs 调度。"
      columns={[
        { key: 'at', label: '时间' },
        { key: 'shop', label: '店铺' },
        {
          key: 'rating',
          label: '星级',
          render: (row) => `${row.rating} ★`,
        },
        {
          key: 'sentiment',
          label: '情感',
          render: (row) => <Badge variant={sentimentVariant(row.sentiment)}>{row.sentiment}</Badge>,
        },
        {
          key: 'contentZh',
          label: '译文摘要',
          render: (row) => (
            <span className="line-clamp-2 max-w-xs text-sm">{row.contentZh || row.content}</span>
          ),
        },
        { key: 'internalSku', label: '内部 SKU' },
        { key: 'itemId', label: 'Item ID' },
        { key: 'buyer', label: '买家' },
        { key: 'source', label: '来源' },
      ]}
    >
      <DetailKpiRow items={kpiItems} />
      <UedPrototypeNotice>
        只读运营面。原文保留；译文为原型字段。抓取不调用真实平台 connector。
        {meta.lastFetchAt ? ` 上次排队：${meta.lastFetchAt}。` : ''}
        {meta.lastFetchNote ? ` ${meta.lastFetchNote}` : ''}
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            const result = queueReviewFetch()
            setNotice(result.note)
          }}
        >
          排队抓取评论（原型）
        </Button>
      </div>
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </UedWorkspace>
  )
}
