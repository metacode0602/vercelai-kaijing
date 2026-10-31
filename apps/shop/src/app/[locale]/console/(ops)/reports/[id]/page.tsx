'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { baseRows } from '../page'

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = baseRows.find((item) => item.dimension === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/reports" moduleTitle="报表中心" module="reports" idKey="dimension" titleKeys={['dimension']} row={row as unknown as Record<string, unknown>} />
}
