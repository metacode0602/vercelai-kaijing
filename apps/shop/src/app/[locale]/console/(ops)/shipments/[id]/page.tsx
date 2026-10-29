'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { initialShipments } from '../page'

export default function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = initialShipments.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/shipments" moduleTitle="包裹与物流" module="shipments" timelineKey="events" row={row as unknown as Record<string, unknown>} />
}
