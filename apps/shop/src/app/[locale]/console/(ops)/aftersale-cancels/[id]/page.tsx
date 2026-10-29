'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_CANCELS } from '../page'

export default function AftersaleCancelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = DEMO_CANCELS.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/aftersale-cancels" moduleTitle="取消与退款" module="aftersale-cancels" row={row as unknown as Record<string, unknown>} />
}
