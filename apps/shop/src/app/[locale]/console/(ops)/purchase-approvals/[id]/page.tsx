'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_APPROVALS } from '../page'

export default function PurchaseApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = DEMO_APPROVALS.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/purchase-approvals" moduleTitle="采购审核" module="purchase-approvals" row={row as unknown as Record<string, unknown>} />
}
