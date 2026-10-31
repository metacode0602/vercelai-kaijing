'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { getProfits, sumFeeBreakdown } from '@/lib/crossborder/finance-store'

export default function ProfitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = getProfits().find((item) => item.id === id)
  if (!row) notFound()
  const view = {
    ...row,
    feePlatform: row.breakdown.platform,
    feeLogistics: row.breakdown.logistics,
    feeAds: row.breakdown.ads,
    feeJsb: row.breakdown.jsb,
    feeRefunds: row.breakdown.refunds,
    feeFx: row.breakdown.fx,
    feeTotal: sumFeeBreakdown(row.breakdown),
  }
  return (
    <UedRecordDetail
      backHref="/console/profits"
      moduleTitle="订单与 SKU 利润"
      module="profits"
      row={view as unknown as Record<string, unknown>}
    />
  )
}
