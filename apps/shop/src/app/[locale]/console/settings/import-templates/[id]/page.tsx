'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { useImportTemplates } from '@/lib/crossborder/import-template-store'

export default function ImportTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const rows = useImportTemplates()
  const row = rows.find((item) => item.id === id)

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader backHref="/console/settings/import-templates" title="未找到导入模板" description={`模板 ID ${id} 不存在或已被删除。`} />
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">请返回列表重新选择。</p>
      </div>
    )
  }

  return <UedRecordDetail backHref="/console/settings/import-templates" moduleTitle="导入模板" module="import-templates" row={row as unknown as Record<string, unknown>} />
}
