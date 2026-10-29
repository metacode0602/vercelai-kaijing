'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ERP_DEMO_BINS } from '@/lib/crossborder/erp-ued-data'
import { INITIAL_WAREHOUSES } from '@/lib/crossborder/platform-basics-data'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { LocaleLink } from '@/lib/i18n/navigation'
import { useWarehouseZones } from '@/lib/crossborder/warehouse-zone-store'

export default function WarehousePage() {
  const [bins, setBins] = React.useState(ERP_DEMO_BINS)
  const zones = useWarehouseZones()
  const zoneOptions = zones.filter((zone) => zone.status === '启用').map((zone) => zone.name)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? <UedDialog title="新增仓库库位" description="同一仓库内库位编码必须唯一。" fields={[
        { key: 'warehouse', label: '仓库', options: INITIAL_WAREHOUSES.map((item) => `${item.name} (${item.code})`), required: true },
        { key: 'code', label: '库位编码', placeholder: '如 A-01-01-03', required: true, helper: '同一仓库内库位编码必须唯一' },
        { key: 'zone', label: '库区', options: zoneOptions.length > 0 ? zoneOptions : ['A 区', 'B 区', 'C 区'], required: true },
        { key: 'sku', label: '绑定内部 SKU', options: ['不绑定', 'HSY000001001', 'HSY000001002', 'HSY000002001'], required: true },
        { key: 'status', label: '库位状态', options: ['空闲', '占用', '锁定'], required: true },
        { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
      ]} onClose={() => setOpen(false)} onSave={() => { setBins((current) => [...current, { warehouse: 'WH-CN-XMN-001', code: `A-01-01-0${current.length + 2}`, sku: '—', status: '空闲' }]); setOpen(false); setNotice('库位已加入本次原型会话。') }} /> : null
  return <>{editor}<UedWorkspace title="仓库与库位" description="公司仓库可由多个店铺复用；库位绑定启用 SKU 并保留历史。" rows={bins} detailHref={(row) => `/console/warehouse/${encodeURIComponent(row.code)}`} searchKeys={['warehouse', 'code', 'sku', 'status']} addLabel="新增库位" onAdd={() => setOpen(true)} columns={[
    { key: 'warehouse', label: '仓库' }, { key: 'code', label: '库位编码' }, { key: 'sku', label: '绑定 SKU' }, { key: 'status', label: '库位状态', render: (row) => <Badge variant={row.status === '占用' ? 'secondary' : 'outline'}>{row.status}</Badge> }, { key: 'warehouse', label: '關联仓库', render: () => INITIAL_WAREHOUSES.map((warehouse) => warehouse.name).join('、') },
  ]}>
    <UedPrototypeNotice>数据库强校验：同一仓库库位编码唯一；一个有效库位只能绑定一个启用 SKU。解绑或换绑应留历史。</UedPrototypeNotice>
    <div className="flex flex-wrap gap-2">{INITIAL_WAREHOUSES.map((warehouse) => <Button key={warehouse.code} variant="outline" size="sm" onClick={() => setNotice(`${warehouse.name}：${warehouse.shops.length} 个示例店铺可选`) }>{warehouse.name} · {warehouse.code}</Button>)}<Button variant="outline" size="sm" asChild><LocaleLink href="/console/warehouse-zones">管理库区</LocaleLink></Button></div>
    {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
  </UedWorkspace></>
}
