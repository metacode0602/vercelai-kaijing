'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { DetailSection } from '@/components/console/detail'
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
      extra={
        <DetailSection title="SKU 规格" description="SPU 下的实际交付规格与编码">
          <div className="grid gap-2">
            {row.variants.map((variant) => (
              <div key={variant.code} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <span className="font-mono">{variant.code}</span>
                <span>{variant.color} · {variant.size} · {variant.pack}</span>
                <span className="text-muted-foreground">{variant.weight} g · {variant.status}</span>
              </div>
            ))}
          </div>
        </DetailSection>
      }
    />
  )
}
