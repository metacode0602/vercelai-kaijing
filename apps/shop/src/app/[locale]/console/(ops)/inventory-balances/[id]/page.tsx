'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_BALANCES } from '../page'

export default function InventoryBalanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = DEMO_BALANCES.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/inventory-balances" moduleTitle="库存汇总" module="inventory-balances" row={row as unknown as Record<string, unknown>} />
}
