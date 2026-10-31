import { notFound } from 'next/navigation'
import { Calculator } from 'lucide-react'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { CostCalculatorWorkbench } from '@/components/console/cost-calculator-workbench'
import { getCostBySku } from '@/lib/crossborder/mock-data'
import { Badge } from '@workspace/ui/components/badge'

interface CostRecalculatePageProps {
  params: Promise<{ sku: string }>
}

export default async function CostRecalculatePage({ params }: CostRecalculatePageProps) {
  const { sku } = await params
  const cost = getCostBySku(sku)
  if (!cost) notFound()

  return (
    <div className="space-y-4">
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '成本', href: '/console/costs' },
          { label: cost.sku, href: `/console/costs/${cost.sku}` },
          { label: '重新测算' },
        ]}
      />

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Calculator className="size-5 text-primary" />
          <h2 className="text-xl font-semibold tracking-tight">
            重新测算 · {cost.sku}
          </h2>
          <Badge variant="secondary">示例</Badge>
          <Badge variant="outline">待复核</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{cost.title}</p>
        <p className="text-xs text-muted-foreground">页面计算使用示例费率/报价；输入可交互调整，但演示结果不会写入业务数据库。</p>
      </div>

      <CostCalculatorWorkbench variant="page" initialSku={cost.sku} />
    </div>
  )
}
