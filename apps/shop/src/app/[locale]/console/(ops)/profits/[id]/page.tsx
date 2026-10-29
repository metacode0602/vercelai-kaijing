'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_ORDER_PROFITS, DEMO_SKU_PROFITS } from '../page'

export default function ProfitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = [...DEMO_ORDER_PROFITS, ...DEMO_SKU_PROFITS].find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/profits" moduleTitle="订单与 SKU 利润" module="profits" row={row as unknown as Record<string, unknown>} />
}
