'use client'

import * as React from 'react'
import {
  ConsoleBreadcrumbs,
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailRelatedTables,
  parentsToFields,
} from '@/components/console/detail'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { buildUedRelatedInfo } from '@/lib/console/related-info'
import { toRelatedReviewShape, useReviews } from '@/lib/crossborder/review-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const rows = useReviews()
  const row = rows.find((item) => item.id === id)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/reviews"
          title={mounted ? '未找到评论' : '加载中…'}
          description={mounted ? `评论 ${id} 不存在。` : '正在读取本机原型会话…'}
        />
      </div>
    )
  }

  const related = buildUedRelatedInfo('reviews', toRelatedReviewShape(row))
  const parentFields = parentsToFields(related.parents)

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbs items={[{ label: '商品评论', href: '/console/reviews' }, { label: row.id }]} />
      <DetailPageHeader
        backHref="/console/reviews"
        title={`${row.rating} ★ · ${row.sentiment}`}
        description={`${row.shop} · ${row.buyer} · ${row.at}`}
        badges={
          <>
            <Badge variant="outline">只读</Badge>
            <Badge variant={row.sentiment === '负面' ? 'destructive' : 'secondary'}>{row.sentiment}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {row.listingId ? (
              <Button size="sm" variant="outline" asChild>
                <LocaleLink href={`/console/listings/${encodeURIComponent(row.listingId)}`}>
                  刊登
                </LocaleLink>
              </Button>
            ) : null}
            {row.internalSku ? (
              <Button size="sm" variant="outline" asChild>
                <LocaleLink href={`/console/master-skus/${encodeURIComponent(row.internalSku)}`}>
                  SKU
                </LocaleLink>
              </Button>
            ) : null}
          </div>
        }
      />
      <UedPrototypeNotice>评论只读；翻译字段为原型。不可回复平台（P5 再接）。</UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '星级', value: String(row.rating) },
          { label: '情感', value: row.sentiment },
          { label: '图片数', value: String(row.images) },
          { label: '来源', value: row.source },
        ]}
      />
      <DetailFieldGrid
        title="评论正文"
        description="原文与译文"
        fields={[
          { label: '评论 ID', value: row.id, mono: true },
          ...parentFields,
          { label: '原文', value: row.content },
          { label: '译文', value: row.contentZh },
          { label: '平台变体', value: row.platformSku },
          { label: 'Item ID', value: row.itemId, mono: true },
          { label: '内部 SKU', value: row.internalSku, mono: true },
          { label: 'SPU', value: row.spu, mono: true },
          { label: '刊登', value: row.listingId, mono: true },
          { label: '抓取时间', value: row.fetchedAt || '—' },
          { label: '标签', value: row.tags.length ? row.tags.join('、') : '—' },
        ]}
      />
      <DetailRelatedTables sections={related.sections ?? []} />
    </div>
  )
}
