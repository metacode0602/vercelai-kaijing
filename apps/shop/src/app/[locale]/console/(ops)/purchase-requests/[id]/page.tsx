'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { ERP_DEMO_PURCHASES } from '@/lib/crossborder/erp-ued-data'

export default function PurchaseRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = ERP_DEMO_PURCHASES.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/purchase-requests" moduleTitle="采购申请" module="purchase-requests" row={row as unknown as Record<string, unknown>} />
}
