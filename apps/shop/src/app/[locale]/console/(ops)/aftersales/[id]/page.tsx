'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailRelatedTables,
  parentsToFields,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { buildUedRelatedInfo } from '@/lib/console/related-info'
import { toRelatedTicketShape } from '@/lib/crossborder/aftersale-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function AftersaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const query = trpc.aftersale.get.useQuery({ id }, { retry: false })
  const row = query.data

  if (query.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader backHref="/console/aftersales" title="加载中…" description="正在读取售后单…" />
      </div>
    )
  }

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/aftersales"
          title="未找到售后单"
          description={`售后单 ${id} 不存在。`}
        />
      </div>
    )
  }

  const related = buildUedRelatedInfo('aftersales', toRelatedTicketShape(row as never))
  const parentFields = parentsToFields(related.parents)

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration items={[{ label: '售后管理', href: '/console/aftersales' }, { label: row.id }]} />
      <DetailPageHeader
        backHref="/console/aftersales"
        title={row.id}
        description={`${row.type} · ${row.order} · ${row.shop}`}
        badges={
          <>
            <Badge variant="outline">PostgreSQL</Badge>
            <Badge variant={row.status === '待确认' ? 'outline' : 'secondary'}>{row.status}</Badge>
            <Badge variant="outline">{row.platformStatus}</Badge>
            <Badge variant={row.refundStatus === 'refunded' ? 'secondary' : 'outline'}>退款 {row.refundStatus}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {row.returned > 0 ? (
              <Button size="sm" asChild>
                <LocaleLink href={`/console/aftersale-returns/${encodeURIComponent(row.id)}`}>
                  退货收货
                </LocaleLink>
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={`/console/orders/${encodeURIComponent(row.order)}`}>原订单</LocaleLink>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={`/console/master-skus/${encodeURIComponent(row.sku)}`}>SKU</LocaleLink>
            </Button>
          </div>
        }
      />
      <UedPrototypeNotice>
        已接 PostgreSQL。实物回库请在「退货收货与质检」完成；取消释放锁定见「取消与退款」。
      </UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '退款', value: `${row.refund} ${row.currency}` },
          { label: '退货数量', value: String(row.returned) },
          { label: '质检', value: row.qc },
          { label: '状态', value: row.status },
        ]}
      />
      <DetailFieldGrid
        title="售后主信息"
        fields={[
          { label: '售后单号', value: row.id, mono: true },
          { label: '逆向单 ID', value: row.reverseOrderId, mono: true },
          { label: '平台逆向单号', value: row.externalReverseId, mono: true },
          ...parentFields,
          { label: '店铺', value: row.shop },
          { label: '仓库', value: row.warehouse, mono: true },
          { label: '原订单', value: row.order, mono: true },
          { label: '内部 SKU', value: row.sku, mono: true },
          { label: '类型', value: row.type },
          { label: '原因', value: row.reason },
          { label: '平台状态', value: row.platformStatus },
          { label: '平台更新时间', value: row.platformUpdatedAt },
          { label: '退货包裹', value: row.returnShipmentId || '—', mono: true },
          { label: '寄回运单', value: row.returnTracking || '—', mono: true },
          { label: '质检结论', value: row.qcDecision },
          { label: '退款单号', value: row.refundId, mono: true },
          { label: '退款状态', value: row.refundStatus },
          { label: '退款完成', value: row.refundedAt || '—' },
          { label: '退款方式', value: row.refundMethod },
        ]}
      />
      <DetailRelatedTables sections={related.sections ?? []} />
    </div>
  )
}
