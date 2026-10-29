'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { ERP_DEMO_AFTERSALES } from '@/lib/crossborder/erp-ued-data'

export default function AftersaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = ERP_DEMO_AFTERSALES.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/aftersales" moduleTitle="售后管理" module="aftersales" row={row as unknown as Record<string, unknown>} />
}
