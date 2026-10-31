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
import { toRelatedTicketShape, useAftersaleTickets } from '@/lib/crossborder/aftersale-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function AftersaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const rows = useAftersaleTickets()
  const row = rows.find((item) => item.id === id)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/aftersales"
          title={mounted ? '未找到售后单' : '加载中…'}
          description={mounted ? `售后单 ${id} 不存在。` : '正在读取本机原型会话…'}
        />
      </div>
    )
  }

  const related = buildUedRelatedInfo('aftersales', toRelatedTicketShape(row))
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
            <Badge variant="outline">示例数据</Badge>
            <Badge variant={row.status === '待确认' ? 'outline' : 'secondary'}>{row.status}</Badge>
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
        只读售后总览。实物回库请在「退货收货与质检」完成；取消释放锁定见「取消与退款」。
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
          ...parentFields,
          { label: '店铺', value: row.shop },
          { label: '仓库', value: row.warehouse, mono: true },
          { label: '原订单', value: row.order, mono: true },
          { label: '内部 SKU', value: row.sku, mono: true },
          { label: '类型', value: row.type },
          { label: '原因', value: row.reason },
        ]}
      />
      <DetailRelatedTables sections={related.sections ?? []} />
    </div>
  )
}
