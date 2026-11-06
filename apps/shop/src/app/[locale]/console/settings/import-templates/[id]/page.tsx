'use client'

import * as React from 'react'
import { DetailFieldGrid, DetailPageHeader } from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'

export default function ImportTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const query = trpc.importTemplates.get.useQuery({ id })
  const row = query.data

  if (query.isLoading) {
    return <DetailPageHeader backHref="/console/settings/import-templates" title="加载中…" description="读取模板…" />
  }
  if (!row) {
    return (
      <DetailPageHeader
        backHref="/console/settings/import-templates"
        title="未找到模板"
        description={`模板 ${id} 不存在。`}
      />
    )
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: '导入模板', href: '/console/settings/import-templates' }, { label: row.kind }]}
      />
      <DetailPageHeader
        backHref="/console/settings/import-templates"
        title={row.kind}
        description={`${row.version} · ${row.status}`}
        badges={<Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>}
      />
      <UedPrototypeNotice>模板配置来自 commerce_import_templates；批处理执行仍待导入作业。</UedPrototypeNotice>
      <DetailFieldGrid
        title="模板详情"
        fields={[
          { label: 'ID', value: row.id, mono: true },
          { label: '类型', value: row.kind },
          { label: '版本', value: row.version },
          { label: '字段', value: row.fields || '—' },
          { label: '重复策略', value: row.duplicateStrategy || '—' },
          { label: '回滚策略', value: row.rollbackStrategy || '—' },
          { label: '备注', value: row.note || '—' },
          { label: '更新', value: row.updatedAt },
        ]}
      />
    </div>
  )
}
