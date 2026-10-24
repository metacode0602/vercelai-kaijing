import { notFound } from 'next/navigation'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
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
          <DetailFieldGrid
            title="订单信息"
            fields={[
              { label: labelField('id'), value: order.id, mono: true },
              { label: labelField('externalOrderId'), value: order.externalOrderId, mono: true },
              { label: labelField('shopId'), value: order.shopId, mono: true },
              { label: labelField('platform'), value: order.platform },
              { label: labelField('status'), value: labelStatus(order.status) },
              { label: labelField('placedAt'), value: order.placedAt },
              { label: labelField('paidAt'), value: order.paidAt ?? '—' },
              { label: labelField('currency / totalAmount'), value: `${order.totalAmount.toFixed(2)} ${order.currency}` },
              { label: labelField('raw.buyerNameMask'), value: order.buyerNameMask },
              { label: labelField('raw.shipping'), value: order.shippingSummary },
            ]}
          />

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

        <StatusTimeline title="平台状态时间线" steps={[...order.timeline]} />
      </div>
    </div>
  )
}
