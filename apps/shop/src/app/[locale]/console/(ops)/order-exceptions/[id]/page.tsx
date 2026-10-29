'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { initialRows } from '../page'

export default function OrderExceptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = initialRows.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/order-exceptions" moduleTitle="订单映射异常" module="order-exceptions" row={row as unknown as Record<string, unknown>} />
}
