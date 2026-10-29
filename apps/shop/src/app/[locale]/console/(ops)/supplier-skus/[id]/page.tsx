'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { useSupplierSkus } from '@/lib/crossborder/supplier-sku-store'

export default function SupplierSkuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const rows = useSupplierSkus()
  const row = rows.find((item) => item.id === id)

  if (!row) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <DetailPageHeader backHref="/console/supplier-skus" title="未找到供应商货号" description={`映射号 ${id} 不存在或已被删除。`} />
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          该映射可能只存在于其他浏览器会话；请返回列表重新选择。
        </p>
      </div>
    )
  }

  return <UedRecordDetail backHref="/console/supplier-skus" moduleTitle="供应商货号" module="supplier-skus" row={row as unknown as Record<string, unknown>} />
}
