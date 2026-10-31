'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { useCarriers } from '@/lib/crossborder/carrier-store'

export default function CarrierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const rows = useCarriers()
  const row = rows.find((item) => item.code === id)

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader backHref="/console/carriers" title="未找到承运商" description={`承运商编码 ${id} 不存在或已被删除。`} />
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">请返回列表重新选择。</p>
      </div>
    )
  }

  return <UedRecordDetail backHref="/console/carriers" moduleTitle="承运商" module="carriers" idKey="code" row={row as unknown as Record<string, unknown>} />
}
