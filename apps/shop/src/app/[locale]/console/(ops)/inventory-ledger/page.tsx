'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { LEDGER_EVENT_TYPES, useInventoryLedger } from '@/lib/crossborder/wms-store'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function InventoryLedgerPage() {
  const rows = useInventoryLedger()
  const router = useLocaleRouter()
  const [notice, setNotice] = React.useState('')

  const kpiItems = React.useMemo(() => {
    const inbound = rows.filter((row) => row.direction === 'in').length
    const outbound = rows.filter((row) => row.direction === 'out').length
    const adjust = rows.filter((row) => row.direction === 'adjust' || row.direction === 'move').length
    return [
      { label: '流水笔数', value: String(rows.length), hint: '追加式 · 禁改删' },
      { label: '入库类', value: String(inbound) },
      { label: '出库类', value: String(outbound) },
      { label: '调整 / 锁定', value: String(adjust) },
    ]
  }, [rows])

  return (
    <UedWorkspace
      title="库存流水"
      description="inventory_ledger：库存变化追加记账；余额是投影。修正一律创建反向流水，不允许编辑或删除历史。"
      rows={rows}
      detailHref={(row) => `/console/inventory-ledger/${encodeURIComponent(row.id)}`}
      searchKeys={['id', 'sku', 'warehouse', 'bin', 'type', 'sourceId', 'shop', 'platform', 'externalShopId', 'actor', 'idempotencyKey', 'eventType']}
      searchPlaceholder="搜索流水号、SKU、来源单或幂等键"
      filters={[{ label: '类型', options: [...LEDGER_EVENT_TYPES], key: 'eventType' }]}
      emptyText="暂无库存流水。入库上架、出库过账或调整过账后会出现在此。"
      columns={[
        { key: 'id', label: '流水号' },
        { key: 'sku', label: 'SKU' },
        {
          key: 'warehouse',
          label: '仓库 / 库位',
          render: (row) => `${row.warehouse} · ${row.bin}`,
        },
        { key: 'type', label: '变动类型' },
        { key: 'onHandBefore', label: '变动前', render: (row) => String(row.onHandBefore) },
        {
          key: 'qty',
          label: '变化',
          render: (row) => {
            const delta = row.onHandAfter - row.onHandBefore
            const reservedDelta = row.reservedAfter - row.reservedBefore
            const show = delta !== 0 ? delta : reservedDelta
            return (
              <span className={show < 0 ? 'text-destructive' : undefined}>
                {show > 0 ? `+${show}` : show}
              </span>
            )
          },
        },
        { key: 'onHandAfter', label: '变动后', render: (row) => String(row.onHandAfter) },
        { key: 'sourceId', label: '来源单' },
        { key: 'shop', label: '店铺 / 平台', render: (row) => row.shop ? `${row.shop} · ${row.platform}` : '—' },
        { key: 'externalShopId', label: '外部店铺 ID', render: (row) => row.externalShopId || '—' },
        { key: 'actor', label: '操作人' },
        { key: 'occurredAt', label: '时间' },
        {
          key: 'status',
          label: '状态',
          render: (row) => <Badge variant="secondary">{row.status}</Badge>,
        },
      ]}
    >
      <DetailKpiRow items={kpiItems} />
      <UedPrototypeNotice>
        幂等键（organization_id + idempotency_key）唯一：重复上架 / 出库 / 过账会被拦截。订单类流水同时记录店铺与平台来源；创建调整请前往「盘点与调整」。
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => router.push('/console/stock-adjustments')}>
          发起盘点 / 调整
        </Button>
        <Button size="sm" variant="outline" onClick={() => router.push('/console/stock-inbounds')}>
          入库上架
        </Button>
        <Button size="sm" variant="outline" onClick={() => router.push('/console/stock-outbounds')}>
          出库单
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setNotice('流水不可导出删除；演示导出请用右上角「导出演示清单」。')}
        >
          关于冲正
        </Button>
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>
  )
}
