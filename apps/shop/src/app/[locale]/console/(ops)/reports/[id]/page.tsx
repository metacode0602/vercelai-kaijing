'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const mix = trpc.dashboard.platformMix.useQuery({ range: 30 })
  const row = (mix.data ?? []).find((item) => item.platform === id)

  if (mix.isLoading) {
    return <DetailPageHeader backHref="/console/reports" title="加载中…" description="读取平台聚合…" />
  }

  if (!row) {
    return (
      <div className="space-y-4">
        <DetailPageHeader backHref="/console/reports" title={id} description="未找到该维度的聚合数据。" />
        <Alert>
          <AlertTitle>暂无数据</AlertTitle>
          <AlertDescription>
            仅当看板有对应平台聚合数据时才展示明细。
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <DetailPageHeader
        backHref="/console/reports"
        title={row.platform}
        description="来自订单 × 店铺 platform 聚合（近 30 天）"
        badges={<Badge variant="secondary">真实聚合</Badge>}
      />
      <Alert>
        <AlertTitle>口径说明</AlertTitle>
        <AlertDescription>
          订单数 {row.orders} · 销售额 {row.revenue} · 占比 {row.share}%。完整报表（汇率/费用分摊）仍待确认。
        </AlertDescription>
      </Alert>
    </div>
  )
}
