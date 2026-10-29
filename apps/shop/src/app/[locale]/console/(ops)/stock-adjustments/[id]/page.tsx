'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_ADJUSTMENTS } from '../page'

export default function StockAdjustmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = DEMO_ADJUSTMENTS.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/stock-adjustments" moduleTitle="盘点与调整" module="stock-adjustments" row={row as unknown as Record<string, unknown>} />
}
