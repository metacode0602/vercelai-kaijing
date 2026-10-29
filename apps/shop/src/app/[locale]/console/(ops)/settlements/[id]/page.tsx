'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_SETTLEMENTS } from '../page'

export default function SettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = DEMO_SETTLEMENTS.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/settlements" moduleTitle="平台结算对账" module="settlements" row={row as unknown as Record<string, unknown>} />
}
