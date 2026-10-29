'use client'

import * as React from 'react'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'

type ProfitRow = {
  id: string
  dimension: string
  revenue: number
  cost: number
  fees: number
  refund: number
  profit: number
  margin: string
  fx: string
  status: string
}

export const DEMO_ORDER_PROFITS: ProfitRow[] = [
  { id: 'DZ-10021', dimension: '订单 · Daraz LK', revenue: 24, cost: 9.6, fees: 4.1, refund: 0, profit: 10.3, margin: '42.9%', fx: 'USD 快照 2026-10-20', status: '已核算' },
  { id: 'LZ-2201', dimension: '订单 · Lazada TH', revenue: 168, cost: 62, fees: 27.4, refund: 0, profit: 78.6, margin: '46.8%', fx: 'THB 快照 2026-10-28', status: '已核算' },
  { id: 'LZ-2180', dimension: '订单 · Lazada MY', revenue: 46, cost: 18.4, fees: 8.2, refund: 6.8, profit: 12.6, margin: '27.4%', fx: 'MYR 快照 2026-10-25', status: '含退款调整' },
]

export const DEMO_SKU_PROFITS: ProfitRow[] = [
  { id: 'HSY000001001', dimension: 'SKU · Oversized Cotton Tee 黑色L', revenue: 512, cost: 204.8, fees: 86.4, refund: 12, profit: 208.8, margin: '40.8%', fx: '多币种按月均汇率', status: '已核算' },
  { id: 'HSY000002001', dimension: 'SKU · USB-C Hub 7-in-1', revenue: 720, cost: 310, fees: 118, refund: 0, profit: 292, margin: '40.6%', fx: '多币种按月均汇率', status: '已核算' },
]

export default function ProfitsPage() {
  const [view, setView] = React.useState<'order' | 'sku'>('order')
  const [notice, setNotice] = React.useState('')
  const rows = view === 'order' ? DEMO_ORDER_PROFITS : DEMO_SKU_PROFITS
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0)
  const profit = rows.reduce((sum, row) => sum + row.profit, 0)
  const fees = rows.reduce((sum, row) => sum + row.fees, 0)
  return (
    <UedWorkspace
      title="订单与 SKU 利润"
      description="费用归集与汇率折算后的利润视图：订单维度看单笔、SKU 维度看商品结构。"
      rows={rows} detailHref={(row) => `/console/profits/${encodeURIComponent(row.id)}`}
      searchKeys={['id', 'dimension', 'status']}
      searchPlaceholder="搜索订单号、SKU 或维度"
      columns={[
        { key: 'id', label: '单据 / SKU' },
        { key: 'dimension', label: '维度' },
        { key: 'revenue', label: '收入', render: (row) => <span className="tabular-nums">{row.revenue.toLocaleString()}</span> },
        { key: 'cost', label: '商品成本', render: (row) => <span className="tabular-nums">{row.cost.toLocaleString()}</span> },
        { key: 'fees', label: '平台/物流费', render: (row) => <span className="tabular-nums">{row.fees.toLocaleString()}</span> },
        { key: 'refund', label: '退款', render: (row) => <span className="tabular-nums">{row.refund.toLocaleString()}</span> },
        { key: 'profit', label: '利润', render: (row) => <span className="font-medium tabular-nums">{row.profit.toLocaleString()}</span> },
        { key: 'margin', label: '利润率' },
        { key: 'fx', label: '汇率口径' },
        { key: 'status', label: '状态', render: (row) => <Badge variant="secondary">{row.status}</Badge> },
      ]}
    >
      <UedPrototypeNotice>
        当前为示例数值，不是已核验利润。费用分摊（平台佣金/物流/推广/退款）、汇率快照与折算规则待财务/业务确认；订单维度与 SKU 维度的汇总必须同口径一致，快照一经核算不被后续汇率覆盖。
      </UedPrototypeNotice>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">收入合计（当前视图原币）</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-semibold tabular-nums">{revenue.toLocaleString()}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">费用合计</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-semibold tabular-nums">{fees.toLocaleString()}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">利润合计</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-semibold tabular-nums">{profit.toLocaleString()}</p></CardContent>
        </Card>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={view === 'order' ? 'secondary' : 'outline'} size="sm" onClick={() => setView('order')}>订单维度</Button>
        <Button variant={view === 'sku' ? 'secondary' : 'outline'} size="sm" onClick={() => setView('sku')}>SKU 维度</Button>
        <Button variant="outline" size="sm" onClick={() => setNotice('下钻示例：DZ-10021 → 订单行费用明细（佣金 1.2 / 物流 2.4 / 平广 0.5）。')}>下钻费用明细</Button>
        <Button variant="outline" size="sm" onClick={() => setNotice('已导出当前视图（原型动作，无文件下载）。')}>导出</Button>
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>
  )
}
