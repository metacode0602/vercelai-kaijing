'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type OutboundRow = {
  id: string
  order: string
  packageId: string
  sku: string
  quantity: number
  bin: string
  picker: string
  at: string
  status: string
}

export const DEMO_OUTBOUNDS: OutboundRow[] = [
  { id: 'OUT-2026-0087', order: 'DZ-10021', packageId: 'PKG-DZ-10021', sku: 'HSY000001001', quantity: 2, bin: 'A-01-01-01', picker: '仓库员 · 兰雨晨', at: '2026-10-28 09:12', status: '待拣货' },
  { id: 'OUT-2026-0086', order: 'LZ-2201', packageId: 'PKG-LZ-2201', sku: 'HSY000002001', quantity: 1, bin: 'B-02-01-01', picker: '仓库员 · 兰雨晨', at: '2026-10-28 08:40', status: '拣货中' },
  { id: 'OUT-2026-0084', order: 'DZ-10018', packageId: 'PKG-DZ-10018', sku: 'HSY000002001', quantity: 1, bin: 'B-02-01-01', picker: '仓库员 · 兰雨晨', at: '2026-10-20 10:20', status: '已出库' },
]

export default function StockOutboundsPage() {
  const [rows, setRows] = React.useState<OutboundRow[]>(DEMO_OUTBOUNDS)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? (
    <UedDialog
      title="创建出库单"
      description="正常订单出库由拣货任务自动生成；手工建单需选择原因并说明关联单据。"
      fields={[
        { key: 'type', label: '出库类型', options: ['订单出库', '调拨出库', '报损出库', '样品出库'], required: true },
        { key: 'order', label: '订单 / 关联单号', options: ['DZ-10021', 'LZ-2201', 'DZ-10018'], required: true },
        { key: 'packageId', label: '包裹 ID', placeholder: '订单出库时自动生成' },
        { key: 'sku', label: '内部 SKU', options: ['HSY000001001', 'HSY000001002', 'HSY000002001'], required: true },
        { key: 'quantity', label: '数量', type: 'number', required: true },
        { key: 'bin', label: '拣货库位', options: ['A-01-01-01', 'A-01-01-02', 'B-02-01-01'], required: true },
        { key: 'picker', label: '拣货人', required: true },
        { key: 'reason', label: '手工建单原因', type: 'textarea', required: true, fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={() => {
        setRows((current) => [
          {
            id: `OUT-2026-${String(current.length + 88).padStart(4, '0')}`,
            order: 'DZ-10021',
            packageId: 'PKG-DZ-10021',
            sku: 'HSY000001001',
            quantity: 1,
            bin: 'A-01-01-01',
            picker: '当前用户',
            at: '刚刚',
            status: '待拣货',
          },
          ...current,
        ])
        setOpen(false)
        setNotice('出库单已创建（原型）；拣货完成后才扣减实际库存。')
      }}
    />
  ) : null
  function advance(id: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row
        const next = row.status === '待拣货' ? '拣货中' : row.status === '拣货中' ? '已复核' : '已出库'
        return { ...row, status: next }
      }),
    )
    setNotice(`${id} 状态已推进（原型）；「已出库」时扣减实际库存并追加出库流水，重复出库被拦截。`)
  }
  return (
    <>
      {editor}
      <UedWorkspace
        title="出库单"
        description="订单出库与手工出库统一登记：拣货 → 复核 → 出库，与库存流水保持一致。"
        rows={rows} detailHref={(row) => `/console/stock-outbounds/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'order', 'packageId', 'sku', 'picker', 'status']}
        searchPlaceholder="搜索出库单号、订单或包裹"
        filters={[{ label: '状态', options: ['待拣货', '拣货中', '已复核', '已出库', '已取消'] }]}
        addLabel="创建出库单"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '出库单号' },
          { key: 'order', label: '订单号' },
          { key: 'packageId', label: '包裹号' },
          { key: 'sku', label: '内部 SKU' },
          { key: 'quantity', label: '数量', render: (row) => String(row.quantity) },
          { key: 'bin', label: '拣货库位' },
          { key: 'picker', label: '拣货人' },
          { key: 'at', label: '时间' },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '已出库' ? 'secondary' : 'outline'}>{row.status}</Badge> },
        ]}
      >
        <UedPrototypeNotice>
          出库扣减与库存流水必须同事务一致；同一包裹重复出库会被幂等拦截，更正需冲正流水。未映射订单不占库、不生成出库单——先在「订单异常」修复映射。未映射订单行的拣货任务在「拣货打包发货」查看。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows.filter((row) => row.status !== '已出库' && row.status !== '已取消').map((row) => (
            <Button key={row.id} variant="outline" size="sm" onClick={() => advance(row.id)}>推进 · {row.id}（{row.status}）</Button>
          ))}
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
