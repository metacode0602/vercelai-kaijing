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
  aggregateOrderLines,
  confirmOrder,
  orderMappingStatus,
  refreshOrderFromPlatform,
  toRelatedOrderShape,
  useOrderState,
} from '@/lib/crossborder/order-store'
import { useShipments } from '@/lib/crossborder/shipment-store'
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
  const shipments = useShipments()
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
  const linkedShipments = shipments.filter(
    (item) =>
      item.order === order.externalOrderId ||
      item.orderId === order.id ||
      order.shipmentIds.includes(item.id),
  )
  const linkedPackages = packages.filter(
    (item) =>
      item.order === order.externalOrderId ||
      order.shipmentIds.includes(item.id) ||
      item.id === order.packageId,
  )
  const lineSummary = aggregateOrderLines(order.lines)
  const mappingStatus = orderMappingStatus(order)
  const canConfirm =
    mappingStatus !== 'exception' &&
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

  function onRefresh() {
    const result = refreshOrderFromPlatform(order!.id)
    setNotice(result.ok ? result.note : result.reason)
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
            <Badge variant={mappingStatus === 'exception' ? 'destructive' : 'outline'}>
              {mappingStatus === 'exception' ? '映射异常' : mappingStatus === 'pending' ? '映射待确认' : '映射正常'}
            </Badge>
            <Badge variant={order.integrationStatus === 'error' ? 'destructive' : 'outline'}>
              同步 {order.integrationStatus}
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
            <Button size="sm" variant="outline" onClick={onRefresh}>
              同步平台订单
            </Button>
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href="/console/picking">拣货打包</LocaleLink>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={`/console/shipments?order=${encodeURIComponent(order.externalOrderId)}`}>
                包裹与物流
              </LocaleLink>
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
          { label: '单位行 / SKU 聚合', value: `${order.lines.length} / ${lineSummary.length}` },
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
              { label: '订单号', value: order.orderNumber ?? '—', mono: true },
              { label: '店铺', value: order.shopName },
              { label: '外部店铺 ID', value: order.externalShopId, mono: true },
              { label: labelField('platform'), value: order.platform },
              { label: '平台状态', value: order.platformStatus },
              { label: '履约状态', value: labelStatus(order.fulfillmentStatus) },
              { label: '最近同步', value: order.lastSyncedAt ?? '—' },
              { label: '平台更新时间', value: order.platformUpdatedAt ?? '—' },
              { label: labelField('status'), value: labelStatus(order.status) },
              { label: labelField('placedAt'), value: order.placedAt },
              { label: labelField('paidAt'), value: order.paidAt ?? '—' },
              {
                label: '金额',
                value: `${order.totalAmount.toFixed(2)} ${order.currency}`,
              },
              { label: '优惠券', value: `${order.voucherAmount.toFixed(2)} ${order.currency}` },
              { label: '发货仓', value: order.warehouseCode ?? '—', mono: true },
              { label: '买家备注', value: order.buyerNote ?? '—' },
              { label: '取消中', value: order.isCancelPending ? '是' : '否' },
              { label: labelField('raw.buyerNameMask'), value: order.buyerNameMask },
              { label: '收货摘要', value: order.shippingSummary },
              { label: '物流商', value: order.shippingProvider ?? '—' },
              { label: '运单号', value: order.trackingNumber ?? '—' },
              {
                label: '包裹',
                mono: true,
                value:
                  order.shipmentIds.length > 0
                    ? order.shipmentIds.join(', ')
                    : order.packageId ?? '—',
              },
            ]}
          />

          {parentFields.length ? (
            <DetailFieldGrid title="关联主数据" fields={parentFields} />
          ) : null}

          <DetailSection title="SKU 聚合" description="平台单位行按 SKU 聚合；落库仍为 1 行 1 件">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>内部 SKU</TableHead>
                  <TableHead>Seller / Shop SKU</TableHead>
                  <TableHead>数量</TableHead>
                  <TableHead>实付</TableHead>
                  <TableHead>映射</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineSummary.map((line) => (
                  <TableRow key={`${line.sku}-${line.sellerSku}`}>
                    <TableCell className="font-mono text-xs">{line.sku}</TableCell>
                    <TableCell className="font-mono text-xs">{line.sellerSku} / {line.shopSku}</TableCell>
                    <TableCell className="tabular-nums">{line.quantity}</TableCell>
                    <TableCell className="tabular-nums">{line.paidPrice.toFixed(2)} {order.currency}</TableCell>
                    <TableCell>
                      <Badge variant={line.mappingStatus === 'exception' ? 'destructive' : 'outline'}>
                        {line.mappingStatus === 'exception' ? '异常' : line.mappingStatus === 'pending' ? '待确认' : '正常'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DetailSection>

          <DetailSection title="平台单位行" description="order_lines.id + external_line_id；每行 qty=1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>行 ID</TableHead>
                  <TableHead>平台行 ID</TableHead>
                  <TableHead>内部 SKU</TableHead>
                  <TableHead>平台 SKU</TableHead>
                  <TableHead>数量</TableHead>
                  <TableHead>实付 / 税 / 运费</TableHead>
                  <TableHead>履约</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="font-mono text-xs">{line.id}</TableCell>
                    <TableCell className="font-mono text-xs">{line.externalLineId}</TableCell>
                    <TableCell>
                      <LocaleLink
                        href={`/console/master-skus/${line.sku}`}
                        className="font-mono text-xs underline-offset-2 hover:underline"
                      >
                        {line.sku}
                      </LocaleLink>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{line.platformSkuId}</TableCell>
                    <TableCell className="tabular-nums">{line.qty}</TableCell>
                    <TableCell className="tabular-nums text-xs">
                      {line.paidPrice.toFixed(2)} / {line.taxAmount.toFixed(2)} / {line.shippingAmount.toFixed(2)}
                    </TableCell>
                    <TableCell>{labelStatus(line.fulfillmentStatus)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DetailSection>

          {linkedPackages.length > 0 || linkedShipments.length > 0 ? (
            <DetailSection title="关联包裹与履约" description="订单 → shipments / picking → 出库">
              <div className="flex flex-wrap gap-3 text-sm">
                {linkedPackages.map((item) => (
                  <span key={item.id} className="flex items-center gap-2">
                    <LocaleLink
                      href={`/console/picking/${encodeURIComponent(item.id)}`}
                      className="font-mono underline-offset-2 hover:underline"
                    >
                      {item.id}
                    </LocaleLink>
                    <Badge variant="outline">{item.status}</Badge>
                  </span>
                ))}
                {linkedShipments.map((item) => (
                  <LocaleLink
                    key={item.id}
                    href={`/console/shipments/${encodeURIComponent(item.id)}`}
                    className="font-mono underline-offset-2 hover:underline"
                  >
                    {item.id} · {item.externalPackageId}
                  </LocaleLink>
                ))}
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
              映射异常会阻断确认占库；LZ-2201 为演示订单，请先修复 Seller SKU 映射。确认占库与出库均走流水。
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  )
}
