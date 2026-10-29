'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { DEMO_SKUS } from '../page'
import { ProductImageEditor } from '@/components/console/product-images'

export default function MasterSkuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const row = DEMO_SKUS.find((item) => item.id === id)
  if (!row) notFound()
  return (
    <UedRecordDetail
      backHref="/console/master-skus"
      moduleTitle="内部 SKU"
      module="master-skus"
      row={row as unknown as Record<string, unknown>}
      extra={
        <ProductImageEditor
          imageKey={`sku:${row.sku}`}
          fallback={{ cover: row.coverImage, images: row.images ?? [] }}
          title="SKU 图片"
          description="维护该 SKU 的封面与细节截图；封面图会展示在 SKU 列表中。"
        />
      }
    />
  )
}
