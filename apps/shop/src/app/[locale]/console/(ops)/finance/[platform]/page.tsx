'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { trpc } from '@/lib/trpc/client'

export default function FinanceDetailPage({ params }: { params: Promise<{ platform: string }> }) {
  const platform = decodeRouteParam(React.use(params).platform)
  const query = trpc.finance.byPlatform.useQuery({ platform }, { retry: false })

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">加载财务…</p>
  }

  if (!query.data) {
    return (
      <div className="space-y-4">
        <DetailPageHeader
          backHref="/console/settlements"
          title="未找到平台财务"
          description={`平台 ${platform} 无店铺或订单数据。`}
        />
      </div>
    )
  }

  const row = query.data
  const flat = {
    platform: row.platform,
    platformKey: row.platformKey,
    shops: row.shopNames.join('、'),
    revenue: row.revenue,
    cost: row.cost,
    profit: row.profit,
    margin: row.margin,
    fees: row.fees,
    orderCount: row.orderCount,
    disabled: row.disabled ? '是' : '否',
    latestSettlement: row.settlements[0]?.id ?? '—',
    settlementPeriod: row.settlements[0]?.period ?? '—',
  }

  return (
    <UedRecordDetail
      backHref="/console/settlements"
      moduleTitle="财务总览"
      module="finance"
      idKey="platformKey"
      titleKeys={['platform']}
      row={flat as unknown as Record<string, unknown>}
      notice="按平台聚合订单营收与结算批次。平台结算 OpenAPI 仅 Lazop（Daraz/Lazada）可拉取；其他平台请用导入或等待适配器。左侧以结算/利润等子模块为准。"
      description={`${row.platform} · 营收 / 成本 / 结算粗览`}
    />
  )
}
