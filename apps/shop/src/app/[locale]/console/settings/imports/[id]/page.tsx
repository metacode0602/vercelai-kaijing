'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

export default function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  return (
    <div className="space-y-4">
      <DetailPageHeader backHref="/console/settings/imports" title={`导入批次 ${id}`} description="待导入流水表。" />
      <Alert>
        <AlertTitle>暂无数据</AlertTitle>
        <AlertDescription>已移除演示导入详情。批次落库后可在此查看行级结果与回滚。</AlertDescription>
      </Alert>
    </div>
  )
}
