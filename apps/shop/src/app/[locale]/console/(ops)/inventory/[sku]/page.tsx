import { notFound } from 'next/navigation'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
} from '@/components/console/detail'
import { getInventoryBySku } from '@/lib/crossborder/mock-data'
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

interface InventoryDetailPageProps {
  params: Promise<{ sku: string }>
}

export default async function InventoryDetailPage({ params }: InventoryDetailPageProps) {
  const { sku } = await params
  const item = getInventoryBySku(sku)
  if (!item) notFound()

  const totalOnHand = item.shopBalances.reduce((sum, b) => sum + b.onHand, 0)
  const totalReserved = item.shopBalances.reduce((sum, b) => sum + b.reserved, 0)
  const openAlerts = item.shopBalances.filter((b) => b.alertStatus === 'open').length

  return (
    <div className="space-y-4">
      <DetailPageHeader
        backHref="/console/inventory"
        title={`${item.sku} · 库存`}
        description={item.title}
        badges={
          <>
            <Badge
              variant={
                item.reorderSignal === 'critical_age'
                  ? 'destructive'
                  : item.reorderSignal === 'below_threshold'
                    ? 'secondary'
                    : 'outline'
              }
            >
              {item.reorderSignal}
            </Badge>
            <Badge variant="outline">库龄 {item.ageDays}d</Badge>
          </>
        }
        actions={
          <LocaleLink
            href={`/console/products/${item.sku}`}
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            查看商品
          </LocaleLink>
        }
      />

      <DetailKpiRow
        items={[
          { label: '多店在库合计', value: String(totalOnHand) },
          { label: '预留合计', value: String(totalReserved) },
          { label: '开放告警', value: String(openAlerts) },
          { label: '补货建议', value: item.suggestion },
        ]}
      />

      <DetailFieldGrid
        title="变体引用"
        fields={[
          { label: 'sku', value: item.sku, mono: true },
          { label: 'variantId', value: item.variantId, mono: true },
          { label: 'ageDays', value: `${item.ageDays} 天` },
          { label: 'reorderSignal', value: item.reorderSignal },
        ]}
      />

      <DetailSection
        title="inventory_balances / stock_alerts（多店）"
        description="on_hand · reserved · threshold · alert status"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>店铺</TableHead>
              <TableHead>在库</TableHead>
              <TableHead>预留</TableHead>
              <TableHead>可用</TableHead>
              <TableHead>阈值</TableHead>
              <TableHead>告警</TableHead>
              <TableHead>触发时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {item.shopBalances.map((bal) => (
              <TableRow key={bal.shopId}>
                <TableCell className="font-medium">{bal.shopName}</TableCell>
                <TableCell className="tabular-nums">{bal.onHand}</TableCell>
                <TableCell className="tabular-nums">{bal.reserved}</TableCell>
                <TableCell className="tabular-nums">{bal.available}</TableCell>
                <TableCell className="tabular-nums">{bal.threshold}</TableCell>
                <TableCell>
                  {bal.alertStatus ? (
                    <Badge variant="secondary">{bal.alertStatus}</Badge>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {bal.triggeredAt ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DetailSection>
    </div>
  )
}
