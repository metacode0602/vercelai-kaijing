'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { ERP_DEMO_MAPPINGS } from '@/lib/crossborder/erp-ued-data'

export default function MappingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const [shop, sellerSku] = id.split('::')
  const row = ERP_DEMO_MAPPINGS.find((item) => item.shop === shop && item.sellerSku === sellerSku)
  if (!row) notFound()
  return <UedRecordDetail backHref="/console/mappings" moduleTitle="Seller SKU 映射" module="mappings" idKey="sellerSku" titleKeys={['sellerSku', 'itemId']} row={row as unknown as Record<string, unknown>} />
}
