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
import {
  approveCancel,
  toRelatedCancelShape,
  useAftersaleCancels,
} from '@/lib/crossborder/aftersale-store'
import { useInventoryBalances } from '@/lib/crossborder/wms-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function AftersaleCancelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const rows = useAftersaleCancels()
  useInventoryBalances()
  const row = rows.find((item) => item.id === id)
  const [mounted, setMounted] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/aftersale-cancels"
          title={mounted ? '未找到取消/退款单' : '加载中…'}
          description={mounted ? `单号 ${id} 不存在。` : '正在读取本机原型会话…'}
        />
      </div>
    )
  }

  const related = buildUedRelatedInfo('aftersale-cancels', toRelatedCancelShape(row))
  const parentFields = parentsToFields(related.parents)
  const canApprove = row.status === '待确认'

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: '取消与退款', href: '/console/aftersale-cancels' }, { label: row.id }]}
      />
      <DetailPageHeader
        backHref="/console/aftersale-cancels"
        title={row.id}
        description={`${row.type} · ${row.order} · ${row.shop}`}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
            <Badge variant={row.status === '已驳回' ? 'destructive' : 'secondary'}>{row.status}</Badge>
            <Badge variant="outline">{row.platformStatus}</Badge>
            <Badge variant={row.refundStatus === 'refunded' ? 'secondary' : 'outline'}>退款 {row.refundStatus}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canApprove ? (
              <Button
                size="sm"
                onClick={() => {
                  const result = approveCancel(row.id)
                  setNotice(result.ok ? result.note : result.reason)
                }}
              >
                审核通过
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={`/console/orders/${encodeURIComponent(row.order)}`}>原订单</LocaleLink>
            </Button>
          </div>
        }
      />
      <UedPrototypeNotice>
        {notice ||
          '取消订单审核通过后释放预留库存须经 WMS 流水；仅退款不改库存。'}
      </UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '退款', value: `${row.refund} ${row.currency}` },
          { label: '释放锁定', value: String(row.releaseReserved) },
          { label: '平台同步', value: row.platformSync },
          { label: '状态', value: row.status },
        ]}
      />
      <DetailFieldGrid
        title="取消/退款主信息"
        fields={[
          { label: '单号', value: row.id, mono: true },
          { label: '逆向单 ID', value: row.reverseOrderId, mono: true },
          { label: '平台逆向单号', value: row.externalReverseId, mono: true },
          ...parentFields,
          { label: '店铺', value: row.shop },
          { label: '原订单', value: row.order, mono: true },
          { label: 'SKU', value: row.sku, mono: true },
          { label: '仓库', value: row.warehouse, mono: true },
          { label: '库位', value: row.bin, mono: true },
          { label: '类型', value: row.type },
          { label: '原因码', value: row.reasonCode },
          { label: '原因', value: row.reason },
          { label: '平台状态', value: row.platformStatus },
          { label: '平台更新时间', value: row.platformUpdatedAt },
          { label: '退款单号', value: row.refundId, mono: true },
          { label: '退款状态', value: row.refundStatus },
          { label: '退款完成', value: row.refundedAt || '—' },
          { label: '释放时间', value: row.releasedAt || '—' },
          { label: '释放流水键', value: row.releaseLedgerId || '—', mono: true },
          { label: '备注', value: row.remark || '—' },
        ]}
      />
      <DetailRelatedTables sections={related.sections ?? []} />
    </div>
  )
}
