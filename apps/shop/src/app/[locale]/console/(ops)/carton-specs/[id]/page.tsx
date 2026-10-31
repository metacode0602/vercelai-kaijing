'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { useCartonSpecs } from '@/lib/crossborder/carton-spec-store'

export default function CartonSpecDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const rows = useCartonSpecs()
  const row = rows.find((item) => item.id === id)

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/carton-specs"
          title="未找到箱规"
          description={`箱规 ${id} 不存在或已被删除。`}
        />
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          请返回列表重新选择。
        </p>
      </div>
    )
  }

  return (
    <UedRecordDetail
      backHref="/console/carton-specs"
      moduleTitle="箱规管理"
      module="carton-specs"
      row={row as unknown as Record<string, unknown>}
      notice="箱规为运输包装主数据；关联运费测算与成本分表展示，不与拣货包裹混用。"
    />
  )
}
