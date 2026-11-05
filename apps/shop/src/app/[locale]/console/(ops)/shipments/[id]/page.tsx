'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
  StatusTimeline,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const [notice, setNotice] = React.useState('')
  const query = trpc.logistics.get.useQuery({ id })
  const syncMutation = trpc.logistics.syncFromPlatform.useMutation({
    onSuccess: async (res) => {
      await utils.logistics.get.invalidate({ id })
      setNotice(res.note)
    },
    onError: (e) => setNotice(e.message),
  })

  if (query.isLoading) {
    return (
      <DetailPageHeader
        backHref="/console/shipments"
        title="加载包裹…"
        description="正在从 PostgreSQL 读取…"
      />
    )
  }
  if (!query.data) {
    return (
      <DetailPageHeader
        backHref="/console/shipments"
        title="未找到包裹"
        description={`包裹 ${id} 不存在。可先执行物流种子或从订单创建包裹。`}
      />
    )
  }
  const row = query.data
  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: '包裹与物流', href: '/console/shipments' }, { label: row.externalPackageId }]}
      />
      <DetailPageHeader
        backHref="/console/shipments"
        title={row.externalPackageId}
        description={`${row.shop} · ${row.mode} · ${row.statusLabel}`}
        actions={
          <Button size="sm" variant="outline" disabled={syncMutation.isPending} onClick={() => syncMutation.mutate({ id: row.id })}>
            {syncMutation.isPending ? '同步中…' : '同步平台轨迹（stub）'}
          </Button>
        }
      />
      <DetailKpiRow
        items={[
          { label: '运单号', value: row.tracking },
          { label: '件数', value: String(row.items) },
          { label: '轨迹数', value: String(row.events.length) },
          { label: '批次', value: row.batchIds.length ? String(row.batchIds.length) : '—' },
        ]}
      />
      <DetailSection title="基本信息">
        <DetailFieldGrid
          fields={[
            { label: '内部 ID', value: row.id },
            { label: '订单', value: `${row.order}（${row.orderId}）` },
            { label: '店铺 / 站点', value: `${row.shop} · ${row.site}` },
            { label: '平台', value: row.platform },
            { label: '物流类型', value: row.providerLabel },
            { label: '渠道码', value: row.providerCode },
            { label: '发货仓', value: row.warehouse },
            { label: '状态', value: row.statusLabel },
            { label: '平台状态', value: row.platformStatus || '—' },
            { label: '重量', value: row.weight },
            { label: 'SKU', value: row.skus },
            { label: '最近同步', value: row.lastSyncedAt || '—' },
          ]}
        />
      </DetailSection>
      <DetailSection title="时间节点">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">RTS {row.rtsAt || '—'}</Badge>
          <Badge variant="outline">出库 {row.shippedAt || '—'}</Badge>
          <Badge variant="outline">签收 {row.deliveredAt || '—'}</Badge>
        </div>
      </DetailSection>
      <DetailSection title="履约轨迹">
        {row.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无轨迹</p>
        ) : (
          <StatusTimeline
            steps={row.events.map((e, i) => ({
              at: e.eventTime,
              status: e.title,
              note: `${e.location} · ${e.sourceLabel}${e.description ? ` · ${e.description}` : ''}`,
              current: i === row.events.length - 1,
            }))}
          />
        )}
      </DetailSection>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
