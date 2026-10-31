'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  advanceOceanLotStatus,
  inventoryBucketsFromLots,
  oceanLotKpi,
  upsertOceanLot,
  useOceanLots,
  type OceanLot,
} from '@/lib/crossborder/ocean-container-store'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function OceanContainersPage() {
  const lots = useOceanLots()
  const kpi = React.useMemo(() => oceanLotKpi(lots), [lots])
  const buckets = React.useMemo(() => inventoryBucketsFromLots(lots), [lots])
  const [notice, setNotice] = React.useState('')

  function addDemoLot() {
    const id = `LOT-CMB-DEMO-${Date.now().toString().slice(-4)}`
    const lot: OceanLot = {
      id,
      lotCode: id,
      containerNo: 'DEMO' + Math.floor(Math.random() * 9000 + 1000),
      containerType: '40HQ',
      platform: 'Daraz',
      originPort: 'CNXMN',
      destPort: 'LKCMB',
      warehouse: 'WH-LK-CMB-001',
      status: '在途',
      etd: '2026-10-20',
      etaPort: '2026-12-10',
      etaWarehouse: '2026-12-18',
      notes: '原型新增柜次',
      lines: [{ id: `${id}-L1`, sku: 'TEE-001', name: '速干 Polo', qtyShipped: 100, qtyReceived: 0, qtyDamaged: 0 }],
    }
    upsertOceanLot(lot)
    setNotice(`已新增柜次 ${id}（localStorage）`)
  }

  return (
    <UedWorkspace
      title="海运柜次"
      description="F22 · Daraz LK 海运柜次（45–60 天 → Colombo）。不共享厦门现货池。状态：在途 / 清关中 / 已入本地仓。"
      rows={lots}
      detailHref={(row) => `/console/ocean-containers/${encodeURIComponent(row.id)}`}
      searchKeys={['lotCode', 'containerNo', 'status', 'warehouse']}
      searchPlaceholder="搜索柜次号、柜号或状态"
      filters={[{ label: '状态', options: ['在途', '清关中', '已入本地仓', '已取消'] }]}
      onAdd={addDemoLot}
      addLabel="新建柜次"
      columns={[
        { key: 'lotCode', label: '柜次' },
        { key: 'containerNo', label: '柜号' },
        { key: 'containerType', label: '柜型' },
        { key: 'originPort', label: '起运港' },
        { key: 'destPort', label: '目的港' },
        { key: 'etaPort', label: 'ETA 港' },
        { key: 'etaWarehouse', label: 'ETA 仓' },
        {
          key: 'status',
          label: '状态',
          render: (row) => (
            <Badge variant={row.status === '清关中' ? 'destructive' : row.status === '在途' ? 'secondary' : 'default'}>
              {row.status}
            </Badge>
          ),
        },
        { key: 'lines', label: 'SKU 行', render: (row) => String(row.lines.length) },
      ]}
    >
      <DetailKpiRow
        items={[
          { label: '柜次数', value: String(kpi.total) },
          { label: '在途', value: String(kpi.inTransit) },
          { label: '清关中', value: String(kpi.clearing) },
          { label: '已入本地仓', value: String(kpi.received) },
          { label: 'SKU 行合计', value: String(kpi.skuLines) },
        ]}
      />
      <UedPrototypeNotice>
        架构决议：Daraz LK ≠ WH-CN-XMN 共享池。库存桶含在途 / 清关中 / 本地可用 / 残次。审批相关：杨洁 / 黄发聪。P2 抓取未做（Q36）。
      </UedPrototypeNotice>
      <div className="rounded-lg border p-4">
        <h3 className="mb-2 text-sm font-medium">库存桶投影（由柜次滚动）</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">SKU</th>
                <th className="py-1 pr-3">仓</th>
                <th className="py-1 pr-3">在途</th>
                <th className="py-1 pr-3">清关中</th>
                <th className="py-1 pr-3">可用</th>
                <th className="py-1 pr-3">残次</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="py-1 pr-3">{b.sku}</td>
                  <td className="py-1 pr-3">{b.warehouse}</td>
                  <td className="py-1 pr-3 tabular-nums">{b.inTransit}</td>
                  <td className="py-1 pr-3 tabular-nums">{b.customsClearing}</td>
                  <td className="py-1 pr-3 tabular-nums">{b.available}</td>
                  <td className="py-1 pr-3 tabular-nums">{b.damaged}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {lots
          .filter((l) => l.status === '在途' || l.status === '清关中')
          .slice(0, 3)
          .map((lot) => (
            <Button
              key={lot.id}
              size="sm"
              variant="outline"
              onClick={() => {
                advanceOceanLotStatus(lot.id)
                setNotice(`已推进 ${lot.lotCode} 状态`)
              }}
            >
              推进 {lot.lotCode}
            </Button>
          ))}
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>
  )
}
