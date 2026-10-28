'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ERP_DEMO_INVENTORY } from '@/lib/crossborder/erp-ued-data'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type LedgerRow = { id: string; sku: string; warehouse: string; bin: string; type: string; before: number; delta: number; after: number; source: string; reason: string; actor: string; at: string; status: string }

const DEMO_LEDGER: LedgerRow[] = [
  { id: 'MOV-2026-10012', sku: 'HSY000001001', warehouse: 'WH-CN-XMN-001', bin: 'A-01-01-01', type: '采购入库', before: 30, delta: 20, after: 50, source: 'PO-2026-0031', reason: '合格入库', actor: '仓库员', at: '2026-10-28 09:15', status: '已记账' },
  { id: 'MOV-2026-10011', sku: 'HSY000001001', warehouse: 'WH-CN-XMN-001', bin: 'A-01-01-01', type: '订单锁定', before: 50, delta: -4, after: 46, source: 'DZ-10021', reason: '订单预留（示例）', actor: '系统', at: '2026-10-28 08:02', status: '已记账' },
]

export default function InventoryLedgerPage() {
  const [rows, setRows] = React.useState(DEMO_LEDGER)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? <UedDialog title="创建库存调整单" description="提交后等待业务审批规则确认；不直接修改库存余额。" fields={[{ label: '变动类型', options: ['盘盈', '盘亏', '报损', '库位转移'] }, { label: 'SKU', options: ['HSY000001001', 'HSY000001002', 'HSY000002001'] }, { label: '仓库', options: ['WH-CN-XMN-001'] }, { label: '库位', options: ['A-01-01-01', 'A-01-01-02', 'B-02-01-01'] }, { label: '变动数量', type: 'number' }, { label: '原因 / 来源单号' }]} onClose={() => setOpen(false)} onSave={() => { setRows((current) => [{ id: `ADJ-${current.length + 21}`, sku: 'HSY000001001', warehouse: 'WH-CN-XMN-001', bin: 'A-01-01-01', type: '盘点调整（草稿）', before: 46, delta: 1, after: 47, source: '待审批', reason: '人工盘点（示例）', actor: '当前用户', at: '刚刚', status: '待确认' }, ...current]); setOpen(false); setNotice('调整单已保存为本次原型草稿；余额未改变。') }} /> : null
  return <>{editor}<UedWorkspace title="库存流水与调整" description="库存变化追加记账，不允许直接编辑余额或删除历史流水。" rows={rows} searchKeys={['id', 'sku', 'warehouse', 'bin', 'type', 'source', 'actor']} addLabel="创建调整单" onAdd={() => setOpen(true)} columns={[
    { key: 'id', label: '流水 / 调整单' }, { key: 'sku', label: 'SKU' }, { key: 'warehouse', label: '仓库 / 库位', render: (row) => `${row.warehouse} · ${row.bin}` }, { key: 'type', label: '变动类型' }, { key: 'before', label: '变动前' }, { key: 'delta', label: '变化' }, { key: 'after', label: '变动后' }, { key: 'source', label: '来源单' }, { key: 'actor', label: '操作人' }, { key: 'at', label: '时间' }, { key: 'status', label: '状态', render: (row) => <Badge variant="secondary">{row.status}</Badge> },
  ]}>
    <UedPrototypeNotice>可用库存按“实际库存 − 锁定库存 − 不可售库存”计算；调整和报损的审批门槛待 Q11 确认。更正历史应创建反向流水。</UedPrototypeNotice>
    <div className="flex flex-wrap gap-2">{ERP_DEMO_INVENTORY.map((item) => <Button key={item.sku} variant="outline" size="sm" onClick={() => setNotice(`${item.sku} · ${item.warehouse}/${item.bin} · 账面 ${item.onHand} · 预留 ${item.reserved} · 残次 ${item.damaged} · 可用 ${item.onHand - item.reserved - item.damaged}`)}>{item.sku} 库存摘要</Button>)}</div>{notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
  </UedWorkspace></>
}
