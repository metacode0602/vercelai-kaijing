'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_OUTBOUNDS } from '../page'

export default function StockOutboundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = DEMO_OUTBOUNDS.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/stock-outbounds" moduleTitle="出库单" module="stock-outbounds" row={row as unknown as Record<string, unknown>} />
}
