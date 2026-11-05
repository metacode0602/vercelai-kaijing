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
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

function statusVariant(status: string) {
  if (status === '已出库') return 'secondary' as const
  if (status === '已取消') return 'destructive' as const
  return 'outline' as const
}

export default function StockOutboundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const [notice, setNotice] = React.useState('')
  const query = trpc.order.getOutbound.useQuery({ id })
  const advanceMutation = trpc.order.advanceOutbound.useMutation({
    onSuccess: async (row) => {
      await utils.order.getOutbound.invalidate({ id })
      setNotice(`${row.outboundNo} → ${row.status}`)
    },
    onError: (e) => setNotice(e.message),
  })
  const postMutation = trpc.order.postOutbound.useMutation({
    onSuccess: async (row) => {
      await utils.order.getOutbound.invalidate({ id })
      setNotice(`${row.outboundNo} 已过账，写入 order_ship 流水`)
    },
    onError: (e) => setNotice(e.message),
  })
  const cancelMutation = trpc.order.cancelOutbound.useMutation({
    onSuccess: async () => {
      await utils.order.getOutbound.invalidate({ id })
      setNotice('已取消')
    },
    onError: (e) => setNotice(e.message),
  })

  if (query.isLoading) {
    return (
      <DetailPageHeader backHref="/console/stock-outbounds" title="加载中…" description="读取出库单…" />
    )
  }
  const outbound = query.data
  if (!outbound) {
    return (
      <DetailPageHeader
        backHref="/console/stock-outbounds"
        title="未找到出库单"
        description={`出库单 ${id} 不存在。`}
      />
    )
  }

  const canAdvance = outbound.status !== '已出库' && outbound.status !== '已取消'
  const canCancel = outbound.status === '待拣货' || outbound.status === '拣货中'
  const canPost = outbound.status === '已复核'
  const timeline = [
    { at: outbound.createdAt, status: '待拣货', note: '出库单创建', current: outbound.status === '待拣货' },
    { at: outbound.pickedAt || '—', status: '拣货中', note: '拣货作业', current: outbound.status === '拣货中' },
    { at: outbound.reviewedAt || '—', status: '已复核', note: '复核通过', current: outbound.status === '已复核' },
    {
      at: outbound.postedAt || '—',
      status: '已出库',
      note: outbound.idempotencyKey ? `过账 · ${outbound.idempotencyKey}` : '待过账',
      current: outbound.status === '已出库',
    },
  ]

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '出库单', href: '/console/stock-outbounds' },
          { label: outbound.outboundNo },
        ]}
      />
      <DetailPageHeader
        backHref="/console/stock-outbounds"
        title={outbound.outboundNo}
        description={`${outbound.outboundType} · PostgreSQL`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canAdvance ? (
              <Button
                size="sm"
                disabled={advanceMutation.isPending}
                onClick={() => advanceMutation.mutate({ id: outbound.id })}
              >
                推进
              </Button>
            ) : null}
            {canPost ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={postMutation.isPending}
                onClick={() => postMutation.mutate({ id: outbound.id })}
              >
                出库过账
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                size="sm"
                variant="outline"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate({ id: outbound.id, reason: '人工取消' })}
              >
                取消
              </Button>
            ) : null}
          </div>
        }
      />
      <DetailKpiRow
        items={[
          { label: '状态', value: outbound.status },
          { label: '数量', value: String(outbound.totalQty) },
          { label: '仓库', value: outbound.warehouse },
          { label: '拣货人', value: outbound.picker || '—' },
        ]}
      />
      <DetailSection title="单据头">
        <DetailFieldGrid
          fields={[
            { label: '出库类型', value: outbound.outboundType },
            { label: '包裹', value: outbound.packageId || '—' },
            { label: '订单', value: outbound.externalOrderId || '—' },
            { label: '幂等键', value: outbound.idempotencyKey },
            { label: '原因', value: outbound.reason || '—' },
            { label: '备注', value: outbound.remark || '—' },
            { label: '创建时间', value: outbound.createdAt || '—' },
            { label: '过账时间', value: outbound.postedAt || '—' },
          ]}
        />
        {outbound.orderId ? (
          <Button variant="link" className="px-0" asChild>
            <LocaleLink href={`/console/orders/${encodeURIComponent(outbound.orderId)}`}>
              查看订单
            </LocaleLink>
          </Button>
        ) : null}
      </DetailSection>
      <DetailSection title="明细行">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>库位</TableHead>
              <TableHead>数量</TableHead>
              <TableHead>备注</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {outbound.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{line.lineNo}</TableCell>
                <TableCell className="font-mono text-xs">{line.sku}</TableCell>
                <TableCell>{line.bin}</TableCell>
                <TableCell>{line.qty}</TableCell>
                <TableCell>{line.note || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DetailSection>
      <DetailSection title="状态时间线">
        <Badge variant={statusVariant(outbound.status)}>{outbound.status}</Badge>
        <StatusTimeline steps={timeline} />
      </DetailSection>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
