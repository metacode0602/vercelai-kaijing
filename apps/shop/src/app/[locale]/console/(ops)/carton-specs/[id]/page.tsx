'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { trpc } from '@/lib/trpc/client'

export default function CartonSpecDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const query = trpc.cartonSpecs.get.useQuery({ id })
  if (query.isLoading) return <p className="text-sm text-muted-foreground">加载箱规…</p>
  if (!query.data) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader backHref="/console/carton-specs" title="未找到箱规" description={`箱规 ${id} 不存在或已被删除。`} />
      </div>
    )
  }
  return (
    <UedRecordDetail
      backHref="/console/carton-specs"
      moduleTitle="箱规管理"
      module="carton-specs"
      row={query.data as unknown as Record<string, unknown>}
      notice="箱规为运输包装主数据（commerce_carton_specs）；不与拣货包裹或 ocean_shipment_boxes 混用。"
    />
  )
}
