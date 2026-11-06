'use client'

import * as React from 'react'
import { DetailFieldGrid, DetailPageHeader } from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'

export default function CarrierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const query = trpc.carriers.get.useQuery({ id })
  const row = query.data

  if (query.isLoading) {
    return <DetailPageHeader backHref="/console/carriers" title="加载中…" description="读取承运商…" />
  }
  if (!row) {
    return <DetailPageHeader backHref="/console/carriers" title="未找到承运商" description={`编码/ID ${id} 不存在。`} />
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration items={[{ label: '承运商', href: '/console/carriers' }, { label: row.code }]} />
      <DetailPageHeader
        backHref="/console/carriers"
        title={row.name}
        description={`${row.type} · ${row.coverage || '覆盖待补充'}`}
        badges={<Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>}
      />
      <UedPrototypeNotice>主档来自 commerce_carriers。实时运费报价 API 未接；运费页请看 fee_templates / ocean。</UedPrototypeNotice>
      <DetailFieldGrid
        title="承运商档案"
        fields={[
          { label: '编码', value: row.code, mono: true },
          { label: '名称', value: row.name },
          { label: '类型', value: row.type },
          { label: '覆盖线路', value: row.coverage || '—' },
          { label: '联系人', value: row.contact || '—' },
          { label: '电话', value: row.phone || '—' },
          { label: '备注', value: row.note || '—' },
          { label: '更新时间', value: row.updatedAt },
        ]}
      />
    </div>
  )
}
