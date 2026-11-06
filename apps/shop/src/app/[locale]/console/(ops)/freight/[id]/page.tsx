'use client'

import * as React from 'react'
import { DetailFieldGrid, DetailPageHeader } from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'

export default function FreightDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const detailQuery = trpc.finance.getFreight.useQuery({ id })

  if (detailQuery.isLoading) return <p className="text-sm text-muted-foreground">加载…</p>
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>未找到</AlertTitle>
        <AlertDescription>{detailQuery.error?.message ?? id}</AlertDescription>
      </Alert>
    )
  }
  const row = detailQuery.data
  return (
    <div className="space-y-4">
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '运费估算', href: '/console/freight' },
          { label: row.code },
        ]}
      />
      <DetailPageHeader backHref="/console/freight" backLabel="运费估算" title={row.code} description={row.name} />
      <UedPrototypeNotice>来源 {row.source}；非 DEMO_FREIGHT_ESTIMATES。</UedPrototypeNotice>
      <DetailFieldGrid
        fields={[
          { label: '编码', value: row.code, mono: true },
          { label: '名称', value: row.name },
          { label: '来源', value: row.source },
          { label: '平台', value: row.platform },
          { label: '国家/港', value: row.country },
          { label: '类型', value: row.type },
          { label: '池/航线', value: row.pool },
          { label: '版本', value: row.versionNo == null ? '—' : String(row.versionNo) },
          { label: '生效', value: row.effectiveFrom },
          {
            label: '金额',
            value: row.amount == null ? '—' : `${row.amount} ${row.currency}`,
          },
          { label: '备注', value: row.note || '—' },
          { label: '状态', value: <Badge variant="outline">{row.status}</Badge> },
        ]}
        columns={3}
      />
    </div>
  )
}
