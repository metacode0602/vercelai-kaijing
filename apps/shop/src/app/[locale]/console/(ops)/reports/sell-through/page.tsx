'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { trpc } from '@/lib/trpc/client'

const PAGE_SIZE = 50

export default function SellThroughReportPage() {
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const query = trpc.reports.sellThrough.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
  })
  const rows = query.data?.items ?? []
  const inDenom7 = rows.filter((r) => r.rate7 != null).length

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>动销率口径</AlertTitle>
        <AlertDescription>{query.data?.formula ?? '加载中…'}</AlertDescription>
      </Alert>
      <UedWorkspace
        title="动销率"
        description="F20 · 7/30/90 天动销率。有销量或库存才展示；无数据空态。"
        rows={rows}
        search={q}
        onSearchChange={(v) => {
          setQ(v)
          setPage(1)
        }}
        searchPlaceholder="搜索 SKU / 店铺"
        pagination={{ page, pageSize: PAGE_SIZE, total: query.data?.total ?? 0, onPageChange: setPage }}
        emptyText={query.isLoading ? '加载中…' : '暂无动销数据（无订单销量且无可用库存）。'}
        columns={[
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: '商品' },
          { key: 'shop', label: '店铺' },
          { key: 'listedAt', label: '上架日' },
          {
            key: 'rate7',
            label: '7 日动销%',
            render: (row) =>
              row.rate7 == null ? (
                <Badge variant="outline">未满7天·不计分母</Badge>
              ) : (
                <span className="tabular-nums">{row.rate7}%</span>
              ),
          },
          {
            key: 'rate30',
            label: '30 日%',
            render: (row) => <span className="tabular-nums">{row.rate30}%</span>,
          },
          {
            key: 'rate90',
            label: '90 日%',
            render: (row) => <span className="tabular-nums">{row.rate90}%</span>,
          },
          { key: 'sold30', label: '30日销量', render: (row) => String(row.sold30) },
        ]}
      >
        <DetailKpiRow
          items={[
            { label: 'SKU 数', value: String(query.data?.total ?? 0) },
            { label: '本页7日分母', value: String(inDenom7), hint: '排除未满7天新品' },
            { label: '区间终点', value: query.data?.rangeEnd ?? '—' },
          ]}
        />
        <UedPrototypeNotice>
          无日库存快照时，以期末可用数量近似平均库存；缺数据时保持空态。
        </UedPrototypeNotice>
      </UedWorkspace>
    </div>
  )
}
