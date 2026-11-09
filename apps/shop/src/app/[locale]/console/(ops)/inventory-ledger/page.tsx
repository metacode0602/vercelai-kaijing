'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedWorkspace } from '@/components/console/erp-ued-workspace'
import { useStockAdjustmentDialog } from '@/components/console/stock-adjustment-create-dialog'
import { trpc } from '@/lib/trpc/client'
import { useSearchParams } from 'next/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

export default function InventoryLedgerPage() {
  const listQuery = trpc.wms.listMovements.useQuery({ page: 1, pageSize: 100 })
  const statsQuery = trpc.wms.movementStats.useQuery()
  const metaQuery = trpc.wms.meta.useQuery()
  const rows = listQuery.data?.items ?? []
  const searchParams = useSearchParams()
  const skuFromQuery = searchParams.get('sku') || undefined
  const { openWith, dialog, notice } = useStockAdjustmentDialog()

  const kpiItems = [
    { label: '流水笔数', value: String(statsQuery.data?.total ?? rows.length), hint: '追加式 · 禁改删' },
    { label: '入库类', value: String(statsQuery.data?.inbound ?? 0) },
    { label: '出库类', value: String(statsQuery.data?.outbound ?? 0) },
  ]

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>库存台账已接 PostgreSQL</AlertTitle>
        <AlertDescription>
          inventory_movements；幂等键前缀含 ledger:wms_outbound: / ledger:stock_adjust: / ledger:ocean_*。
          {metaQuery.data ? ` 公式 ${metaQuery.data.availableFormula}` : ''}
        </AlertDescription>
      </Alert>
      <DetailKpiRow items={kpiItems} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          发现异常流水？发起调整修正，审批后过账写反向/补充流水。
        </p>
        <Button
          size="sm"
          onClick={() => openWith(skuFromQuery ? { sku: skuFromQuery } : undefined)}
        >
          发起调整
        </Button>
      </div>
      <UedWorkspace
        title="库存流水"
        description="inventory_movements · DB 分页 · 修正一律反向流水"
        rows={rows}
        detailHref={(row) => `/console/inventory-ledger/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'sku', 'warehouse', 'bin', 'type', 'sourceId', 'operator', 'idempotencyKey']}
        searchPlaceholder="搜索流水号、SKU、来源单或幂等键"
        emptyText={listQuery.isLoading ? '加载中…' : '暂无库存流水'}
        columns={[
          { key: 'id', label: '流水号', render: (row) => row.id.slice(0, 10) },
          { key: 'sku', label: 'SKU' },
          {
            key: 'warehouse',
            label: '仓库 / 库位',
            render: (row) => `${row.warehouse} · ${row.bin}`,
          },
          { key: 'type', label: '变动类型' },
          {
            key: 'qtyDelta',
            label: '变化',
            render: (row) => (
              <span className={row.qtyDelta < 0 ? 'text-destructive' : undefined}>
                {row.qtyDelta > 0 ? `+${row.qtyDelta}` : row.qtyDelta}
              </span>
            ),
          },
          { key: 'onHandAfter', label: '变动后在手', render: (row) => String(row.onHandAfter) },
          { key: 'reservedAfter', label: '变动后预留', render: (row) => String(row.reservedAfter) },
          { key: 'sourceId', label: '来源单', render: (row) => row.sourceId || '—' },
          {
            key: 'idempotencyKey',
            label: '幂等键',
            render: (row) => (
              <span className="font-mono text-xs">{row.idempotencyKey || '—'}</span>
            ),
          },
          { key: 'operator', label: '操作者' },
          { key: 'occurredAt', label: '时间' },
          {
            key: 'status',
            label: '状态',
            render: () => <Badge variant="secondary">已记账</Badge>,
          },
        ]}
      />
      {dialog}
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
