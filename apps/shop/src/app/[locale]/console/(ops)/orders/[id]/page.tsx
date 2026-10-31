'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailRelatedTables,
  DetailSection,
  StatusTimeline,
  parentsToFields,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { buildUedRelatedInfo } from '@/lib/console/related-info'
import { labelField, labelStatus } from '@/lib/console/labels'
import {
  confirmOrder,
  toRelatedOrderShape,
  useOrderState,
} from '@/lib/crossborder/order-store'
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
  if (status === 'paid' || status === 'ready_to_ship') return 'secondary' as const
  if (status === 'shipped' || status === 'delivered') return 'default' as const
  if (status === 'cancelled') return 'destructive' as const
  return 'outline' as const
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const { orders, packages } = useOrderState()
  const order = orders.find((item) => item.id === id || item.externalOrderId === id)
  const [mounted, setMounted] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!order) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/orders"
          title={mounted ? '未找到订单' : '加载订单…'}
          description={
            mounted
              ? `订单 ${id} 不存在，或仅存在于其他浏览器会话。`
              : '正在读取本机原型会话中的订单…'
          }
        />
      </div>
    )
  }

  const related = buildUedRelatedInfo(
    'orders',
    toRelatedOrderShape(order) as Record<string, unknown>,
  )
  const parentFields = parentsToFields(related.parents)
  const linkedPackage = packages.find(
    (item) => item.id === order.packageId || item.order === order.externalOrderId,
  )
  const canConfirm =
    order.status !== 'shipped' &&
    order.status !== 'delivered' &&
    order.status !== 'cancelled' &&
    (order.status === 'created' || order.status === 'paid' || !order.reserved)

  function onConfirm() {
    const result = confirmOrder(order!.id)
    if (!result.ok) {
      setNotice(result.reason)
      return
    }
    setNotice(
      `${result.order.externalOrderId} 已确认占库 · ${labelStatus(result.order.status)} · 已写「订单锁定」流水`,
    )
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: '订单', href: '/console/orders' }, { label: order.externalOrderId }]}
      />
      <DetailPageHeader
        backHref="/console/orders"
        title={order.externalOrderId}
        description={`店铺 · ${order.shopName}`}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
            <Badge variant={statusVariant(order.status)}>{labelStatus(order.status)}</Badge>
            <Badge variant={order.reserved ? 'secondary' : 'outline'}>
              {order.reserved ? '已占库' : '未占库'}
            </Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canConfirm ? (
              <Button size="sm" onClick={onConfirm}>
                确认占库
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href="/console/picking">拣货打包</LocaleLink>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href="/console/order-exceptions">映射异常</LocaleLink>
            </Button>
          </div>
        }
      />

      <UedPrototypeNotice>
        订单确认经 wms-store「订单锁定」流水占库；拣货终态 createStockOutbound + postStockOutbound
        写「订单出库」流水。禁止直改余额。
      </UedPrototypeNotice>

      {notice ? (
        <Alert>
          <AlertTitle>操作结果</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <DetailKpiRow
        items={[
          {
            label: labelField('totalAmount'),
            value: `${order.totalAmount.toFixed(2)} ${order.currency}`,
          },
          {
            label: labelField('raw.shippingAmount'),
            value: `${order.shippingAmount.toFixed(2)} ${order.currency}`,
          },
          { label: '行项目', value: String(order.lines.length) },
          { label: labelField('raw.city'), value: order.city },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <DetailFieldGrid
            title="订单信息"
            fields={[
              { label: labelField('id'), value: order.id, mono: true },
              { label: labelField('externalOrderId'), value: order.externalOrderId, mono: true },
              { label: '店铺', value: order.shopName },
              { label: labelField('platform'), value: order.platform },
              { label: labelField('status'), value: labelStatus(order.status) },
              { label: labelField('placedAt'), value: order.placedAt },
              { label: labelField('paidAt'), value: order.paidAt ?? '—' },
              {
                label: '金额',
                value: `${order.totalAmount.toFixed(2)} ${order.currency}`,
              },
              { label: labelField('raw.buyerNameMask'), value: order.buyerNameMask },
              { label: '收货摘要', value: order.shippingSummary },
              { label: '物流商', value: order.shippingProvider ?? '—' },
              { label: '运单号', value: order.trackingNumber ?? '—' },
              {
                label: '包裹',
                mono: true,
                value: order.packageId ? (
                  <LocaleLink
                    href={`/console/picking/${encodeURIComponent(order.packageId)}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {order.packageId}
                  </LocaleLink>
                ) : (
                  '—'
                ),
              },
            ]}
          />

          {parentFields.length ? (
            <DetailFieldGrid title="关联主数据" fields={parentFields} />
          ) : null}

          <DetailSection title="订单行" description="内部 SKU / Seller SKU / 数量 / 库位">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>内部 SKU</TableHead>
                  <TableHead>标题</TableHead>
                  <TableHead>Seller SKU</TableHead>
                  <TableHead>数量</TableHead>
                  <TableHead>单价</TableHead>
                  <TableHead>库位</TableHead>
                  <TableHead>履约</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <LocaleLink
                        href={`/console/master-skus/${line.sku}`}
                        className="font-mono text-xs underline-offset-2 hover:underline"
                      >
                        {line.sku}
                      </LocaleLink>
                    </TableCell>
                    <TableCell className="font-medium">{line.title}</TableCell>
                    <TableCell className="font-mono text-xs">{line.sellerSku}</TableCell>
                    <TableCell className="tabular-nums">{line.qty}</TableCell>
                    <TableCell className="tabular-nums">
                      {line.unitPrice.toFixed(2)} {order.currency}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{line.bin}</TableCell>
                    <TableCell>{labelStatus(line.fulfillmentStatus)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DetailSection>

          {linkedPackage ? (
            <DetailSection title="关联拣货包裹" description="订单 → 拣货 → 出库">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <LocaleLink
                  href={`/console/picking/${encodeURIComponent(linkedPackage.id)}`}
                  className="font-mono underline-offset-2 hover:underline"
                >
                  {linkedPackage.id}
                </LocaleLink>
                <Badge variant="outline">{linkedPackage.status}</Badge>
                {linkedPackage.outboundId ? (
                  <LocaleLink
                    href={`/console/stock-outbounds/${encodeURIComponent(linkedPackage.outboundId)}`}
                    className="underline-offset-2 hover:underline"
                  >
                    出库单 {linkedPackage.outboundId}
                  </LocaleLink>
                ) : (
                  <span className="text-muted-foreground">尚未关联出库单</span>
                )}
              </div>
            </DetailSection>
          ) : null}

          <DetailRelatedTables sections={related.sections ?? []} />
        </div>

        <div className="space-y-4">
          <StatusTimeline
            title="履约时间线"
            steps={order.timeline.map((step) => ({
              at: step.at,
              status: labelStatus(step.status),
              note: step.note,
              current: step.current,
            }))}
          />
          <Alert>
            <AlertTitle>库存处理</AlertTitle>
            <AlertDescription>
              未映射或冲突时不应自动占库。当前种子订单 SKU 已对齐 WMS（HSY*）；确认占库与出库均走流水。
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  )
}
