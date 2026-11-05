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

export default function LogisticsJsbDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const query = trpc.logistics.getBatch.useQuery({ id })

  if (query.isLoading) {
    return <DetailPageHeader backHref="/console/logistics-jsb" title="加载 JSB 批次…" description="PostgreSQL" />
  }
  if (!query.data) {
    return <DetailPageHeader backHref="/console/logistics-jsb" title="未找到批次" description={id} />
  }
  const row = query.data
  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: 'JSB 与 TH 物流', href: '/console/logistics-jsb' }, { label: row.batchNo }]}
      />
      <DetailPageHeader
        backHref="/console/logistics-jsb"
        title={row.batchNo}
        description={`TH · ${row.carrier} · ${row.statusLabel}`}
        badges={<Badge variant="secondary">{row.statusLabel}</Badge>}
      />
      <DetailKpiRow
        items={[
          { label: '包裹数', value: String(row.packageCount) },
          { label: '出库', value: row.departedAt || row.createdAt || '—' },
          { label: 'JSB 交接', value: row.jsbHandover || row.handedOverAt || '—' },
          { label: '签收', value: row.signedAt || '—' },
        ]}
      />
      <DetailSection title="批次信息">
        <DetailFieldGrid
          fields={[
            { label: '渠道', value: row.channel },
            { label: '清关', value: row.customs || '—' },
            { label: '官方尾程', value: row.lastMile || '—' },
            { label: '费用', value: row.fee || '—' },
            { label: '发货仓', value: row.warehouseCode },
            { label: '运单摘要', value: row.trackingSummary || '—' },
          ]}
        />
      </DetailSection>
      <DetailSection title="包裹清单">
        {row.packages.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚未加入包裹</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {row.packages.map((p) => (
              <li key={p.shipmentId}>
                {p.externalPackageId} · {p.trackingNumber} · {p.order} · {p.statusLabel}
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
      <DetailSection title="链路事件">
        {row.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无事件</p>
        ) : (
          <StatusTimeline
            steps={row.events.map((e, i) => {
              const [status, ...rest] = e.split(' · ')
              return {
                at: rest[0] || '',
                status: status || e,
                note: rest.slice(1).join(' · '),
                current: i === row.events.length - 1,
              }
            })}
          />
        )}
      </DetailSection>
    </div>
  )
}
