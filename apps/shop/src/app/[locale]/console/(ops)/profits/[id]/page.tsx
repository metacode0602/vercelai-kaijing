'use client'

import * as React from 'react'
import { DetailFieldGrid, DetailKpiRow, DetailPageHeader } from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function ProfitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const [view, setView] = React.useState<'order' | 'sku'>('order')
  const orderQuery = trpc.finance.listProfits.useQuery({ page: 1, pageSize: 100, view: 'order', q: id })
  const skuQuery = trpc.finance.listProfits.useQuery({ page: 1, pageSize: 100, view: 'sku', q: id })
  const row =
    orderQuery.data?.items.find((i) => i.id === id) ??
    skuQuery.data?.items.find((i) => i.id === id) ??
    null

  if (orderQuery.isLoading || skuQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">加载利润…</p>
  }
  if (!row) {
    return (
      <Alert variant="destructive">
        <AlertTitle>未找到</AlertTitle>
        <AlertDescription>无利润行 {id}。可从利润列表进入。</AlertDescription>
      </Alert>
    )
  }
  const b = row.breakdown
  return (
    <div className="space-y-4">
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '订单与 SKU 利润', href: '/console/profits' },
          { label: row.id },
        ]}
      />
      <DetailPageHeader
        backHref="/console/profits"
        backLabel="利润列表"
        title={row.id}
        description={`${row.dimension} · ${row.view === 'order' ? '订单' : 'SKU'} 维度`}
        actions={
          <Button size="sm" variant="outline" onClick={() => setView(row.view)}>
            {row.view}
          </Button>
        }
      />
      <UedPrototypeNotice>
        利润由订单金额 − sku_costs − 结算/物流费用计算；无结算显示「未结算」。费用不写死。
      </UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '收入', value: row.revenue.toLocaleString() },
          { label: '成本', value: row.cost.toLocaleString() },
          { label: '费用', value: row.fees.toLocaleString() },
          { label: '利润', value: row.profit.toLocaleString() },
          { label: '利润率', value: row.margin },
        ]}
      />
      <DetailFieldGrid
        fields={[
          { label: '单据/SKU', value: row.id, mono: true },
          { label: '维度', value: row.dimension },
          { label: '币种口径', value: row.fx },
          {
            label: '费用拆分',
            value: `平台 ${b.platform} / 物流 ${b.logistics} / 推广 ${b.ads} / JSB ${b.jsb} / 退款 ${b.refunds} / 汇兑 ${b.fx}`,
          },
          { label: '退款', value: String(row.refund) },
          { label: '状态', value: <Badge variant={row.status === '未结算' ? 'outline' : 'secondary'}>{row.status}</Badge> },
        ]}
        columns={3}
      />
    </div>
  )
}
