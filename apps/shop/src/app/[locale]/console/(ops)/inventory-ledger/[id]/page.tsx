'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_LEDGER } from '../page'

export default function InventoryLedgerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = DEMO_LEDGER.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/inventory-ledger" moduleTitle="库存流水与调整" module="inventory-ledger" row={row as unknown as Record<string, unknown>} />
}
