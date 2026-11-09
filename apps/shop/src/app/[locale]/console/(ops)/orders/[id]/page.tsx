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
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
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
  if (status === 'paid' || status === 'ready_to_ship') return 'secondary' as const
  if (status === 'shipped' || status === 'delivered') return 'default' as const
  if (status === 'cancelled') return 'destructive' as const
  return 'outline' as const
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const router = useLocaleRouter()
  const utils = trpc.useUtils()
  const [notice, setNotice] = React.useState('')

  const orderQuery = trpc.order.get.useQuery({ id })
  const order = orderQuery.data

  const reserveMutation = trpc.order.confirmReserve.useMutation({
    onSuccess: async (row) => {
      await utils.order.get.invalidate({ id })
      await utils.order.list.invalidate()
      setNotice(`${row.externalOrderId} 已占库，写入 order_reserve 流水`)
    },
    onError: (e) => setNotice(e.message),
  })
  const createOutboundMutation = trpc.order.createOutbound.useMutation({
    onSuccess: async (ob) => {
      await utils.order.get.invalidate({ id })
      setNotice(`已创建出库单 ${ob.outboundNo}（${ob.packageId}）`)
      router.push(`/console/stock-outbounds/${encodeURIComponent(ob.id)}`)
    },
    onError: (e) => setNotice(e.message),
  })
  const releaseMutation = trpc.order.releaseReserve.useMutation({
    onSuccess: async () => {
      await utils.order.get.invalidate({ id })
      setNotice('已释放占库')
    },
    onError: (e) => setNotice(e.message),
  })

  if (orderQuery.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader backHref="/console/orders" title="加载订单…" description="正在从 PostgreSQL 读取…" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/orders"
          title="未找到订单"
          description={`订单 ${id} 不存在。可先在列表页执行「人工增量同步」。`}
        />
      </div>
    )
  }

  const mappingBlocked = order.mappingStatus === '映射异常'
  const canReserve =
    !mappingBlocked &&
    !order.reserved &&
    !['shipped', 'delivered', 'cancelled'].includes(order.status)
  const canCreateOutbound = order.reserved && order.shipmentCount === 0

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: '订单', href: '/console/orders' }, { label: order.externalOrderId }]}
      />
      <DetailPageHeader
        backHref="/console/orders"
        title={order.externalOrderId}
        description={`${order.shop} · ${order.platform} · 数据经 tRPC → PostgreSQL`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canReserve ? (
              <Button
                size="sm"
                disabled={reserveMutation.isPending}
                onClick={() => reserveMutation.mutate({ id: order.id })}
              >
                确认占库
              </Button>
            ) : null}
            {order.reserved && !['shipped', 'delivered'].includes(order.status) ? (
              <Button
                size="sm"
                variant="outline"
                disabled={releaseMutation.isPending}
                onClick={() => releaseMutation.mutate({ id: order.id })}
              >
                释放占库
              </Button>
            ) : null}
            {canCreateOutbound ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={createOutboundMutation.isPending}
                onClick={() => createOutboundMutation.mutate({ orderId: order.id })}
              >
                创建出库 / 拣货单
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href="/console/picking">拣货列表</LocaleLink>
            </Button>
          </div>
        }
      />

      <Alert>
        <AlertTitle>Q07 库存处理</AlertTitle>
        <AlertDescription>
          默认 paid/ready_to_ship 自动占库 + 人工补锁；正式扣减在出库过账（order_ship）。映射异常阻断占库。
          当前：{order.reserved ? '已锁库' : '未锁库'} · 映射 {order.mappingStatus}
        </AlertDescription>
      </Alert>

      <DetailKpiRow
        items={[
          { label: '状态', value: order.statusLabel },
          { label: '金额', value: `${order.totalAmount.toFixed(2)} ${order.currency}` },
          { label: '明细行', value: String(order.lines.length) },
          { label: '出库单数', value: String(order.shipmentCount) },
        ]}
      />

      <DetailSection title="订单头">
        <DetailFieldGrid
          fields={[
            { label: '平台订单号', value: order.externalOrderId },
            { label: '内部订单号', value: order.orderNumber },
            { label: '店铺', value: `${order.shop} (${order.externalShopId})` },
            { label: '平台', value: order.platform },
            { label: '平台状态', value: order.platformStatus || '—' },
            { label: '履约状态', value: order.fulfillmentStatus || '—' },
            { label: '支付方式', value: order.paymentMethod || '—' },
            { label: '买家地区', value: order.buyerRegion || '—' },
            { label: '下单时间', value: order.placedAt || '—' },
            { label: '付款时间', value: order.paidAt || '—' },
            { label: '最近同步', value: order.lastSyncedAt || '—' },
            { label: '仓库', value: order.warehouseCode },
            { label: '买家备注', value: order.buyerNote || '—' },
          ]}
        />
      </DetailSection>

      <DetailSection title="商品行">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Seller SKU</TableHead>
              <TableHead>内部 SKU</TableHead>
              <TableHead>标题</TableHead>
              <TableHead>数量</TableHead>
              <TableHead>单价</TableHead>
              <TableHead>库位</TableHead>
              <TableHead>映射</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="font-mono text-xs">{line.sellerSku}</TableCell>
                <TableCell className="font-mono text-xs">{line.sku}</TableCell>
                <TableCell>{line.title || '—'}</TableCell>
                <TableCell>{line.qty}</TableCell>
                <TableCell className="tabular-nums">{line.unitPrice.toFixed(2)}</TableCell>
                <TableCell>{line.bin}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      line.mappingStatus === '映射异常'
                        ? 'destructive'
                        : line.mappingStatus === '待确认'
                          ? 'outline'
                          : 'secondary'
                    }
                  >
                    {line.mappingStatus}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DetailSection>

      <DetailSection title="状态时间线">
        <div className="mb-2">
          <Badge variant={statusVariant(order.status)}>{order.statusLabel}</Badge>
        </div>
        <StatusTimeline steps={order.timeline} />
      </DetailSection>

      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </div>
  )
}
