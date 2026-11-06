'use client'

import * as React from 'react'
import { Calculator } from 'lucide-react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@workspace/ui/components/table'
import { trpc } from '@/lib/trpc/client'

export default function CostDetailPage({ params }: { params: Promise<{ sku: string }> }) {
  const sku = decodeRouteParam(React.use(params).sku)
  const costQuery = trpc.finance.getSkuCostBySku.useQuery({ sku }, { retry: false })
  if (costQuery.isLoading) return <p className="text-sm text-muted-foreground">加载成本…</p>
  const data = costQuery.data
  if (!data || !data.latest) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader backHref="/console/costs" title="未找到成本记录" description={`SKU ${sku} 在 sku_costs 中无记录。`} />
        <Button size="sm" className="w-fit gap-1.5" asChild>
          <LocaleLink href={`/console/costs/${encodeURIComponent(sku)}/recalculate`}><Calculator className="size-3.5" />打开测算工作台</LocaleLink>
        </Button>
      </div>
    )
  }
  const cost = data.latest
  const landed = cost.landedUnitCost ?? cost.amount
  const row = {
    sku: data.sku, title: data.title, currency: cost.currency,
    suggestPrice: cost.suggestPrice ?? '—', targetMarginPct: cost.targetMarginPct ?? '—',
    purchase: cost.purchase, freight: cost.freight, customs: cost.customs,
    pal: cost.pal, cess: cost.cess, vat: cost.vat, sscl: cost.sscl,
    landed: Number(landed.toFixed(2)), containerLotId: cost.containerLotId,
    versionNo: cost.versionNo, kind: cost.kind,
  }
  return (
    <UedRecordDetail
      backHref="/console/costs" moduleTitle="成本计算" module="costs" idKey="sku" titleKeys={['sku', 'title']}
      row={row as unknown as Record<string, unknown>}
      notice="主记录来自 sku_costs。测算工作台可本地试算；税费/运价以费用模板与柜次字段为准。"
      description={data.title} showPrimaryPricing={false}
      extra={
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-3">
          <Button size="sm" className="gap-1.5" asChild>
            <LocaleLink href={`/console/costs/${encodeURIComponent(data.sku)}/recalculate`}><Calculator className="size-3.5" />重新测算</LocaleLink>
          </Button>
          <div className="w-full space-y-2">
            <h3 className="text-sm font-medium">该 SKU 成本版本（sku_costs）</h3>
            {data.versions.length === 0 ? <p className="text-xs text-muted-foreground">暂无版本</p> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>版本</TableHead><TableHead>类型</TableHead><TableHead>柜次</TableHead>
                  <TableHead className="text-right">金额</TableHead><TableHead className="text-right">到仓/件</TableHead>
                  <TableHead>PAL</TableHead><TableHead>CESS</TableHead><TableHead>VAT</TableHead><TableHead>SSCL</TableHead><TableHead>状态</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.versions.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs">v{v.versionNo}</TableCell>
                      <TableCell className="text-xs">{v.kind}</TableCell>
                      <TableCell className="text-xs">{v.containerLotId}</TableCell>
                      <TableCell className="text-right tabular-nums">{v.amount.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{v.landedUnitCost == null ? '—' : v.landedUnitCost.toFixed(2)}</TableCell>
                      <TableCell className="tabular-nums text-xs">{(v.taxBreakdown.pal ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="tabular-nums text-xs">{(v.taxBreakdown.cess ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="tabular-nums text-xs">{(v.taxBreakdown.vat ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="tabular-nums text-xs">{(v.taxBreakdown.sscl ?? 0).toFixed(2)}</TableCell>
                      <TableCell><Badge variant="secondary">{v.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      }
    />
  )
}
