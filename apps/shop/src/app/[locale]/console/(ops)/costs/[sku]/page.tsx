'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { Calculator } from 'lucide-react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { costLandedTotal, getCostBySku } from '@/lib/crossborder/mock-data'
import { resolveInternalSku } from '@/lib/crossborder/finance-related-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Button } from '@workspace/ui/components/button'

export default function CostDetailPage({ params }: { params: Promise<{ sku: string }> }) {
  const sku = decodeRouteParam(React.use(params).sku)
  const cost = getCostBySku(sku)

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
            测算工作台仍可用；保存结果仅留在本机原型会话。
          </p>
        </div>
      }
    />
  )
}
