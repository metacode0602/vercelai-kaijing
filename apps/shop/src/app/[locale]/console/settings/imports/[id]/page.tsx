'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { ERP_DEMO_IMPORTS } from '@/lib/crossborder/erp-ued-data'

export default function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = ERP_DEMO_IMPORTS.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/settings/imports" moduleTitle="导入中心" module="imports" row={row as unknown as Record<string, unknown>} />
}
