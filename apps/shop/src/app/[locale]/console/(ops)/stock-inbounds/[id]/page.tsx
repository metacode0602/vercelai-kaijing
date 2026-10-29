'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_INBOUNDS } from '../page'

export default function StockInboundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = DEMO_INBOUNDS.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/stock-inbounds" moduleTitle="入库单" module="stock-inbounds" row={row as unknown as Record<string, unknown>} />
}
