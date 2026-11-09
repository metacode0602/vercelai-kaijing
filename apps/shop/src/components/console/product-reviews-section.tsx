'use client'

import * as React from 'react'
import { DetailSection } from '@/components/console/detail'
import { Button } from '@workspace/ui/components/button'
import { Badge } from '@workspace/ui/components/badge'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Star } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

export function ProductReviewsSection({ sku }: { sku: string }) {
  const query = trpc.reviews.list.useQuery({ page: 1, pageSize: 20, q: sku })
  const rows = query.data?.items ?? []

  return (
    <DetailSection
      title="评论列表"
      description="读 product_reviews；平台抓取 / 回复 OpenAPI 仍为 stub，不假装已同步成功。"
    >
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">加载评论…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">暂无评论数据</p>
          <Button size="sm" variant="outline" asChild>
            <LocaleLink href="/console/reviews">打开评论中心</LocaleLink>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 font-medium">
                  <Star className="size-3.5 text-amber-500" />
                  {r.rating ?? '—'}
                </span>
                <Badge variant="secondary">{r.sentiment}</Badge>
                <Badge variant="outline">{r.replyStatus}</Badge>
                <span className="text-xs text-muted-foreground">{r.at}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{r.content || '—'}</p>
            </div>
          ))}
          <Button size="sm" variant="outline" asChild>
            <LocaleLink href="/console/reviews">查看全部评论</LocaleLink>
          </Button>
        </div>
      )}
    </DetailSection>
  )
}
