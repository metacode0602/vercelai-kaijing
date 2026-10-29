'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { DetailSection } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_REVIEWS } from '../page'

export default function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = DEMO_REVIEWS.find((item) => item.id === id)
  if (!row) notFound()
  return (
    <UedRecordDetail
      backHref="/console/reviews"
      moduleTitle="商品评论"
      module="reviews"
      row={row as unknown as Record<string, unknown>}
      related={[
        {
          title: '商品与评论分析',
          description: 'TEE-001 · 评论按 SKU 汇总情感与关键发现',
          items: [
            { label: '商品详情 TEE-001', href: '/console/products/TEE-001' },
            { label: 'SKU 成本', href: '/console/costs/TEE-001' },
            { label: '评论管理', href: '/console/reviews' },
          ],
        },
      ]}
      extra={
        <DetailSection title="评论原文与翻译" description="保留原文，中文翻译仅作运营参考">
          <div className="grid gap-3">
            <p className="text-sm">{row.content}</p>
            <p className="text-sm text-muted-foreground">{row.contentZh}</p>
          </div>
        </DetailSection>
      }
    />
  )
}
