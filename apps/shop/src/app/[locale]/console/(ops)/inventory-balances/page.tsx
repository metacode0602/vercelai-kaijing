'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedWorkspace } from '@/components/console/erp-ued-workspace'
import { useStockAdjustmentDialog } from '@/components/console/stock-adjustment-create-dialog'
import { trpc } from '@/lib/trpc/client'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

export default function InventoryBalancesPage() {
  const listQuery = trpc.wms.listBalances.useQuery({ page: 1, pageSize: 100 })
  const statsQuery = trpc.wms.balanceStats.useQuery()
  const oceanBucketsQuery = trpc.ocean.inventoryBuckets.useQuery({})
  const rows = listQuery.data?.items ?? []
  const stats = statsQuery.data
  const oceanBuckets = oceanBucketsQuery.data ?? []
  const { openWith, dialog, notice } = useStockAdjustmentDialog()
  const oceanKpi = React.useMemo(
    () =>
      oceanBuckets.reduce(
        (acc, row) => {
          acc.inTransit += row.inTransit
          acc.customsClearing += row.customsClearing
          acc.available += row.available
          acc.damaged += row.damaged
          return acc
        },
        { inTransit: 0, customsClearing: 0, available: 0, damaged: 0 },
      ),
    [oceanBuckets],
  )

  const kpiItems = [
    { label: 'SKU 数', value: String(stats?.skuCount ?? 0), hint: '仓+库位+SKU 维度' },
    {
      label: '本地仓可用',
      value: String((stats?.availableTotal ?? 0) + oceanKpi.available),
      hint: 'available = on_hand - reserved - qc_hold - damaged',
    },
    {
      label: '在途',
      value: String((stats?.inTransitTotal ?? 0) + oceanKpi.inTransit),
      hint: '采购在途 + 海运柜次',
    },
    { label: '清关中', value: String((stats?.customsClearingTotal ?? 0) + oceanKpi.customsClearing) },
    { label: '残次', value: String((stats?.damagedTotal ?? 0) + oceanKpi.damaged) },
    { label: '预留', value: String(stats?.reservedTotal ?? 0) },
    { label: '低库存', value: String(stats?.lowStock ?? 0), hint: '可用 < 20' },
  ]

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>库存余额已接 PostgreSQL</AlertTitle>
        <AlertDescription>
          `wms.listBalances` 派生 available；在途/清关列来自 m7。禁止 UI 直改余额。
        </AlertDescription>
      </Alert>
      <DetailKpiRow items={kpiItems} />
      <UedWorkspace
        title="库存汇总"
        description="inventory_balances · DB 分页 · available 派生"
        rows={rows}
        detailHref={(row) => `/console/inventory-balances/${encodeURIComponent(row.id)}`}
        searchKeys={['sku', 'name', 'warehouse', 'bin', 'status']}
        searchPlaceholder="搜索 SKU、仓库或库位"
        filters={[{ label: '状态', options: ['正常', '低库存'] }]}
        emptyText={listQuery.isLoading ? '加载中…' : '暂无库存余额。请先种子或入库上架。'}
        columns={[
          { key: 'sku', label: '内部 SKU' },
          { key: 'name', label: '商品' },
          { key: 'warehouse', label: '仓库' },
          { key: 'bin', label: '库位' },
          { key: 'onHand', label: '实物 on_hand', render: (row) => String(row.onHand) },
          { key: 'reserved', label: '预留', render: (row) => String(row.reserved) },
          { key: 'available', label: '可用', render: (row) => String(row.available) },
          { key: 'inTransit', label: '在途', render: (row) => String(row.inTransit) },
          { key: 'customsClearing', label: '清关', render: (row) => String(row.customsClearing) },
          { key: 'damaged', label: '残次', render: (row) => String(row.damaged) },
          {
            key: 'status',
            label: '状态',
            render: (row) => (
              <Badge variant={row.status === '低库存' ? 'destructive' : 'secondary'}>{row.status}</Badge>
            ),
          },
          {
            key: 'id',
            label: '操作',
            render: (row) => (
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    openWith({
                      sku: row.sku,
                      warehouse: row.warehouse,
                      bin: row.bin,
                      qtySystem: row.onHand,
                    })
                  }
                >
                  发起调整
                </Button>
                <LocaleLink
                  className="underline text-sm"
                  href={`/console/inventory-ledger?sku=${encodeURIComponent(row.sku)}`}
                >
                  台账
                </LocaleLink>
              </div>
            ),
          },
        ]}
      />
      {dialog}
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
