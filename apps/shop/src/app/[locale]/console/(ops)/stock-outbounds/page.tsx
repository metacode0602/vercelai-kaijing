'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedWorkspace } from '@/components/console/erp-ued-workspace'
import { useLocaleRouter, LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

function statusVariant(status: string) {
  if (status === '已出库') return 'secondary' as const
  if (status === '已取消') return 'destructive' as const
  return 'outline' as const
}

export default function StockOutboundsPage() {
  const utils = trpc.useUtils()
  const router = useLocaleRouter()
  const [notice, setNotice] = React.useState('')
  const listQuery = trpc.order.listOutbounds.useQuery({ page: 1, pageSize: 100 })
  const statsQuery = trpc.order.outboundStats.useQuery()
  const advanceMutation = trpc.order.advanceOutbound.useMutation({
    onSuccess: async (row) => {
      await utils.order.listOutbounds.invalidate()
      await utils.order.outboundStats.invalidate()
      setNotice(`${row.outboundNo} → ${row.status}`)
    },
    onError: (e) => setNotice(e.message),
  })
  const cancelMutation = trpc.order.cancelOutbound.useMutation({
    onSuccess: async (row) => {
      await utils.order.listOutbounds.invalidate()
      await utils.order.outboundStats.invalidate()
      setNotice(`${row.outboundNo} 已取消`)
    },
    onError: (e) => setNotice(e.message),
  })

  const rows = listQuery.data?.items ?? []
  const counts = statsQuery.data?.byStatus ?? {}
  const kpiItems = [
    { label: '出库单', value: String(statsQuery.data?.total ?? rows.length) },
    { label: '待拣货', value: String(counts['待拣货'] ?? 0) },
    {
      label: '作业中',
      value: String((counts['拣货中'] ?? 0) + (counts['已复核'] ?? 0)),
    },
    { label: '已出库', value: String(counts['已出库'] ?? 0) },
  ]

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>出库单已接 PostgreSQL</AlertTitle>
        <AlertDescription>
          订单出库由订单详情创建；推进至「已出库」过账写 order_ship 流水（幂等键 outbound:order:…）。
          手工非订单出库 / 盘亏等入口本迭代不做。主路径已停用 localStorage。
        </AlertDescription>
      </Alert>
      <DetailKpiRow items={kpiItems} />
      <UedWorkspace
        title="出库单"
        description="stock_outbounds · tRPC → dataaccess → Postgres"
        rows={rows}
        detailHref={(row) => `/console/stock-outbounds/${encodeURIComponent(row.id)}`}
        searchKeys={['outboundNo', 'externalOrderId', 'packageId', 'firstSku', 'status', 'picker']}
        searchPlaceholder="出库单号 / 订单 / 包裹 / SKU"
        filters={[{ label: '状态', options: ['待拣货', '拣货中', '已复核', '已出库', '已取消'] }]}
        emptyText={listQuery.isLoading ? '加载中…' : '暂无出库单。请从已占库订单创建。'}
        columns={[
          { key: 'outboundNo', label: '出库单号' },
          { key: 'outboundType', label: '类型' },
          {
            key: 'externalOrderId',
            label: '订单',
            render: (row) =>
              row.orderId ? (
                <LocaleLink
                  href={`/console/orders/${encodeURIComponent(row.orderId)}`}
                  className="underline-offset-2 hover:underline"
                >
                  {row.externalOrderId || '—'}
                </LocaleLink>
              ) : (
                row.externalOrderId || '—'
              ),
          },
          { key: 'packageId', label: '包裹' },
          { key: 'firstSku', label: '首行 SKU' },
          {
            key: 'totalQty',
            label: '数量',
            render: (row) => String(row.totalQty),
          },
          { key: 'warehouse', label: '仓库' },
          { key: 'picker', label: '拣货人' },
          {
            key: 'status',
            label: '状态',
            render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
          },
          {
            key: 'id',
            label: '操作',
            render: (row) => (
              <div className="flex gap-1">
                {row.status !== '已出库' && row.status !== '已取消' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.preventDefault()
                      advanceMutation.mutate({ id: row.id })
                    }}
                  >
                    推进
                  </Button>
                ) : null}
                {row.status === '待拣货' || row.status === '拣货中' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.preventDefault()
                      cancelMutation.mutate({ id: row.id, reason: '人工取消' })
                    }}
                  >
                    取消
                  </Button>
                ) : null}
              </div>
            ),
          },
        ]}
      />
      <div className="flex gap-2">
        <Button variant="outline" asChild>
          <LocaleLink href="/console/orders">订单</LocaleLink>
        </Button>
        <Button variant="outline" asChild>
          <LocaleLink href="/console/picking">拣货打包</LocaleLink>
        </Button>
        <Button variant="outline" onClick={() => router.push('/console/inventory-ledger')}>
          库存流水
        </Button>
      </div>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
