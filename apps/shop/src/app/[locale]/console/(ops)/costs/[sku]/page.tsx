import { notFound } from 'next/navigation'
import { Calculator } from 'lucide-react'
import {
  ConsoleBreadcrumbs,
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
} from '@/components/console/detail'
import { costLandedTotal, getCostBySku } from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Button } from '@workspace/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { labelField, labelStatus } from '@/lib/console/labels'

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
      <ConsoleBreadcrumbs
        items={[
          { label: '成本', href: '/console/costs' },
          { label: cost.sku },
        ]}
      />
      <DetailPageHeader
        backHref="/console/costs"
        title={`${cost.sku} · 成本测算（示例）`}
        description={cost.title}
        badges={<Badge variant="outline">{cost.currency}</Badge>}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" className="gap-1.5" asChild>
              <LocaleLink href={`/console/costs/${cost.sku}/recalculate`}>
                <Calculator className="size-3.5" />
                重新测算
              </LocaleLink>
            </Button>
            <LocaleLink
              href={`/console/products/${cost.sku}`}
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              查看商品
            </LocaleLink>
          </div>
        }
      />

      <Alert>
        <AlertTitle>UED 示例成本 · 非实际报价</AlertTitle>
        <AlertDescription>
          下面的到仓成本和方案对比只用于演示交互，费率、税率及费用包含范围尚未核实；不同方案目前不可直接比较或作为采购决定。
        </AlertDescription>
      </Alert>

      <DetailKpiRow
        items={[
          { label: '到仓成本（示例）', value: `${landed.toFixed(2)} ${cost.currency}`, hint: '来源与报价待核实' },
          {
            label: '建议售价（示例）',
            value: `${cost.suggestPrice.toFixed(2)} ${cost.currency}`,
          },
          { label: '毛利率（示例）', value: `${margin}%`, hint: '未扣平台费，不是经营净利率' },
          { label: '目标毛利率', value: `${cost.targetMarginPct}%` },
        ]}
      />

      <DetailFieldGrid
        title="斯里兰卡税项结构（展示层）"
        columns={4}
        fields={[
          { label: labelField('purchase'), value: cost.purchase.toFixed(2) },
          { label: labelField('freight'), value: cost.freight.toFixed(2) },
          { label: labelField('customs'), value: cost.customs.toFixed(2) },
          { label: labelField('PAL'), value: cost.pal.toFixed(2) },
          { label: labelField('CESS'), value: cost.cess.toFixed(2) },
          { label: labelField('VAT'), value: cost.vat.toFixed(2) },
          { label: labelField('SSCL'), value: cost.sscl.toFixed(2) },
          { label: labelField('landed'), value: landed.toFixed(2) },
        ]}
      />

      <DetailSection
        title="成本明细（示例）"
        description="采购 / 运费 / 关税 / 其他 · 尚未核实货代报价及实际税率"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>费用项</TableHead>
              <TableHead>金额</TableHead>
              <TableHead>备注</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cost.components.map((c, idx) => (
              <TableRow key={`${c.component}-${c.note}-${idx}`}>
                <TableCell>
                  <Badge variant="outline">{labelStatus(c.component)}</Badge>
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

      <DetailSection title="运输方案报价对比（示例）" description="方案费用范围未对齐，不能据此判断完整到仓成本最优">
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
            {[
              { mode: '空运 DDP', unitCost: 4.5, leadDays: 5, note: '示例·称含税；税费/清关/派送边界待核实' },
              ...cost.shippingOptions.filter((opt) => opt.mode !== 'Air').map((opt) => ({ mode: opt.mode, unitCost: opt.unitCost, leadDays: opt.leadDays, note: `${opt.note} · 示例，税费范围待核实` })),
              { mode: 'FCL 整柜', unitCost: 1.2, leadDays: 22, note: '示例分摊；整柜价/柜容/税费未核实' },
            ].map((opt) => (
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
