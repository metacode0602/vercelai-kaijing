'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { ProductImageEditor } from '@/components/console/product-images'
import {
  buildUedRelatedInfo,
  mapBalanceRows,
  mapMovementRows,
} from '@/lib/console/related-info'
import { trpc } from '@/lib/trpc/client'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Button } from '@workspace/ui/components/button'

export default function MasterSkuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const skuQuery = trpc.products.skuByCode.useQuery({ code: id })
  const balancesQuery = trpc.wms.listBalances.useQuery(
    { page: 1, pageSize: 50, sku: id },
    { enabled: !!id },
  )
  const movementsQuery = trpc.wms.listMovements.useQuery(
    { page: 1, pageSize: 30, sku: id },
    { enabled: !!id },
  )
  const listingsQuery = trpc.listings.list.useQuery(
    { page: 1, pageSize: 20, sku: id },
    { enabled: !!id },
  )
  const mappingsQuery = trpc.mappings.list.useQuery(
    { page: 1, pageSize: 20, internalSku: id },
    { enabled: !!id },
  )

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
  const updateVariantMutation = trpc.products.updateVariant.useMutation()
  const relatedInfo = buildUedRelatedInfo(
    'master-skus',
    row as unknown as Record<string, unknown>,
    {
      balances: mapBalanceRows(balancesQuery.data?.items ?? []),
      movements: mapMovementRows(movementsQuery.data?.items ?? []),
      listings: (listingsQuery.data?.items ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        sku: item.sku,
        shop: item.shop,
        platform: item.platform,
        status: item.status,
        sellPrice: item.priceAmount,
        currency: item.priceCurrency,
        href: `/console/listings/${encodeURIComponent(item.id)}`,
      })),
      mappings: (mappingsQuery.data?.items ?? []).map((item) => ({
        id: item.id,
        shop: item.shop,
        platform: item.platform,
        sellerSku: item.sellerSku,
        internalSku: item.internalSku,
        itemId: item.itemId,
        platformSkuId: item.platformSkuId,
        mappingStatus: item.mappingStatus,
        href: item.href,
      })),
    },
  )

  return (
    <UedRecordDetail
      backHref="/console/master-skus"
      moduleTitle="内部 SKU"
      module="master-skus"
      row={row as unknown as Record<string, unknown>}
      relatedInfo={relatedInfo}
      notice="主档来自 product_variants；库存余额 / 流水来自 wms；刊登 / 映射来自 listings & mappings tRPC。供应商货号仍未接库。"
      extra={
        <>
        <div className="mb-4">
          <Button asChild>
            <LocaleLink href={`/console/costs/calculator?sku=${encodeURIComponent(row.sku)}`}>定价建议 / 草稿历史</LocaleLink>
          </Button>
        </div>
        <ProductImageEditor
          initial={{ cover: row.coverImage, images: row.images ?? [] }}
          onChange={async (next) => {
            if (!row.spu) throw new Error('缺少所属 SPU，无法保存图片')
            await updateVariantMutation.mutateAsync({
              spu: row.spu,
              code: row.sku,
              coverImage: next.cover,
              images: next.images,
            })
          }}
          title="SKU 图片"
          description="封面与截图保存在对象存储，并随 updateVariant 写入变体 attrs。"
        />
        </>
      }
    />
  )
}
