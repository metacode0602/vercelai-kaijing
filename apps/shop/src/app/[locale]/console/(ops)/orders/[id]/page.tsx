import { notFound } from 'next/navigation'
import {
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
  EditableDetailFields,
  StatusTimeline,
} from '@/components/console/detail'
import { getOrderById } from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { labelField, labelStatus } from '@/lib/console/labels'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Button } from '@workspace/ui/components/button'

interface OrderDetailPageProps {
  params: Promise<{ id: string }>
}

function statusVariant(status: string) {
  if (status === 'paid' || status === 'ready_to_ship') return 'secondary' as const
  if (status === 'shipped' || status === 'delivered') return 'default' as const
  if (status === 'cancelled') return 'destructive' as const
  return 'outline' as const
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params
  const order = getOrderById(id)
  if (!order) notFound()

  return (
    <div className="space-y-4">
      <DetailPageHeader
        backHref="/console/orders"
        title={order.externalOrderId}
        description={`店铺 · ${order.shopName}`}
        badges={<Badge variant={statusVariant(order.status)}>{labelStatus(order.status)}</Badge>}
      />

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
          <EditableDetailFields
            title="订单信息"
            fields={[
              { key: 'id', label: labelField('id'), value: order.id, mono: true, readOnly: true, required: true },
              { key: 'externalOrderId', label: labelField('externalOrderId'), value: order.externalOrderId, mono: true },
              { key: 'shopId', label: labelField('shopId'), value: order.shopId, mono: true },
              { key: 'platform', label: labelField('platform'), value: order.platform },
              { key: 'status', label: labelField('status'), value: labelStatus(order.status) },
              { key: 'placedAt', label: labelField('placedAt'), value: order.placedAt },
              { key: 'paidAt', label: labelField('paidAt'), value: order.paidAt ?? '—' },
              { key: 'amount', label: labelField('currency / totalAmount'), value: `${order.totalAmount.toFixed(2)} ${order.currency}` },
              { key: 'buyerNameMask', label: labelField('raw.buyerNameMask'), value: order.buyerNameMask },
              { key: 'shipping', label: labelField('raw.shipping'), value: order.shippingSummary },
            ]}
          />

          <Alert>
            <AlertTitle>库存处理节点待确认</AlertTitle>
            <AlertDescription>平台订单的锁定、正式扣减及取消释放节点需结合平台状态由业务确认。当前详情为示例数据，不会触发真实库存操作。</AlertDescription>
          </Alert>

          <DetailSection title="映射与库存处理">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm"><p>订单行 Seller SKU → 内部 SKU 映射结果</p><p className="mt-1 text-muted-foreground">未映射或冲突时应阻止自动占库</p></div>
              <Button variant="outline" asChild><LocaleLink href="/console/mappings">检查 Seller SKU 映射</LocaleLink></Button>
            </div>
          </DetailSection>

          <DetailSection title="订单行" description="SKU / 数量 / 单价 / 平台 SKU">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>标题</TableHead>
                  <TableHead>平台 SKU</TableHead>
                  <TableHead>数量</TableHead>
                  <TableHead>单价</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <LocaleLink
                        href={`/console/products/${line.sku}`}
                        className="font-mono text-xs underline-offset-2 hover:underline"
                      >
                        {line.sku}
                      </LocaleLink>
                    </TableCell>
                    <TableCell className="font-medium">{line.title}</TableCell>
                    <TableCell className="font-mono text-xs">{line.platformSku}</TableCell>
                    <TableCell className="tabular-nums">{line.qty}</TableCell>
                    <TableCell className="tabular-nums">
                      {line.unitPrice.toFixed(2)} {order.currency}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DetailSection>
        </div>

        <div className="flex flex-col gap-4">
          <StatusTimeline title="平台状态时间线" steps={[...order.timeline]} />
          <DetailSection title="履约与包裹">
            <div className="flex flex-col gap-3 text-sm">
              <p>履约模式：{order.platform === 'lazada' && order.shopName.includes('MY') ? 'LGS（示例）' : order.platform === 'lazada' ? '站点配置（待确认）' : '平台物流（示例）'}</p>
              <p className="text-muted-foreground">运单号：{order.trackingNumber ?? '未生成'} · 包裹号：{order.packageId ?? '未生成'}</p>
              <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><LocaleLink href="/console/shipments">查看包裹与物流</LocaleLink></Button><Button variant="outline" asChild><LocaleLink href="/console/aftersales">查看 / 登记售后</LocaleLink></Button></div>
            </div>
          </DetailSection>
        </div>
      </div>
    </div>
  )
}
