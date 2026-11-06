'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

const PAGE_SIZE = 20

export default function ProfitsPage() {
  const [view, setView] = React.useState<'order' | 'sku'>('order')
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [notice, setNotice] = React.useState('')

  const listQuery = trpc.finance.listProfits.useQuery({
    page,
    pageSize: PAGE_SIZE,
    view,
    q: q || undefined,
  })
  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0)
  const profit = rows.reduce((sum, row) => sum + row.profit, 0)
  const fees = rows.reduce((sum, row) => sum + row.fees, 0)

  return (
    <UedWorkspace
      title="订单与 SKU 利润"
      description="订单金额 − sku_costs − 结算/物流费用；无结算显示「未结算」。费用不写死。"
      rows={rows}
      detailHref={(row) => `/console/profits/${encodeURIComponent(row.id)}`}
      search={q}
      onSearchChange={(value) => {
        setQ(value)
        setPage(1)
      }}
      searchPlaceholder="搜索订单号、SKU"
      pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      emptyText={listQuery.isLoading ? '计算利润…' : '暂无订单/成本数据。先 seed 商品与订单。'}
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
            <span className="text-xs text-muted-foreground">
              P{row.breakdown.platform}/L{row.breakdown.logistics}/A{row.breakdown.ads}/J{row.breakdown.jsb}/R
              {row.breakdown.refunds}/FX{row.breakdown.fx}
            </span>
          ),
        },
        {
          key: 'profit',
          label: '利润',
          render: (row) => <span className="font-medium tabular-nums">{row.profit.toLocaleString()}</span>,
        },
        { key: 'margin', label: '利润率' },
        {
          key: 'status',
          label: '状态',
          render: (row) => (
            <Badge variant={row.status === '未结算' ? 'outline' : 'secondary'}>{row.status}</Badge>
          ),
        },
      ]}
    >
      <UedPrototypeNotice>
        利润 = 订单营收 − 最新 sku_costs − settlement_lines/logistics_fee_details。无结算批次则状态为「未结算」，费用为 0。
      </UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '收入合计（本页）', value: revenue.toLocaleString() },
          { label: '费用合计', value: fees.toLocaleString() },
          { label: '利润合计', value: profit.toLocaleString() },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={view === 'order' ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => {
            setView('order')
            setPage(1)
          }}
        >
          订单维度
        </Button>
        <Button
          variant={view === 'sku' ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => {
            setView('sku')
            setPage(1)
          }}
        >
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
              `下钻 ${sample.id}：平台 ${b.platform} / 物流 ${b.logistics} / 推广 ${b.ads} / JSB ${b.jsb} / 退款 ${b.refunds} / 汇兑 ${b.fx} · ${sample.status}`,
            )
          }}
        >
          下钻费用明细
        </Button>
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>
  )
}
