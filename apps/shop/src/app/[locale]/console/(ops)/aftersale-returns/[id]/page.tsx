'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_RETURNS } from '../page'

export default function AftersaleReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = DEMO_RETURNS.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/aftersale-returns" moduleTitle="退货收货与质检" module="aftersale-returns" row={row as unknown as Record<string, unknown>} />
}
