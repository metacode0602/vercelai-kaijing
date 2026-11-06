'use client'

import * as React from 'react'
import { Button } from '@workspace/ui/components/button'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { trpc } from '@/lib/trpc/client'

export default function ReportsPage() {
  const mix = trpc.dashboard.platformMix.useQuery({ range: 30 })
  const rows = (mix.data ?? []).map((item) => ({
    dimension: item.platform,
    orders: item.orders,
    units: 0,
    sales: String(item.revenue),
    inventory: 0,
    inbound: 0,
    note: '来自 dashboard.platformMix（订单聚合）',
  }))

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>报表主路径</AlertTitle>
        <AlertDescription>
          平台销售占比来自 dashboard.platformMix；动销/滞销专题读 reports.*（orders+balances）。无假图表；汇率/费用分摊仍待确认。
        </AlertDescription>
      </Alert>
      <UedWorkspace
        title="报表中心"
        description="销售占比来自真实订单聚合；库存/在途等维度空着比造假好。"
        rows={rows}
        searchKeys={['dimension', 'sales', 'note']}
        searchPlaceholder="搜索平台"
        emptyText={mix.isLoading ? '加载中…' : '暂无订单聚合数据。'}
        columns={[
          { key: 'dimension', label: '维度' },
          { key: 'orders', label: '订单数' },
          { key: 'sales', label: '销售金额' },
          { key: 'note', label: '口径状态' },
        ]}
      >
        <UedPrototypeNotice>禁止固定示例销售额。动销/滞销已接库，缺数据空态。</UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" asChild>
            <LocaleLink href="/console/dashboard">经营总览</LocaleLink>
          </Button>
          <Button size="sm" variant="secondary" asChild>
            <LocaleLink href="/console/reports/sell-through">F20 动销率</LocaleLink>
          </Button>
          <Button size="sm" variant="secondary" asChild>
            <LocaleLink href="/console/reports/stock-risk">F21 滞销/断货</LocaleLink>
          </Button>
        </div>
      </UedWorkspace>
    </div>
  )
}
