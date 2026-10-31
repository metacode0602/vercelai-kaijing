'use client'

import * as React from 'react'
import { Calculator } from 'lucide-react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { costLandedTotal, getCostBySku } from '@/lib/crossborder/mock-data'
import { resolveInternalSku } from '@/lib/crossborder/finance-related-data'
import { useSkuCostVersions } from '@/lib/crossborder/sku-cost-version-store'
import { LocaleLink } from '@/lib/i18n/navigation'
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

export default function CostDetailPage({ params }: { params: Promise<{ sku: string }> }) {
  const sku = decodeRouteParam(React.use(params).sku)
  const cost = getCostBySku(sku)
  const allVersions = useSkuCostVersions()
  const versions = React.useMemo(
    () => allVersions.filter((row) => row.sku === sku),
    [allVersions, sku],
  )

  if (!cost) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/costs"
          title="未找到成本记录"
          description={`SKU ${sku} 不存在于示例成本库。`}
        />
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          请返回列表重新选择。
        </p>
      </div>
    )
  }

  const landed = costLandedTotal(cost)
  const internalSku = resolveInternalSku(cost.sku)
  const row = {
    sku: cost.sku,
    title: cost.title,
    currency: cost.currency,
    suggestPrice: cost.suggestPrice,
    targetMarginPct: cost.targetMarginPct,
    purchase: cost.purchase,
    freight: cost.freight,
    customs: cost.customs,
    pal: cost.pal,
    cess: cost.cess,
    vat: cost.vat,
    sscl: cost.sscl,
    landed: Number(landed.toFixed(2)),
    internalSku: internalSku ?? '—',
    components: cost.components,
    shippingOptions: cost.shippingOptions,
  }

  return (
    <UedRecordDetail
      backHref="/console/costs"
      moduleTitle="成本计算"
      module="costs"
      idKey="sku"
      titleKeys={['sku', 'title']}
      row={row as unknown as Record<string, unknown>}
      notice="到仓成本、税率与头程方案均为演示数据；正式口径确认前不可用于采购决策。父链指向内部 SKU / SPU 主数据，费用构成与刊登/采购/运费分表展示。"
      description={cost.title}
      showPrimaryPricing={false}
      extra={
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-3">
          <Button size="sm" className="gap-1.5" asChild>
            <LocaleLink href={`/console/costs/${encodeURIComponent(cost.sku)}/recalculate`}>
              <Calculator className="size-3.5" />
              重新测算
            </LocaleLink>
          </Button>
          {internalSku ? (
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={`/console/master-skus/${encodeURIComponent(internalSku)}`}>
                查看内部 SKU
              </LocaleLink>
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            测算工作台可保存为柜次成本版本（F32 · localStorage）。
          </p>
          <div className="w-full space-y-2">
            <h3 className="text-sm font-medium">该 SKU 柜次成本版本</h3>
            {versions.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无版本 · 打开「重新测算」后选择柜次保存。</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>版本</TableHead>
                    <TableHead>柜次</TableHead>
                    <TableHead className="text-right">到仓/件</TableHead>
                    <TableHead>PAL</TableHead>
                    <TableHead>CESS</TableHead>
                    <TableHead>VAT</TableHead>
                    <TableHead>SSCL</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs">v{v.versionNo}</TableCell>
                      <TableCell className="text-xs">{v.lotCode}</TableCell>
                      <TableCell className="text-right tabular-nums">{v.landedUnitCost.toFixed(2)}</TableCell>
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
