'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { trpc } from '@/lib/trpc/client'

export default function SupplierSkuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const query = trpc.suppliers.getSku.useQuery({ id })
  const row = query.data

  if (query.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader backHref="/console/supplier-skus" title="加载中…" description="正在读取供应商货号…" />
      </div>
    )
  }

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/supplier-skus"
          title="未找到供应商货号"
          description={`映射 ${id} 不存在。`}
        />
      </div>
    )
  }

  return (
    <UedRecordDetail
      backHref="/console/supplier-skus"
      moduleTitle="供应商货号"
      module="supplier-skus"
      row={row as unknown as Record<string, unknown>}
    />
  )
}
