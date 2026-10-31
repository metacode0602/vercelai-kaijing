'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { sumFeeBreakdown, useProfits } from '@/lib/crossborder/finance-store'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function ProfitsPage() {
  const all = useProfits()
  const [view, setView] = React.useState<'order' | 'sku'>('order')
  const [notice, setNotice] = React.useState('')
  const rows = all.filter((row) => row.view === view)
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0)
  const profit = rows.reduce((sum, row) => sum + row.profit, 0)
  const fees = rows.reduce((sum, row) => sum + row.fees, 0)

  return (
    <UedWorkspace
      title="订单与 SKU 利润"
      description="费用归集与汇率折算后的利润视图：订单维度看单笔、SKU 维度看商品结构；费用拆分来自财务会话。"
      rows={rows}
      detailHref={(row) => `/console/profits/${encodeURIComponent(row.id)}`}
      searchKeys={['id', 'dimension', 'status']}
      searchPlaceholder="搜索订单号、SKU 或维度"
      columns={[
        { key: 'id', label: '单据 / SKU' },
        { key: 'dimension', label: '维度' },
        {
          key: 'revenue',
          label: '收入',
          render: (row) => <span className="tabular-nums">{row.revenue.toLocaleString()}</span>,
        },
        {
          key: 'cost',
          label: '商品成本',
          render: (row) => <span className="tabular-nums">{row.cost.toLocaleString()}</span>,
        },
        {
          key: 'fees',
          label: '费用合计',
          render: (row) => <span className="tabular-nums">{row.fees.toLocaleString()}</span>,
        },
        {
          key: 'breakdown',
          label: '费用拆分',
          render: (row) => (
            <span className="text-xs text-muted-foreground" title={`平台/物流/推广/JSB/退款/汇兑 = ${sumFeeBreakdown(row.breakdown)}`}>
              P{row.breakdown.platform}/L{row.breakdown.logistics}/A{row.breakdown.ads}/J{row.breakdown.jsb}/R
              {row.breakdown.refunds}/FX{row.breakdown.fx}
            </span>
          ),
        },
        {
          key: 'refund',
          label: '退款',
          render: (row) => <span className="tabular-nums">{row.refund.toLocaleString()}</span>,
        },
        {
          key: 'profit',
          label: '利润',
          render: (row) => <span className="font-medium tabular-nums">{row.profit.toLocaleString()}</span>,
        },
        { key: 'margin', label: '利润率' },
        { key: 'fx', label: '汇率口径' },
        {
          key: 'status',
          label: '状态',
          render: (row) => <Badge variant="secondary">{row.status}</Badge>,
        },
      ]}
    >
      <UedPrototypeNotice>
        利润与费用拆分来自本地财务会话（无 tRPC / DB）。订单与 SKU 维度需同口径；快照一经核算不被后续汇率覆盖。
      </UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '收入合计（当前视图原币）', value: revenue.toLocaleString() },
          { label: '费用合计', value: fees.toLocaleString() },
          { label: '利润合计', value: profit.toLocaleString() },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={view === 'order' ? 'secondary' : 'outline'} size="sm" onClick={() => setView('order')}>
          订单维度
        </Button>
        <Button variant={view === 'sku' ? 'secondary' : 'outline'} size="sm" onClick={() => setView('sku')}>
          SKU 维度
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const sample = rows[0]
            if (!sample) {
              setNotice('当前视图无数据。')
              return
            }
            const b = sample.breakdown
            setNotice(
              `下钻 ${sample.id}：平台 ${b.platform} / 物流 ${b.logistics} / 推广 ${b.ads} / JSB ${b.jsb} / 退款 ${b.refunds} / 汇兑 ${b.fx}`,
            )
          }}
        >
          下钻费用明细
        </Button>
        <Button variant="outline" size="sm" onClick={() => setNotice('已导出当前视图（原型动作，无文件下载）。')}>
          导出
        </Button>
      </div>
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </UedWorkspace>
  )
}
