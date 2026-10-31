'use client'

import * as React from 'react'
import { notFound } from 'next/navigation'
import { decodeRouteParam, UedRecordDetail } from '@/components/console/erp-ued-detail'
import { getFinanceByPlatform } from '@/lib/crossborder/mock-data'

export default function FinanceDetailPage({ params }: { params: Promise<{ platform: string }> }) {
  const platform = decodeRouteParam(React.use(params).platform)
  const row = getFinanceByPlatform(platform)
  if (!row) notFound()

  const flat = {
    platform: row.platform,
    platformKey: row.platformKey,
    revenue: row.revenue,
    cost: row.cost,
    profit: row.profit,
    margin: row.margin,
    fees: row.fees,
    disabled: row.disabled ? '是' : '否',
    settlement: row.settlement,
    shop: row.settlement?.shopName,
    settlementId: row.settlement?.id,
    period:
      row.settlement != null
        ? `${row.settlement.periodStart} → ${row.settlement.periodEnd}`
        : '—',
    currency: row.settlement?.currency ?? '—',
  }

  return (
    <UedRecordDetail
      backHref="/console/finance"
      moduleTitle="财务总览"
      module="finance"
      idKey="platformKey"
      titleKeys={['platform']}
      row={flat as unknown as Record<string, unknown>}
      notice="旧版财务总览详情已接入 UED 关联：店铺父链可点，结算明细行可进入订单。左侧菜单仍以结算/利润等子模块为准，本路由不新增到侧栏。"
      description={`${row.platform} · 营收 / 成本 / 结算粗览（示例）`}
    />
  )
}
