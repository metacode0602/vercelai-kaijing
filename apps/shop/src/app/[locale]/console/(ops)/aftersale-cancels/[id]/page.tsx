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
import { toRelatedCancelShape } from '@/lib/crossborder/aftersale-related-shapes'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function AftersaleCancelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const query = trpc.aftersale.getCancel.useQuery({ id }, { retry: false })
  const row = query.data
  const [notice, setNotice] = React.useState('')

  const invalidateAll = async () =>
    Promise.all([
      utils.aftersale.getCancel.invalidate({ id }),
      utils.aftersale.listCancels.invalidate(),
      utils.aftersale.cancelStats.invalidate(),
    ])

  const releaseMutation = trpc.aftersale.releaseReserved.useMutation({
    onSuccess: async (res) => {
      await invalidateAll()
      setNotice(res.note)
    },
    onError: (e) => setNotice(e.message),
  })
  const agreeMutation = trpc.aftersale.decideRefund.useMutation({
    onSuccess: async (r) => {
      await invalidateAll()
      setNotice(`${r.id} 已同意退款`)
    },
    onError: (e) => setNotice(e.message),
  })
  const rejectMutation = trpc.aftersale.decideRefund.useMutation({
    onSuccess: async (r) => {
      await invalidateAll()
      setNotice(`${r.id} 已拒绝退款`)
    },
    onError: (e) => setNotice(e.message),
  })
  const toManualMutation = trpc.aftersale.cancelScheduledRefund.useMutation({
    onSuccess: async (r) => {
      await invalidateAll()
      setNotice(`${r.id} 已改为人工处理`)
    },
    onError: (e) => setNotice(e.message),
  })

  if (query.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/aftersale-cancels"
          title="加载中…"
          description="正在读取取消/退款单…"
        />
      </div>
    )
  }

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/aftersale-cancels"
          title="未找到取消/退款单"
          description={`单号 ${id} 不存在。`}
        />
      </div>
    )
  }

  const related = buildUedRelatedInfo('aftersale-cancels', toRelatedCancelShape(row as never))
  const parentFields = parentsToFields(related.parents)
  const canRelease = row.inventoryReleaseStatus === 'pending_manual' && row.type !== '仅退款'
  const canDecideRefund =
    row.refundDecision === 'pending_manual' || row.refundDecision === 'scheduled'

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
            <Badge variant="outline">PostgreSQL</Badge>
            <Badge variant={row.status === '已驳回' ? 'destructive' : 'secondary'}>{row.status}</Badge>
            <Badge variant="outline">{row.platformStatus}</Badge>
            <Badge variant={row.refundStatus === 'refunded' ? 'secondary' : 'outline'}>退款 {row.refundStatus}</Badge>
            <Badge variant="outline">{row.inventoryReleaseStatusLabel}</Badge>
            <Badge variant="outline">{row.refundDecisionLabel}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canRelease ? (
              <Button
                size="sm"
                disabled={releaseMutation.isPending}
                onClick={() => releaseMutation.mutate({ id: row.id })}
              >
                {releaseMutation.isPending ? '释放中…' : '释放占库'}
              </Button>
            ) : null}
            {canDecideRefund ? (
              <>
                <Button
                  size="sm"
                  disabled={agreeMutation.isPending}
                  onClick={() => agreeMutation.mutate({ id: row.id, action: 'agree' })}
                >
                  同意退款
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rejectMutation.isPending}
                  onClick={() => rejectMutation.mutate({ id: row.id, action: 'reject', reason: '人工拒绝' })}
                >
                  拒绝退款
                </Button>
              </>
            ) : null}
            {row.refundDecision === 'scheduled' ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={toManualMutation.isPending}
                onClick={() => toManualMutation.mutate({ id: row.id })}
              >
                改为人工
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
          '占库释放与退款分开执行：取消入库后按策略释放未发货占库；退款按等待天数处理，平台支持时自动同意。'}
      </UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '退款', value: `${row.refund} ${row.currency}` },
          { label: '释放锁定', value: String(row.releaseReserved) },
          { label: '占库释放', value: row.inventoryReleaseStatusLabel },
          { label: '退款决定', value: row.refundDecisionLabel },
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
          { label: '占库释放策略', value: row.inventoryReleaseMode },
          { label: '占库释放状态', value: row.inventoryReleaseStatusLabel },
          { label: '退款策略', value: row.refundMode },
          { label: '等待天数', value: String(row.refundWaitDays) },
          { label: '退款到期', value: row.refundDueAt || '—' },
          { label: '备注', value: row.remark || '—' },
        ]}
      />
      <DetailRelatedTables sections={related.sections ?? []} />
    </div>
  )
}
