'use client'

import * as React from 'react'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { DetailKpiRow } from '@/components/console/detail'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

const PAGE_SIZE = 20

export default function SettlementsPage() {
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('全部')
  const [notice, setNotice] = React.useState('')
  const utils = trpc.useUtils()

  const metaQuery = trpc.finance.meta.useQuery()
  const statsQuery = trpc.finance.settlementStats.useQuery()
  const listQuery = trpc.finance.listSettlements.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status === '全部' ? undefined : status,
  })
  const updateMutation = trpc.finance.updateSettlementStatus.useMutation({
    onSuccess: async (row) => {
      await utils.finance.listSettlements.invalidate()
      await utils.finance.settlementStats.invalidate()
      await utils.finance.overview.invalidate()
      setNotice(`${row.externalSettlementId} 状态已更新为 ${row.status}（本地 ERP，非平台回写）。`)
    },
    onError: (error) => setNotice(error.message),
  })

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const stats = statsQuery.data
  const statuses = metaQuery.data?.settlementStatuses ?? ['待匹配', '差异待处理', '已确认', '已打款']

  return (
    <UedWorkspace
      title="平台结算对账"
      description="settlements / settlement_lines：账单批次、费用拆分（按明细汇总）、本地确认。非平台 OpenAPI 拉取。"
      rows={rows}
      detailHref={(row) => `/console/settlements/${encodeURIComponent(row.id)}`}
      search={q}
      onSearchChange={(value) => {
        setQ(value)
        setPage(1)
      }}
      searchPlaceholder="结算单号 / 外部账单号 / 店铺"
      filters={[{ label: '状态', options: statuses.filter((s) => s !== '未结算') }]}
      onStatusFilterChange={(value) => {
        setStatus(value === '全部' ? '全部' : value)
        setPage(1)
      }}
      pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      emptyText={
        listQuery.isLoading
          ? '加载结算…'
          : '暂无结算批次。跑 db:seed:commerce-finance 或导入本地账单占位。'
      }
      columns={[
        { key: 'externalSettlementId', label: '外部结算号' },
        { key: 'platform', label: '平台' },
        { key: 'shop', label: '店铺' },
        { key: 'period', label: '账期' },
        {
          key: 'billAmount',
          label: '账单额',
          render: (row) => (
            <span className="tabular-nums">
              {row.billAmount.toLocaleString()} {row.currency}
            </span>
          ),
        },
        {
          key: 'feesTotal',
          label: '费用',
          render: (row) => <span className="tabular-nums">{row.feesTotal.toLocaleString()}</span>,
        },
        {
          key: 'payoutAmount',
          label: '打款',
          render: (row) => <span className="tabular-nums">{row.payoutAmount.toLocaleString()}</span>,
        },
        {
          key: 'status',
          label: '状态',
          render: (row) => <Badge variant="secondary">{row.status}</Badge>,
        },
      ]}
    >
      <DetailKpiRow
        items={[
          { label: '批次', value: String(stats?.total ?? 0) },
          { label: '账单合计', value: (stats?.billTotal ?? 0).toLocaleString() },
          { label: '费用合计', value: (stats?.feesTotal ?? 0).toLocaleString() },
          { label: '打款合计', value: (stats?.payoutTotal ?? 0).toLocaleString() },
        ]}
      />
      <UedPrototypeNotice>
        费用拆分来自 settlement_lines.fee_kind 汇总；空则为 0。确认/打款只改本地 status。
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        {rows
          .filter((r) => r.status === '待匹配' || r.status === '差异待处理')
          .slice(0, 4)
          .map((row) => (
            <Button
              key={row.id}
              size="sm"
              variant="outline"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate({ id: row.id, status: '已确认' })}
            >
              确认 · {row.externalSettlementId}
            </Button>
          ))}
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>
  )
}
