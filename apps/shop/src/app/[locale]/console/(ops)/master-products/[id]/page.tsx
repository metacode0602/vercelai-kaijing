'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { ERP_DEMO_PRODUCTS } from '@/lib/crossborder/erp-ued-data'

export default function MasterProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = ERP_DEMO_PRODUCTS.find((item) => item.spu === id)
  if (!row) notFound()
  return (
    <UedRecordDetail
      backHref="/console/master-products"
      moduleTitle="商品 SPU / SKU"
      module="master-products"
      idKey="spu"
      titleKeys={['spu', 'name']}
      row={row as unknown as Record<string, unknown>}
    />
  )
}
