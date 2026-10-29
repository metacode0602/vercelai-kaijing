'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_RECEIPTS } from '../page'

export default function PurchaseReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = DEMO_RECEIPTS.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/purchase-receipts" moduleTitle="到货质检入库" module="purchase-receipts" row={row as unknown as Record<string, unknown>} />
}
