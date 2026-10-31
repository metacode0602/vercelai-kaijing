'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_FREIGHT_ESTIMATES } from '@/lib/crossborder/finance-related-data'

export default function FreightEstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = DEMO_FREIGHT_ESTIMATES.find((item) => item.id === id)
  if (!row) notFound()

  return (
    <UedRecordDetail
      backHref="/console/freight"
      moduleTitle="运费测算"
      module="freight"
      titleKeys={['id', 'scenario', 'title']}
      row={row as unknown as Record<string, unknown>}
      notice="运费估算快照为示例；采纳后不应被后续报价覆盖。父链指向内部 SKU / 箱规，子表为承运商报价。"
      description={row.title}
    />
  )
}
