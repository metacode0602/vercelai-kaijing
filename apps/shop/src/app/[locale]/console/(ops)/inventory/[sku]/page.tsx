import { notFound } from 'next/navigation'
import {
  ConsoleBreadcrumbs,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
  EditableDetailFields,
} from '@/components/console/detail'
import { getInventoryBySku } from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
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
import { Button } from '@workspace/ui/components/button'

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
      <ConsoleBreadcrumbs
        items={[{ label: '库存', href: '/console/inventory' }, { label: item.sku }]}
      />
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
              {labelStatus(item.reorderSignal)}
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

      <Alert>
        <AlertTitle>UED 示例库存 · 非实时仓存</AlertTitle>
        <AlertDescription>
          多店余额、库龄与补货建议均为演示数据，不能作为实际出库或采购依据。
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild><LocaleLink href="/console/inventory-ledger">查看库存流水</LocaleLink></Button>
        <Button variant="outline" asChild><LocaleLink href="/console/warehouse">查看仓库与库位</LocaleLink></Button>
        <Button variant="outline" asChild><LocaleLink href="/console/costs">查看成本参考</LocaleLink></Button>
      </div>

      <DetailKpiRow
        items={[
          { label: '多店在库合计', value: String(totalOnHand) },
          { label: '预留合计', value: String(totalReserved) },
          { label: '开放告警', value: String(openAlerts) },
          { label: '补货建议', value: item.suggestion },
        ]}
      />

      <EditableDetailFields
        title="变体引用"
        fields={[
          { key: 'sku', label: labelField('sku'), value: item.sku, mono: true, readOnly: true, required: true },
          { key: 'variantId', label: labelField('variantId'), value: item.variantId, mono: true },
          { key: 'ageDays', label: labelField('ageDays'), value: `${item.ageDays} 天`, type: 'number' },
          { key: 'reorderSignal', label: labelField('reorderSignal'), value: labelStatus(item.reorderSignal) },
        ]}
      />

      <DetailSection
        title="多店库存与告警"
        description="在库 · 预留 · 阈值 · 告警状态"
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
                    <Badge variant="secondary">{labelStatus(bal.alertStatus)}</Badge>
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
