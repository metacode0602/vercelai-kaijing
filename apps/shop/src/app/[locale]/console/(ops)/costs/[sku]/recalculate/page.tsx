'use client'

import * as React from 'react'
import { Calculator } from 'lucide-react'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { CostCalculatorWorkbench } from '@/components/console/cost-calculator-workbench'
import { Badge } from '@workspace/ui/components/badge'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { trpc } from '@/lib/trpc/client'

export default function CostRecalculatePage({ params }: { params: Promise<{ sku: string }> }) {
  const sku = decodeRouteParam(React.use(params).sku)
  const costQuery = trpc.finance.getSkuCostBySku.useQuery({ sku }, { retry: false })
  const seedQuery = trpc.dashboard.costCalcSeed.useQuery({ sku })
  const title = costQuery.data?.title ?? seedQuery.data?.title ?? sku
  return (
    <div className="space-y-4">
      <ConsoleBreadcrumbRegistration items={[
        { label: '成本', href: '/console/costs' },
        { label: sku, href: `/console/costs/${sku}` },
        { label: '重新测算' },
      ]} />
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Calculator className="size-5 text-primary" />
          <h2 className="text-xl font-semibold tracking-tight">重新测算 · {sku}</h2>
          <Badge variant="secondary">本地试算</Badge>
          <Badge variant="outline">可写回柜次成本</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">
          初始值优先 sku_costs（dashboard.costCalcSeed）。测算本身可本地试算；正式落库走柜次成本版本。
        </p>
      </div>
      <CostCalculatorWorkbench variant="page" initialSku={sku} />
    </div>
  )
}
