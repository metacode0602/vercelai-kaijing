'use client'

import * as React from 'react'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ERP_DEMO_INVENTORY } from '@/lib/crossborder/erp-ued-data'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type BalanceRow = {
  id: string
  sku: string
  name: string
  warehouse: string
  bin: string
  onHand: number
  reserved: number
  damaged: number
  available: number
  inTransit: number
  threshold: number
  status: string
}

export const DEMO_BALANCES: BalanceRow[] = ERP_DEMO_INVENTORY.map((item) => ({
  id: `${item.warehouse}-${item.bin}-${item.sku}`,
  sku: item.sku,
  name: item.name,
  warehouse: item.warehouse,
  bin: item.bin,
  onHand: item.onHand,
  reserved: item.reserved,
  damaged: item.damaged,
  available: item.onHand - item.reserved - item.damaged,
  inTransit: item.inbound,
  threshold: item.threshold,
  status: item.onHand - item.reserved - item.damaged <= item.threshold ? '低库存' : '正常',
}))

export default function InventoryBalancesPage() {
  const [rows] = React.useState<BalanceRow[]>(DEMO_BALANCES)
  const [notice, setNotice] = React.useState('')
  const poolTotal = rows.reduce((sum, row) => sum + row.available, 0)
  const transitTotal = rows.reduce((sum, row) => sum + row.inTransit, 0)
  return (
    <UedWorkspace
      title="库存汇总"
      description="按仓库/库位/SKU 查实际、可用、锁定、在途与残次；多站点共享同一库存池。"
      rows={rows} detailHref={(row) => `/console/inventory-balances/${encodeURIComponent(row.id)}`}
      searchKeys={['sku', 'name', 'warehouse', 'bin', 'status']}
      searchPlaceholder="搜索 SKU、仓库或库位"
      filters={[{ label: '状态', options: ['正常', '低库存'] }]}
      columns={[
        { key: 'sku', label: '内部 SKU' },
        { key: 'name', label: '商品' },
        { key: 'warehouse', label: '仓库' },
        { key: 'bin', label: '库位' },
        { key: 'onHand', label: '实际库存', render: (row) => String(row.onHand) },
        { key: 'reserved', label: '锁定', render: (row) => String(row.reserved) },
        { key: 'damaged', label: '残次/不可售', render: (row) => String(row.damaged) },
        { key: 'available', label: '可用', render: (row) => <span className="font-medium tabular-nums">{row.available}</span> },
        { key: 'inTransit', label: '在途', render: (row) => String(row.inTransit) },
        { key: 'threshold', label: '安全库存', render: (row) => String(row.threshold) },
        { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '低库存' ? 'destructive' : 'secondary'}>{row.status}</Badge> },
      ]}
    >
      <UedPrototypeNotice>
        可用库存 = 实际 − 锁定 − 不可售；五国共享池指 Lazada 多站点与 Daraz 共用同一仓库库存，按店铺分配的锁定量决定可售。跨店铺调拨需权限并在库存流水中记账。在途为未收货采购与在途售后回库，不计入可用。
      </UedPrototypeNotice>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">共享池可用合计</p><p className="text-xl font-semibold tabular-nums">{poolTotal}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">在途合计</p><p className="text-xl font-semibold tabular-nums">{transitTotal}</p></div>
        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">低库存 SKU</p><p className="text-xl font-semibold tabular-nums">{rows.filter((row) => row.status === '低库存').length}</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setNotice('按店铺查看锁定明细：Lazada MY 锁定 8 件、Daraz LK 锁定 5 件（示例）。')}>按店铺看锁定</Button>
        <Button variant="outline" size="sm" onClick={() => setNotice('发起跨仓调拨将生成调拨单与双向流水（原型）。')}>发起跨仓调拨</Button>
        <Button variant="outline" size="sm" onClick={() => setNotice('低库存 SKU 已按建议采购量生成采购申请草稿（原型）。')}>从低库存生成采购申请</Button>
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>
  )
}
