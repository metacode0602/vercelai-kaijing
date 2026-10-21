import { notFound } from 'next/navigation'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
} from '@/components/console/detail'
import { costLandedTotal, getCostBySku } from '@/lib/crossborder/mock-data'
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

interface CostDetailPageProps {
  params: Promise<{ sku: string }>
}

export default async function CostDetailPage({ params }: CostDetailPageProps) {
  const { sku } = await params
  const cost = getCostBySku(sku)
  if (!cost) notFound()

  const landed = costLandedTotal(cost)
  const margin =
    cost.suggestPrice > 0
      ? (((cost.suggestPrice - landed) / cost.suggestPrice) * 100).toFixed(1)
      : '—'

  return (
    <div className="space-y-4">
      <DetailPageHeader
        backHref="/console/costs"
        title={`${cost.sku} · 到仓成本`}
        description={cost.title}
        badges={<Badge variant="outline">{cost.currency}</Badge>}
        actions={
          <LocaleLink
            href={`/console/products/${cost.sku}`}
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            查看商品
          </LocaleLink>
        }
      />

      <DetailKpiRow
        items={[
          { label: '到仓合计', value: `${landed.toFixed(2)} ${cost.currency}` },
          {
            label: '建议售价',
            value: `${cost.suggestPrice.toFixed(2)} ${cost.currency}`,
          },
          { label: '测算毛利率', value: `${margin}%`, hint: '示例' },
          { label: '目标毛利率', value: `${cost.targetMarginPct}%` },
        ]}
      />

      <DetailFieldGrid
        title="斯里兰卡税项结构（展示层）"
        columns={4}
        fields={[
          { label: 'purchase', value: cost.purchase.toFixed(2) },
          { label: 'freight', value: cost.freight.toFixed(2) },
          { label: 'customs', value: cost.customs.toFixed(2) },
          { label: 'PAL', value: cost.pal.toFixed(2) },
          { label: 'CESS', value: cost.cess.toFixed(2) },
          { label: 'VAT', value: cost.vat.toFixed(2) },
          { label: 'SSCL', value: cost.sscl.toFixed(2) },
          { label: 'landed', value: landed.toFixed(2) },
        ]}
      />

      <DetailSection
        title="cost_components（schema 对齐）"
        description="component ∈ purchase / freight / duty / other"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>component</TableHead>
              <TableHead>amount</TableHead>
              <TableHead>note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cost.components.map((c, idx) => (
              <TableRow key={`${c.component}-${c.note}-${idx}`}>
                <TableCell>
                  <Badge variant="outline">{c.component}</Badge>
                </TableCell>
                <TableCell className="tabular-nums">
                  {c.amount.toFixed(2)} {cost.currency}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.note}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DetailSection>

      <DetailSection title="海运方案对比（示例）">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>模式</TableHead>
              <TableHead>单价</TableHead>
              <TableHead>时效（天）</TableHead>
              <TableHead>备注</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cost.shippingOptions.map((opt) => (
              <TableRow key={opt.mode}>
                <TableCell className="font-medium">{opt.mode}</TableCell>
                <TableCell className="tabular-nums">
                  {opt.unitCost.toFixed(2)} {cost.currency}
                </TableCell>
                <TableCell className="tabular-nums">{opt.leadDays}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{opt.note}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DetailSection>
    </div>
  )
}
