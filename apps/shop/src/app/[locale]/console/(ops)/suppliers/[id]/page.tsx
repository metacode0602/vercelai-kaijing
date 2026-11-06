'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { trpc } from '@/lib/trpc/client'

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const query = trpc.suppliers.get.useQuery({ id })
  const row = query.data

  if (query.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader backHref="/console/suppliers" title="加载中…" description="正在读取供应商…" />
      </div>
    )
  }

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader backHref="/console/suppliers" title="未找到供应商" description={`编码 ${id} 不存在。`} />
      </div>
    )
  }

  return (
    <UedRecordDetail
      backHref="/console/suppliers"
      moduleTitle="供应商管理"
      module="suppliers"
      idKey="code"
      titleKeys={['code', 'name']}
      row={row as unknown as Record<string, unknown>}
    />
  )
}
