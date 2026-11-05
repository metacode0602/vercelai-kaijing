'use client'

import * as React from 'react'
import { UedWorkspace } from '@/components/console/erp-ued-workspace'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

export default function PickingPage() {
  const utils = trpc.useUtils()
  const [notice, setNotice] = React.useState('')
  const listQuery = trpc.order.listOutbounds.useQuery({ page: 1, pageSize: 100 })
  const advanceMutation = trpc.order.advanceOutbound.useMutation({
    onSuccess: async (row) => {
      await utils.order.listOutbounds.invalidate()
      setNotice(
        row.status === '已出库'
          ? `${row.packageId || row.outboundNo} 已出库过账，写入 order_ship 流水`
          : `${row.packageId || row.outboundNo} 已推进至「${row.status}」`,
      )
    },
    onError: (e) => setNotice(e.message),
  })

  const rows = (listQuery.data?.items ?? []).map((ob) => ({
    id: ob.id,
    packageId: ob.packageId || ob.outboundNo,
    outboundNo: ob.outboundNo,
    order: ob.externalOrderId,
    orderId: ob.orderId,
    status: ob.status,
    picker: ob.picker || '—',
    warehouse: ob.warehouse,
    skus: ob.firstSku,
    items: ob.totalQty,
    createdAt: ob.createdAt,
  }))

  return (
    <>
      <Alert className="mb-4">
        <AlertTitle>拣货打包 = 出库单作业视图</AlertTitle>
        <AlertDescription>
          主路径已切 tRPC / PostgreSQL（stock_outbounds）。请先在订单详情「确认占库」后「创建出库 / 拣货单」。
          推进至「已出库」会过账扣减 on_hand / reserved。
        </AlertDescription>
      </Alert>
      <UedWorkspace
        title="拣货打包"
        description="出库单状态机：待拣货 → 拣货中 → 已复核 → 已出库（过账）。数据来自 PostgreSQL。"
        rows={rows}
        detailHref={(row) => `/console/picking/${encodeURIComponent(row.id)}`}
        searchKeys={['packageId', 'outboundNo', 'order', 'picker', 'skus', 'status']}
        searchPlaceholder="搜索包裹 / 出库单 / 订单"
        filters={[{ label: '状态', options: ['待拣货', '拣货中', '已复核', '已出库', '已取消'] }]}
        emptyText={
          listQuery.isLoading
            ? '加载中…'
            : '暂无拣货任务。请到订单详情创建出库单，或查看出库单列表。'
        }
        columns={[
          { key: 'packageId', label: '包裹 / 拣货单' },
          { key: 'outboundNo', label: '出库单号' },
          {
            key: 'order',
            label: '订单',
            render: (row) => (
              <LocaleLink
                href={`/console/orders/${encodeURIComponent(row.orderId || row.order)}`}
                className="underline-offset-2 hover:underline"
              >
                {row.order || '—'}
              </LocaleLink>
            ),
          },
          { key: 'skus', label: '首行 SKU' },
          {
            key: 'items',
            label: '件数',
            render: (row) => String(row.items),
          },
          { key: 'warehouse', label: '仓库' },
          { key: 'picker', label: '拣货人' },
          {
            key: 'status',
            label: '状态',
            render: (row) => (
              <Badge variant={row.status === '已出库' ? 'secondary' : row.status === '已取消' ? 'destructive' : 'outline'}>
                {row.status}
              </Badge>
            ),
          },
          {
            key: 'id',
            label: '操作',
            render: (row) =>
              row.status !== '已出库' && row.status !== '已取消' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={advanceMutation.isPending}
                  onClick={(e) => {
                    e.preventDefault()
                    advanceMutation.mutate({ id: row.id })
                  }}
                >
                  推进
                </Button>
              ) : (
                <LocaleLink
                  href={`/console/stock-outbounds/${encodeURIComponent(row.id)}`}
                  className="text-xs underline-offset-2 hover:underline"
                >
                  查看出库
                </LocaleLink>
              ),
          },
        ]}
      />
      <div className="mt-3 flex gap-2">
        <Button variant="outline" asChild>
          <LocaleLink href="/console/orders">返回订单</LocaleLink>
        </Button>
        <Button variant="outline" asChild>
          <LocaleLink href="/console/stock-outbounds">出库单列表</LocaleLink>
        </Button>
      </div>
      {notice ? (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </>
  )
}
