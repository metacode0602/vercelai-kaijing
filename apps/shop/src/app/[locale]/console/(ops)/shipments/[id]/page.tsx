'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { toShipmentDetailRow, useShipments } from '@/lib/crossborder/shipment-store'

export default function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const shipments = useShipments()
  const shipment = shipments.find((item) => item.id === id || item.externalPackageId === id)
  if (!shipment) notFound()
  return (
    <UedRecordDetail
      backHref="/console/shipments"
      moduleTitle="包裹与物流"
      module="shipments"
      timelineKey="events"
      row={toShipmentDetailRow(shipment)}
    />
  )
}
