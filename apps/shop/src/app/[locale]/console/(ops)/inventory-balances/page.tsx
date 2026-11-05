'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  inventoryBucketsFromLots,
  useOceanLots,
} from '@/lib/crossborder/ocean-container-store'
import {
  labelReservationStatus,
  releaseReservation,
  reservationKpi,
  useInventoryReservations,
} from '@/lib/crossborder/inventory-reservation-store'
import { countBalancesKpi, useInventoryBalances } from '@/lib/crossborder/wms-store'
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function InventoryBalancesPage() {
  const rows = useInventoryBalances()
  const lots = useOceanLots()
  const reservations = useInventoryReservations()
  const oceanBuckets = React.useMemo(() => inventoryBucketsFromLots(lots), [lots])
  const kpi = React.useMemo(() => countBalancesKpi(rows), [rows])
  const reservation = React.useMemo(() => reservationKpi(reservations), [reservations])
  const oceanKpi = React.useMemo(() => {
    return oceanBuckets.reduce(
      (acc, row) => {
        acc.inTransit += row.inTransit
        acc.customsClearing += row.customsClearing
        acc.available += row.available
        acc.damaged += row.damaged
        return acc
      },
      { inTransit: 0, customsClearing: 0, available: 0, damaged: 0 },
    )
  }, [oceanBuckets])
  const router = useLocaleRouter()
  const [notice, setNotice] = React.useState('')

  const kpiItems = React.useMemo(
    () => [
      { label: 'SKU 数', value: String(kpi.skuCount), hint: '仓+库位+SKU 维度' },
      { label: '本地仓可用', value: String(kpi.availableTotal + oceanKpi.available), hint: 'WMS available + 已入本地仓柜次' },
      {
        label: '在途',
        value: String(kpi.inTransitTotal + oceanKpi.inTransit),
        hint: '采购在途 + 海运柜次 在途',
      },
      {
        label: '清关中',
        value: String(oceanKpi.customsClearing),
        hint: 'Daraz LK 柜次状态=清关中；不计入可用',
      },
      { label: '残次', value: String(kpi.damagedTotal + oceanKpi.damaged), hint: 'WMS damaged + 柜次残次' },
      {
        label: '预留 / 店铺',
        value: `${reservation.activeQty} / ${reservation.shops.length}`,
        hint: `${reservation.active} 条锁定中；含 Daraz / Lazada`,
      },
      { label: '低库存', value: String(kpi.lowStock), hint: '可用 < 安全库存' },
    ],
    [kpi, oceanKpi, reservation],
  )

  return (
    <UedWorkspace
      title="库存汇总"
      description="Daraz LK：在途 / 清关中 / 本地仓可用 / 残次；柜次投影与 WMS 余额并存（原型）。"
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
        WMS 不变量：available = on_hand − reserved − qc_hold − damaged。inventory_reservations 按订单单位行生成，出库变 consumed、取消变 released；映射异常订单不生成预留。
      </UedPrototypeNotice>
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium">预留明细（inventory_reservations）</h3>
            <p className="text-xs text-muted-foreground">
              锁定中 {reservation.active} 条 / {reservation.activeQty} 件 · 已出库 {reservation.consumedQty} 件 · 已释放 {reservation.releasedQty} 件
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1 pr-3 font-medium">预留 ID</th>
                <th className="py-1 pr-3 font-medium">订单 / 行</th>
                <th className="py-1 pr-3 font-medium">店铺 / 平台</th>
                <th className="py-1 pr-3 font-medium">SKU / 库位</th>
                <th className="py-1 pr-3 font-medium">数量</th>
                <th className="py-1 pr-3 font-medium">状态</th>
                <th className="py-1 pr-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-3 font-mono text-xs">{item.id}</td>
                  <td className="py-1.5 pr-3 font-mono text-xs">{item.order} · {item.orderLineId}</td>
                  <td className="py-1.5 pr-3">{item.shop} · {item.platform}</td>
                  <td className="py-1.5 pr-3 font-mono text-xs">{item.sku} · {item.bin}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{item.qty}</td>
                  <td className="py-1.5 pr-3">
                    <Badge variant={item.status === 'reserved' ? 'secondary' : 'outline'}>
                      {labelReservationStatus(item.status)}
                    </Badge>
                  </td>
                  <td className="py-1.5 pr-3">
                    {item.status === 'reserved' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const result = releaseReservation(item.id)
                          setNotice(result.ok ? result.note : result.reason)
                        }}
                      >
                        释放
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">海运柜次库存投影（F22）</h3>
          <Button size="sm" variant="outline" asChild>
            <LocaleLink href="/console/ocean-containers">打开柜次</LocaleLink>
          </Button>
        </div>
        {oceanBuckets.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无柜次投影。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1 pr-3 font-medium">SKU</th>
                  <th className="py-1 pr-3 font-medium">仓</th>
                  <th className="py-1 pr-3 font-medium">在途</th>
                  <th className="py-1 pr-3 font-medium">清关中</th>
                  <th className="py-1 pr-3 font-medium">本地可用</th>
                  <th className="py-1 pr-3 font-medium">残次</th>
                </tr>
              </thead>
              <tbody>
                {oceanBuckets.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 font-mono text-xs">{row.sku}</td>
                    <td className="py-1.5 pr-3">{row.warehouse}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{row.inTransit}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{row.customsClearing}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{row.available}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{row.damaged}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setNotice(`预留按店铺：${reservation.shops.join('、') || '暂无'}；锁定中 ${reservation.activeQty} 件。`)}
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
