'use client'

import * as React from 'react'
import {
  ConsoleBreadcrumbs,
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailRelatedTables,
  DetailSection,
  StatusTimeline,
  parentsToFields,
} from '@/components/console/detail'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { buildUedRelatedInfo } from '@/lib/console/related-info'
import {
  advanceStockOutbound,
  cancelStockOutbound,
  postStockOutbound,
  toRelatedOutboundShape,
  useInventoryBalances,
  useStockOutbounds,
} from '@/lib/crossborder/wms-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
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
  const outbounds = useStockOutbounds()
  useInventoryBalances()
  const outbound = outbounds.find((item) => item.id === id || item.outboundNo === id)
  const [mounted, setMounted] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!outbound) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/stock-outbounds"
          title={mounted ? '未找到出库单' : '加载中…'}
          description={mounted ? `出库单 ${id} 不存在。` : '正在读取本机原型会话…'}
        />
      </div>
    )
  }

  const related = buildUedRelatedInfo(
    'stock-outbounds',
    toRelatedOutboundShape(outbound) as Record<string, unknown>,
  )
  const parentFields = parentsToFields(related.parents)
  const totalQty = outbound.lines.reduce((sum, line) => sum + line.quantity, 0)
  const canAdvance = outbound.status !== '已出库' && outbound.status !== '已取消'
  const canCancel = outbound.status === '待拣货' || outbound.status === '拣货中'
  const canPost = outbound.status === '已复核'

  const timeline = [
    { at: outbound.createdAt, status: '待拣货', note: '出库单创建', current: outbound.status === '待拣货' },
    {
      at: outbound.pickedAt || '—',
      status: '拣货中',
      note: '拣货作业',
      current: outbound.status === '拣货中',
    },
    {
      at: outbound.checkedAt || '—',
      status: '已复核',
      note: '复核通过',
      current: outbound.status === '已复核',
    },
    {
      at: outbound.shippedAt || '—',
      status: '已出库',
      note: outbound.idempotencyKey ? `过账 · ${outbound.idempotencyKey}` : '待过账',
      current: outbound.status === '已出库',
    },
  ]

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbs
        items={[
          { label: '出库单', href: '/console/stock-outbounds' },
          { label: outbound.outboundNo },
        ]}
      />
      <DetailPageHeader
        backHref="/console/stock-outbounds"
        title={outbound.outboundNo}
        description={`${outbound.outboundType} · ${outbound.order} · ${totalQty} 件`}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
            <Badge variant={statusVariant(outbound.status)}>{outbound.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canAdvance && !canPost ? (
              <Button
                size="sm"
                onClick={() => {
                  const result = advanceStockOutbound(outbound.id)
                  setNotice(result.ok ? `状态 → ${result.outbound.status}` : result.reason)
                }}
              >
                推进状态
              </Button>
            ) : null}
            {canPost ? (
              <Button
                size="sm"
                onClick={() => {
                  const result = postStockOutbound(outbound.id)
                  setNotice(
                    result.ok
                      ? `${result.outbound.outboundNo} 已出库过账`
                      : result.reason,
                  )
                }}
              >
                确认出库过账
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const result = cancelStockOutbound(outbound.id, '详情取消')
                  setNotice(result.ok ? '已取消' : result.reason)
                }}
              >
                取消出库单
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href="/console/inventory-ledger">库存流水</LocaleLink>
            </Button>
          </div>
        }
      />
      <Alert>
        <AlertTitle>出库过账写流水</AlertTitle>
        <AlertDescription>
          状态机：待拣货 → 拣货中 → 已复核 → 已出库。确认出库时按行扣减 on_hand / reserved，并写
          inventory_ledger（event_type=order_ship，幂等）。
        </AlertDescription>
      </Alert>
      <UedPrototypeNotice>
        {outbound.status === '已出库'
          ? `已过账；幂等键 ${outbound.idempotencyKey || '—'}。`
          : outbound.status === '已取消'
            ? '出库单已取消，不可再推进。'
            : '请按拣货 → 复核 → 出库顺序推进；可用不足时过账会被拦截。'}
      </UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '行数', value: String(outbound.lines.length) },
          { label: '总数量', value: String(totalQty) },
          { label: '仓库', value: outbound.warehouse },
          { label: '状态', value: outbound.status },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <DetailFieldGrid
          title="出库主信息"
          description="出库作业头：类型、订单、包裹、拣货人"
          fields={[
            { label: '出库单号', value: outbound.outboundNo, mono: true },
            ...parentFields,
            { label: '出库类型', value: outbound.outboundType },
            { label: '仓库', value: outbound.warehouse, mono: true },
            { label: '订单 / 来源', value: outbound.order, mono: true },
            { label: '包裹号', value: outbound.packageId, mono: true },
            { label: '拣货人', value: outbound.picker },
            { label: '原因', value: outbound.reason || '—' },
            { label: '备注', value: outbound.remark || '—' },
            { label: '创建时间', value: outbound.createdAt },
            { label: '出库时间', value: outbound.shippedAt || '—' },
          ]}
        />
        <StatusTimeline title="出库状态机" steps={timeline} />
      </div>
      <DetailSection title="出库明细" description="头→行：SKU / 库位 / 数量">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>行号</TableHead>
                <TableHead>内部 SKU</TableHead>
                <TableHead>库位</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outbound.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.lineNo}</TableCell>
                  <TableCell className="font-mono text-sm">
                    <LocaleLink
                      className="underline-offset-2 hover:underline"
                      href={`/console/master-skus/${encodeURIComponent(line.sku)}`}
                    >
                      {line.sku}
                    </LocaleLink>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    <LocaleLink
                      className="underline-offset-2 hover:underline"
                      href={`/console/warehouse/${encodeURIComponent(line.bin)}`}
                    >
                      {line.bin}
                    </LocaleLink>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{line.quantity}</TableCell>
                  <TableCell>{line.note || '—'}</TableCell>
                </TableRow>
              ))}
              {outbound.lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                    暂无明细行
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </DetailSection>
      <DetailRelatedTables sections={related.sections || []} />
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
