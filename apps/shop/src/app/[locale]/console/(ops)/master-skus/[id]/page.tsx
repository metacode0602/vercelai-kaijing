'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { ProductImageEditor } from '@/components/console/product-images'
import { findSkuRow, useProducts } from '@/lib/crossborder/product-store'

export default function MasterSkuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const products = useProducts()
  const row = findSkuRow(id, products)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/master-skus"
          title={mounted ? '未找到内部 SKU' : '加载 SKU…'}
          description={
            mounted
              ? `SKU ${id} 不存在，或仅存在于其他浏览器会话。`
              : '正在读取本机原型会话中的 SKU…'
          }
        />
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          请返回列表重新选择，或从所属 SPU 详情添加规格行。
        </p>
      </div>
    )
  }

  return (
    <UedRecordDetail
      backHref="/console/master-skus"
      moduleTitle="内部 SKU"
      module="master-skus"
      row={row as unknown as Record<string, unknown>}
      notice="关联父 SPU、供应源、映射、库存与主定价会自动带出，便于运营决策。"
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
