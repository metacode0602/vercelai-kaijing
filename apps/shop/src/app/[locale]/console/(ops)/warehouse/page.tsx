'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ERP_DEMO_BINS } from '@/lib/crossborder/erp-ued-data'
import { INITIAL_WAREHOUSES } from '@/lib/crossborder/platform-basics-data'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function WarehousePage() {
  const [bins, setBins] = React.useState(ERP_DEMO_BINS)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? <UedDialog title="新增仓库库位" description="同一仓库内库位编码必须唯一。" fields={[{ label: '仓库', options: INITIAL_WAREHOUSES.map((item) => `${item.name} (${item.code})`) }, { label: '库位编码', placeholder: '如 A-01-01-03' }, { label: '绑定内部 SKU', options: ['不绑定', 'HSY000001001', 'HSY000001002', 'HSY000002001'] }, { label: '备注' }]} onClose={() => setOpen(false)} onSave={() => { setBins((current) => [...current, { warehouse: 'WH-CN-XMN-001', code: `A-01-01-0${current.length + 2}`, sku: '—', status: '空闲' }]); setOpen(false); setNotice('库位已加入本次原型会话。') }} /> : null
  return <>{editor}<UedWorkspace title="仓库与库位" description="公司仓库可由多个店铺复用；库位绑定启用 SKU 并保留历史。" rows={bins} searchKeys={['warehouse', 'code', 'sku', 'status']} addLabel="新增库位" onAdd={() => setOpen(true)} columns={[
    { key: 'warehouse', label: '仓库' }, { key: 'code', label: '库位编码' }, { key: 'sku', label: '绑定 SKU' }, { key: 'status', label: '库位状态', render: (row) => <Badge variant={row.status === '占用' ? 'secondary' : 'outline'}>{row.status}</Badge> }, { key: 'warehouse', label: '關联仓库', render: () => INITIAL_WAREHOUSES.map((warehouse) => warehouse.name).join('、') },
  ]}>
    <UedPrototypeNotice>数据库强校验：同一仓库库位编码唯一；一个有效库位只能绑定一个启用 SKU。解绑或换绑应留历史。</UedPrototypeNotice>
    <div className="flex flex-wrap gap-2">{INITIAL_WAREHOUSES.map((warehouse) => <Button key={warehouse.code} variant="outline" size="sm" onClick={() => setNotice(`${warehouse.name}：${warehouse.shops.length} 个示例店铺可选`) }>{warehouse.name} · {warehouse.code}</Button>)}</div>
    {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
  </UedWorkspace></>
}
