'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_LGS } from '../page'

export default function LogisticsLgsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = DEMO_LGS.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/logistics-lgs" moduleTitle="LGS 物流" module="logistics-lgs" timelineKey="events" row={row as unknown as Record<string, unknown>} />
}
