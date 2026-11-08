'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'

function sentimentVariant(value: string) {
  if (value === '负面') return 'destructive' as const
  if (value === '正面') return 'secondary' as const
  return 'outline' as const
}

export default function ReviewsPage() {
  const listQuery = trpc.reviews.list.useQuery({ page: 1, pageSize: 100 })
  const statsQuery = trpc.reviews.stats.useQuery()
  const meta = trpc.reviews.meta.useQuery()
  const rows = listQuery.data?.items ?? []
  const kpi = statsQuery.data

  const kpiItems = React.useMemo(
    () => [
      { label: '评论数', value: String(kpi?.total ?? 0) },
      { label: '均分', value: kpi?.avg ? kpi.avg.toFixed(1) : '—' },
      { label: '正面', value: String(kpi?.pos ?? 0) },
      { label: '中性', value: String(kpi?.neu ?? 0) },
      { label: '负面', value: String(kpi?.neg ?? 0) },
      { label: '未回复', value: String(kpi?.unreplied ?? 0) },
    ],
    [kpi],
  )

  return (
    <UedWorkspace
      title="商品评论"
      description="product_reviews：星级、情感、原文/译文、回复状态。平台回复 OpenAPI 为 stub。"
      rows={rows}
      detailHref={(row) => `/console/reviews/${encodeURIComponent(row.id)}`}
      searchKeys={['id', 'content', 'contentZh', 'buyer', 'shop', 'internalSku', 'itemId', 'sentiment', 'platformSku', 'replyStatus']}
      searchPlaceholder="搜索评论、买家、SKU 或 Item ID"
      filters={[
        { label: '情感', options: [...(meta.data?.sentiments ?? [])], key: 'sentiment' },
        { label: '回复', options: [...(meta.data?.replyStatuses ?? [])], key: 'replyStatus' },
      ]}
      emptyText={
        listQuery.isLoading
          ? '加载中…'
          : '暂无评论。待平台授权后由 review 同步写入；禁止假抓取成功。'
      }
      columns={[
        { key: 'at', label: '时间' },
        { key: 'shop', label: '店铺' },
        { key: 'rating', label: '星级', render: (row) => `${row.rating} ★` },
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
        {
          key: 'replyStatus',
          label: '回复',
          render: (row) => <Badge variant="outline">{row.replyStatus}</Badge>,
        },
        { key: 'internalSku', label: '内部 SKU' },
        { key: 'itemId', label: 'Item ID' },
        { key: 'buyer', label: '买家' },
        { key: 'source', label: '来源' },
      ]}
    >
      <DetailKpiRow items={kpiItems} />
      <UedPrototypeNotice>
        平台回复接口暂未接通；详情页可手工回复或排队等待接入，不会同步到平台。
        {meta.data?.note ? ` ${meta.data.note}` : ''}
      </UedPrototypeNotice>
      {listQuery.error ? (
        <p role="status" className="text-sm text-destructive">
          {listQuery.error.message}
        </p>
      ) : null}
    </UedWorkspace>
  )
}
