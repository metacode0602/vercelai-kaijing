'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { trpc } from '@/lib/trpc/client'

const PAGE_SIZE = 50

export default function StockRiskReportPage() {
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [flag, setFlag] = React.useState('全部')
  const query = trpc.reports.stockRisk.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    flag: flag === '全部' ? undefined : flag,
  })
  const rows = query.data?.items ?? []
  const slow = rows.filter((r) => r.flag === '滞销').length
  const stockout = rows.filter((r) => r.flag === '断货风险').length

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>滞销 / 断货口径</AlertTitle>
        <AlertDescription>{query.data?.formula ?? '加载中…'}</AlertDescription>
      </Alert>
      <UedWorkspace
        title="滞销 / 断货预警"
        description="F21 · 按 orders + balances 计算；无数据空态，无假图。"
        rows={rows}
        search={q}
        onSearchChange={(v) => {
          setQ(v)
          setPage(1)
        }}
        searchPlaceholder="搜索 SKU"
        filters={[{ label: '标记', options: ['滞销', '断货风险', '正常', '新品观察'] }]}
        onStatusFilterChange={(v) => {
          setFlag(v)
          setPage(1)
        }}
        pagination={{ page, pageSize: PAGE_SIZE, total: query.data?.total ?? 0, onPageChange: setPage }}
        emptyText={query.isLoading ? '加载中…' : '暂无库存风险数据。'}
        columns={[
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: '商品' },
          { key: 'available', label: '本地可用', render: (r) => String(r.available) },
          { key: 'inTransit', label: '在途', render: (r) => String(r.inTransit) },
          { key: 'customsClearing', label: '清关中', render: (r) => String(r.customsClearing) },
          { key: 'dailySales30', label: '日均销(30d)', render: (r) => String(r.dailySales30) },
          {
            key: 'daysOfCoverLocal',
            label: '可售天(本地)',
            render: (r) => (r.daysOfCoverLocal == null ? '∞/无销' : String(r.daysOfCoverLocal)),
          },
          {
            key: 'daysOfCoverWithEta',
            label: '可售天(含在途)',
            render: (r) => (r.daysOfCoverWithEta == null ? '∞/无销' : String(r.daysOfCoverWithEta)),
          },
          {
            key: 'flag',
            label: '标记',
            render: (r) => (
              <Badge variant={r.flag === '断货风险' || r.flag === '滞销' ? 'destructive' : 'secondary'}>
                {r.flag}
              </Badge>
            ),
          },
        ]}
      >
        <DetailKpiRow
          items={[
            { label: '本页滞销', value: String(slow) },
            { label: '本页断货风险', value: String(stockout) },
            { label: '监控 SKU', value: String(query.data?.total ?? 0) },
          ]}
        />
        <UedPrototypeNotice>
          在途与清关中的库存按余额合计展示。
        </UedPrototypeNotice>
      </UedWorkspace>
    </div>
  )
}
