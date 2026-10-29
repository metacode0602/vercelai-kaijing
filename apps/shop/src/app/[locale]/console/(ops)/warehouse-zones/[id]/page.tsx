'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { useWarehouseZones } from '@/lib/crossborder/warehouse-zone-store'

export default function WarehouseZoneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const rows = useWarehouseZones()
  const row = rows.find((item) => item.id === id)

  if (!row) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <DetailPageHeader backHref="/console/warehouse-zones" title="未找到库区" description={`库区 ID ${id} 不存在或已被删除。`} />
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">请返回列表重新选择。</p>
      </div>
    )
  }

  return <UedRecordDetail backHref="/console/warehouse-zones" moduleTitle="库区" module="warehouse-zones" row={row as unknown as Record<string, unknown>} />
}
