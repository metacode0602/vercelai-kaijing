'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { ProductImageEditor } from '@/components/console/product-images'
import { trpc } from '@/lib/trpc/client'

export default function MasterSkuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const skuQuery = trpc.products.skuByCode.useQuery({ code: id })

  if (skuQuery.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/master-skus"
          title="加载 SKU…"
          description={`正在从数据库读取 ${id}…`}
        />
      </div>
    )
  }

  if (skuQuery.isError || !skuQuery.data) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/master-skus"
          title="未找到内部 SKU"
          description={skuQuery.error?.message ?? `SKU ${id} 不存在于当前组织。`}
        />
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          请返回列表重新选择，或从所属 SPU 详情添加规格行。
        </p>
      </div>
    )
  }

  const row = skuQuery.data

  return (
    <UedRecordDetail
      backHref="/console/master-skus"
      moduleTitle="内部 SKU"
      module="master-skus"
      row={row as unknown as Record<string, unknown>}
      notice="数据来自 product_variants。关联供应源 / 映射 / 库存等其它域仍可能为 stub。"
      extra={
        <ProductImageEditor
          imageKey={`sku:${row.sku}`}
          fallback={{ cover: row.coverImage, images: row.images ?? [] }}
          title="SKU 图片"
          description="图片编辑器暂仍用本机会话缓存；规格图可后续随 updateVariant 写入 attrs.images。"
        />
      }
    />
  )
}
