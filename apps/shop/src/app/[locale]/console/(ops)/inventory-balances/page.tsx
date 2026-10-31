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
      { label: '可用合计', value: String(kpi.availableTotal), hint: 'available = on_hand − reserved − qc_hold − damaged' },
      { label: '预留合计', value: String(kpi.reservedTotal), hint: 'reserved：订单/调拨占库' },
      { label: '在途 / 待入', value: String(kpi.inTransitTotal), hint: '采购未上架 / 售后回库在途，不计入 available' },
      { label: '低库存', value: String(kpi.lowStock), hint: '可用 < 安全库存' },
    ],
    [kpi],
  )

  return (
    <UedWorkspace
      title="库存汇总"
      description="inventory_balances：实物(on_hand) / 预留(reserved) / 质检(qc_hold) / 残次(damaged) / 可用(available)；在途·待入(in_transit)单独列，不计入可用。"
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
        { key: 'onHand', label: '实物 on_hand', render: (row) => String(row.onHand) },
        { key: 'reserved', label: '预留 reserved', render: (row) => String(row.reserved) },
        { key: 'qcHold', label: '质检 qc_hold', render: (row) => String(row.qcHold) },
        { key: 'damaged', label: '残次 damaged', render: (row) => String(row.damaged) },
        {
          key: 'available',
          label: '可用 available',
          render: (row) => <span className="font-medium tabular-nums">{row.available}</span>,
        },
        {
          key: 'inTransit',
          label: '在途·待入',
          render: (row) => (
            <span className="tabular-nums" title="采购未上架 / 售后回库在途，不计入 available">
              {row.inTransit}
            </span>
          ),
        },
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
        WMS 不变量：available = on_hand − reserved − qc_hold − damaged。在途 / 待入（in_transit）表示采购未上架或售后回库途中，单独列示、不计入可用。余额是流水投影，UI 不得直改数量。多店铺共享同一仓余额池。
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
