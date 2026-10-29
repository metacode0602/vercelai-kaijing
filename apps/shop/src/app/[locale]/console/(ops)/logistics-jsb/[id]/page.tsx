'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_JSB } from '../page'

export default function LogisticsJsbDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = DEMO_JSB.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/logistics-jsb" moduleTitle="JSB 与 TH 物流" module="logistics-jsb" timelineKey="events" row={row as unknown as Record<string, unknown>} />
}
