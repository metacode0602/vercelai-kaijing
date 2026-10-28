'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Button } from '@workspace/ui/components/button'
import { Badge } from '@workspace/ui/components/badge'
import { ERP_DEMO_MAPPINGS } from '@/lib/crossborder/erp-ued-data'

type Shipment = { id: string; order: string; shop: string; site: string; mode: string; packageId: string; tracking: string; carrier: string; warehouse: string; status: string; events: string[] }

const initialShipments: Shipment[] = [
  { id: 'SHP-2026-10018', order: 'DZ-10018', shop: 'Daraz LK', site: 'LK', mode: '平台物流', packageId: 'PKG-DZ-10018', tracking: 'DZLK9981', carrier: 'Daraz Express', warehouse: 'WH-CN-XMN-001', status: '运输中', events: ['仓库出库 · 2026-10-20 10:20', '承运商揽收 · 2026-10-20 14:10'] },
  { id: 'SHP-2026-2201', order: 'LZ-2201', shop: 'Lazada TH', site: 'TH', mode: 'JSB 灰清', packageId: 'PKG-LZ-2201', tracking: 'THJSB-8821', carrier: 'JSB', warehouse: 'WH-CN-XMN-001', status: '待交接 JSB', events: ['仓库出库 · 2026-10-28 08:40'] },
]

const eventOptions = ['仓库拣货完成', '仓库出库', 'LGS 揽收', '交接 JSB', '清关中', '清关完成', '官方尾程派送', '已签收', '物流异常']

export default function ShipmentsPage() {
  const [rows, setRows] = React.useState(initialShipments)
  const [selected, setSelected] = React.useState(initialShipments[0]?.id ?? '')
  const [eventOpen, setEventOpen] = React.useState(false)
  const [eventTarget, setEventTarget] = React.useState(initialShipments[0]?.id ?? '')
  const [notice, setNotice] = React.useState('')
  const current = rows.find((row) => row.id === selected)
  const sellerSkuSamples = ERP_DEMO_MAPPINGS.slice(0, 2).map((item) => item.sellerSku)
  const editor = eventOpen ? <UedDialog title={current?.id === eventTarget ? '追加包裹履约事件' : '创建包裹 / 履约记录'} description="原型展示表单与事件轨迹；不会创建真实运单。" fields={[{ label: '关联订单', options: ['DZ-10021', 'DZ-10018', 'LZ-2201'] }, { label: '履约事件', options: eventOptions }, { label: '事件时间', type: 'datetime-local' }, { label: '运单号' }, { label: '承运商', options: ['LGS', 'JSB', '平台官方尾程'] }, { label: '异常说明' }]} onClose={() => setEventOpen(false)} onSave={() => { if (eventTarget && rows.some((row) => row.id === eventTarget)) { const nextEvent = '人工更新状态'; setRows((currentRows) => currentRows.map((row) => row.id === eventTarget ? { ...row, status: nextEvent, events: [...row.events, `${nextEvent} · 刚刚（人工示例）`] } : row)); setSelected(eventTarget); setNotice('履约事件已追加到所选包裹（本地示例）。') } else { const newId = `SHP-2026-${rows.length + 31}`; setRows((currentRows) => [{ id: newId, order: 'DZ-10021', shop: 'Daraz LK', site: 'LK', mode: 'LGS', packageId: `PKG-DEMO-${currentRows.length + 31}`, tracking: '待同步', carrier: 'LGS', warehouse: 'WH-CN-XMN-001', status: '待拣货', events: ['包裹已创建 · 刚刚（示例）'] }, ...currentRows]); setSelected(newId); setNotice('包裹记录已加入本次原型会话。') } setEventOpen(false) }} /> : null
  return <>{editor}<UedWorkspace title="包裹与物流" description="一单可多包裹；按站点履约模式展示 LGS 或 TH/JSB 状态链。" rows={rows} searchKeys={['id', 'order', 'shop', 'site', 'mode', 'packageId', 'tracking', 'carrier', 'status']} addLabel="新建包裹" onAdd={() => { setEventTarget(''); setEventOpen(true) }} columns={[
    { key: 'id', label: '包裹号' }, { key: 'order', label: '订单号' }, { key: 'shop', label: '店铺 / 站点', render: (row) => `${row.shop} · ${row.site}` }, { key: 'mode', label: '履约模式' }, { key: 'tracking', label: '运单号' }, { key: 'carrier', label: '承运商' }, { key: 'warehouse', label: '发货仓' }, { key: 'status', label: '当前状态', render: (row) => <Badge variant="secondary">{row.status}</Badge> },
  ]}>
    <UedPrototypeNotice>MY/PH/SG/VN 以 LGS 事件链展示；TH 展示自营仓→JSB交接→清关→官方尾程。接口能力未确认时，事件可人工录入并标记来源。</UedPrototypeNotice>
    <div className="flex flex-wrap gap-2">{rows.map((row) => <Button key={row.id} variant={selected === row.id ? 'secondary' : 'outline'} size="sm" onClick={() => setSelected(row.id)}>{row.packageId} · {row.status}</Button>)}{current ? <Button size="sm" onClick={() => { setEventTarget(current.id); setEventOpen(true) }}>追加履约事件</Button> : null}</div>
    {current ? <div className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-medium">{current.packageId} · {current.order}</h2><p className="mt-1 text-sm text-muted-foreground">{current.mode} · {current.carrier} · {current.tracking}</p></div><Badge variant="outline">事件来源：人工示例</Badge></div><ol className="mt-4 flex flex-col gap-2 border-l pl-4">{current.events.map((event, index) => <li key={`${event}-${index}`} className="text-sm">{event}</li>)}</ol><p className="mt-4 text-xs text-muted-foreground">订单行示例 Seller SKU：{sellerSkuSamples.join('、')}</p></div> : null}
    {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
  </UedWorkspace></>
}
