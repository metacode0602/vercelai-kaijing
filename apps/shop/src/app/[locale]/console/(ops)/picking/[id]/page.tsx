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

export default function PickingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const [notice, setNotice] = React.useState('')
  const query = trpc.order.getOutbound.useQuery({ id })
  const advanceMutation = trpc.order.advanceOutbound.useMutation({
    onSuccess: async (row) => {
      await utils.order.getOutbound.invalidate({ id })
      setNotice(
        row.status === '已出库'
          ? `${row.outboundNo} 已过账写 order_ship`
          : `已推进至「${row.status}」`,
      )
    },
    onError: (e) => setNotice(e.message),
  })

  if (query.isLoading) {
    return (
      <DetailPageHeader backHref="/console/picking" title="加载中…" description="读取出库/拣货单…" />
    )
  }
  const row = query.data
  if (!row) {
    return (
      <DetailPageHeader
        backHref="/console/picking"
        title="未找到拣货单"
        description={`单据 ${id} 不存在。`}
      />
    )
  }

  const canAdvance = row.status !== '已出库' && row.status !== '已取消'
  const timeline = [
    { at: row.createdAt, status: '待拣货', note: '创建', current: row.status === '待拣货' },
    { at: row.pickedAt || '—', status: '拣货中', note: '拣货', current: row.status === '拣货中' },
    { at: row.reviewedAt || '—', status: '已复核', note: '复核', current: row.status === '已复核' },
    { at: row.postedAt || '—', status: '已出库', note: '过账', current: row.status === '已出库' },
  ]

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '拣货打包', href: '/console/picking' },
          { label: row.packageId || row.outboundNo },
        ]}
      />
      <DetailPageHeader
        backHref="/console/picking"
        title={row.packageId || row.outboundNo}
        description={`出库单 ${row.outboundNo} · ${row.outboundType}`}
        actions={
          <div className="flex gap-2">
            {canAdvance ? (
              <Button
                size="sm"
                disabled={advanceMutation.isPending}
                onClick={() => advanceMutation.mutate({ id: row.id })}
              >
                推进状态
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={`/console/stock-outbounds/${encodeURIComponent(row.id)}`}>
                出库单详情
              </LocaleLink>
            </Button>
          </div>
        }
      />
      <DetailKpiRow
        items={[
          { label: '状态', value: row.status },
          { label: '件数', value: String(row.totalQty) },
          { label: '仓库', value: row.warehouse },
          { label: '拣货人', value: row.picker || '—' },
        ]}
      />
      <DetailSection title="关联">
        <DetailFieldGrid
          fields={[
            { label: '订单', value: row.externalOrderId || '—' },
            { label: '幂等键', value: row.idempotencyKey },
            { label: '备注', value: row.remark || '—' },
          ]}
        />
        {row.orderId ? (
          <Button variant="link" className="px-0" asChild>
            <LocaleLink href={`/console/orders/${encodeURIComponent(row.orderId)}`}>
              查看订单
            </LocaleLink>
          </Button>
        ) : null}
      </DetailSection>
      <DetailSection title="明细">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>库位</TableHead>
              <TableHead>数量</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {row.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{line.lineNo}</TableCell>
                <TableCell className="font-mono text-xs">{line.sku}</TableCell>
                <TableCell>{line.bin}</TableCell>
                <TableCell>{line.qty}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DetailSection>
      <DetailSection title="状态">
        <Badge variant={row.status === '已出库' ? 'secondary' : 'outline'}>{row.status}</Badge>
        <StatusTimeline steps={timeline} />
      </DetailSection>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
