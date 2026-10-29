'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_SKUS } from '../page'

export default function MasterSkuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = DEMO_SKUS.find((item) => item.id === id)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/master-skus" moduleTitle="内部 SKU" module="master-skus" row={row as unknown as Record<string, unknown>} />
}
