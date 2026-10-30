'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { countBalancesKpi, useInventoryBalances } from '@/lib/crossborder/wms-store'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function InventoryBalancesPage() {
  const rows = useInventoryBalances()
  const kpi = React.useMemo(() => countBalancesKpi(rows), [rows])
  const router = useLocaleRouter()
  const [notice, setNotice] = React.useState('')

  const kpiItems = React.useMemo(
    () => [
      { label: 'SKU 数', value: String(kpi.skuCount), hint: '仓+库位+SKU 维度' },
      { label: '可用合计', value: String(kpi.availableTotal), hint: 'on_hand − reserved − qc − damaged' },
      { label: '预留合计', value: String(kpi.reservedTotal) },
      { label: '低库存', value: String(kpi.lowStock), hint: `在途 ${kpi.inTransitTotal}` },
    ],
    [kpi],
  )

  return (
    <UedWorkspace
      title="库存汇总"
      description="inventory_balances：按仓库 / 库位 / SKU 查实物、预留、质检占用、残次与可用；多站点共享同一库存池。"
      rows={rows}
      detailHref={(row) => `/console/inventory-balances/${encodeURIComponent(row.id)}`}
      searchKeys={['sku', 'name', 'warehouse', 'bin', 'status']}
      searchPlaceholder="搜索 SKU、仓库或库位"
      filters={[{ label: '状态', options: ['正常', '低库存'] }]}
      emptyText="暂无库存余额。请先完成入库上架，或导入期初库存。"
      columns={[
        { key: 'sku', label: '内部 SKU' },
        { key: 'name', label: '商品' },
        { key: 'warehouse', label: '仓库' },
        { key: 'bin', label: '库位' },
        { key: 'onHand', label: '实物', render: (row) => String(row.onHand) },
        { key: 'reserved', label: '预留', render: (row) => String(row.reserved) },
        { key: 'qcHold', label: '质检占用', render: (row) => String(row.qcHold) },
        { key: 'damaged', label: '残次', render: (row) => String(row.damaged) },
        {
          key: 'available',
          label: '可用',
          render: (row) => <span className="font-medium tabular-nums">{row.available}</span>,
        },
        { key: 'inTransit', label: '在途', render: (row) => String(row.inTransit) },
        { key: 'threshold', label: '安全库存', render: (row) => String(row.threshold) },
        {
          key: 'status',
          label: '状态',
          render: (row) => (
            <Badge variant={row.status === '低库存' ? 'destructive' : 'secondary'}>{row.status}</Badge>
          ),
        },
      ]}
    >
      <DetailKpiRow items={kpiItems} />
      <UedPrototypeNotice>
        余额是流水投影，UI 不得直改。可用 = 实物 − 预留 − 质检占用 − 残次。在途（未上架采购 / 售后回库）不计入可用。五国共享池指多店铺竞争同一仓余额。
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setNotice('按店铺查看锁定明细：Lazada MY 锁定 8 件、Daraz LK 锁定 5 件（示例）。')}
        >
          按店铺看预留
        </Button>
        <Button size="sm" variant="secondary" onClick={() => router.push('/console/inventory-ledger')}>
          打开库存流水
        </Button>
        <Button size="sm" variant="outline" onClick={() => router.push('/console/stock-adjustments')}>
          发起盘点 / 调整
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setNotice('低库存 SKU 已按建议采购量生成采购申请草稿（原型）。')}
        >
          从低库存生成采购申请
        </Button>
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>
  )
}
