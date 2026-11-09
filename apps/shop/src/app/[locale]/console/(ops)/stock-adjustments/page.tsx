'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedWorkspace } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

function statusVariant(status: string) {
  if (status === '已驳回' || status === '已取消') return 'destructive' as const
  if (status === '待审批' || status === '草稿') return 'outline' as const
  if (status === '已过账') return 'secondary' as const
  return 'outline' as const
}

export default function StockAdjustmentsPage() {
  const router = useLocaleRouter()

  const listQuery = trpc.wms.listAdjustments.useQuery({ page: 1, pageSize: 100 })
  const statsQuery = trpc.wms.adjustmentStats.useQuery()

  const rows = listQuery.data?.items ?? []
  const counts = statsQuery.data?.byStatus ?? {}

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>盘点与调整 · 只读检索</AlertTitle>
        <AlertDescription>
          本页仅做调整单检索与状态总览。发起调整请从「库存汇总 / 库存流水 / 入库单 / 海运柜次」等发现问题页入口；
          审批与过账请在调整单详情页操作。过账写 ledger:stock_adjust:*，不得把 on_hand 减到低于 reserved。
        </AlertDescription>
      </Alert>
      <DetailKpiRow
        items={[
          { label: '调整单', value: String(statsQuery.data?.total ?? rows.length) },
          { label: '待审批', value: String(counts['待审批'] ?? 0) },
          { label: '已通过待过账', value: String(counts['已通过'] ?? 0) },
          { label: '已过账', value: String(counts['已过账'] ?? 0) },
        ]}
      />
      <UedWorkspace
        title="盘点与调整"
        description="stock_adjustments · tRPC → Postgres · 只读检索，操作进详情页"
        rows={rows}
        detailHref={(row) => `/console/stock-adjustments/${encodeURIComponent(row.id)}`}
        searchKeys={['adjustmentNo', 'kind', 'warehouse', 'firstSku', 'status', 'reason']}
        searchPlaceholder="调整单号 / SKU / 原因"
        filters={[
          { label: '状态', options: ['草稿', '待审批', '已通过', '已过账', '已驳回', '已取消'] },
        ]}
        emptyText={listQuery.isLoading ? '加载中…' : '暂无调整单'}
        columns={[
          { key: 'adjustmentNo', label: '单号' },
          { key: 'kind', label: '类型' },
          { key: 'warehouse', label: '仓库' },
          { key: 'firstSku', label: '首行 SKU' },
          { key: 'totalDiff', label: '差异合计', render: (r) => String(r.totalDiff) },
          {
            key: 'status',
            label: '状态',
            render: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge>,
          },
          {
            key: 'id',
            label: '操作',
            render: (row) => (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => router.push(`/console/stock-adjustments/${row.id}`)}
              >
                详情
              </Button>
            ),
          },
        ]}
      />
    </div>
  )
}
