'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_PICKS } from '../page'

export default function PickingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = DEMO_PICKS.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/picking" moduleTitle="拣货打包发货" module="picking" row={row as unknown as Record<string, unknown>} />
}
