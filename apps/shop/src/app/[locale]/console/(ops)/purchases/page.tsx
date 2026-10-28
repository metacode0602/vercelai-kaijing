'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ERP_DEMO_PURCHASES, type DemoPurchase } from '@/lib/crossborder/erp-ued-data'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function PurchasesPage() {
  const [rows, setRows] = React.useState<DemoPurchase[]>(ERP_DEMO_PURCHASES)
  const [open, setOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState('')
  const active = rows.find((row) => row.id === selected)
  function act(id: string, status: DemoPurchase['status']) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, status } : row))
    setNotice(`${id} 状态已更新为「${status}」（本次原型会话）。`)
  }
  const editor = open ? <UedDialog title="新建采购申请" description="提交后进入审核；此原型不创建正式采购单。" fields={[{ label: '采购原因', options: ['备货', '补货', '订单采购'] }, { label: '内部 SKU', options: ['HSY000001001', 'HSY000001002', 'HSY000002001'] }, { label: '申请数量', type: 'number' }, { label: '供应商', options: ['厦门优品服饰有限公司', '泉州联创数码配件厂'] }, { label: '采购单价', type: 'number' }, { label: '币种', options: ['CNY', 'USD'] }, { label: '预计到货日期', type: 'date' }, { label: '收货仓库', options: ['WH-CN-XMN-001'] }]} onClose={() => setOpen(false)} onSave={() => { setRows((current) => [{ id: `PR-2026-${String(current.length + 13).padStart(4, '0')}`, applicant: '当前用户', sku: 'HSY000001001', quantity: 20, supplier: '厦门优品服饰有限公司', unitPrice: 28, currency: 'CNY', warehouse: 'WH-CN-XMN-001', reason: '补货', status: '待审核', approver: '杨洁 / 黄发聪', received: 0, passed: 0 }, ...current]); setOpen(false); setNotice('采购申请已加入本次原型会话。') }} /> : null
  return <>{editor}<UedWorkspace title="采购管理" description="申请、互审、采购单、分批收货与质检入库分段记录。" rows={rows} searchKeys={['id', 'applicant', 'sku', 'supplier', 'status', 'approver']} addLabel="新建采购申请" onAdd={() => setOpen(true)} columns={[
    { key: 'id', label: '申请 / 采购单号' }, { key: 'applicant', label: '申请人' }, { key: 'sku', label: '内部 SKU' }, { key: 'quantity', label: '申请数量' }, { key: 'supplier', label: '供应商' }, { key: 'unitPrice', label: '单价', render: (row) => `${row.unitPrice} ${row.currency}` }, { key: 'warehouse', label: '收货仓库' }, { key: 'approver', label: '审核人' }, { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '待审核' ? 'outline' : 'secondary'}>{row.status}</Badge> }, { key: 'received', label: '到货 / 合格', render: (row) => `${row.received} / ${row.passed}` },
  ]}>
    <UedPrototypeNotice>审批规则：普通员工由杨洁或黄发聪审核；杨洁申请由黄发聪审核、黄发聪申请由杨洁审核；禁止自审。通过后才生成正式采购单。</UedPrototypeNotice>
    {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    <div className="flex flex-wrap gap-2">{rows.filter((row) => row.status === '待审核').map((row) => <React.Fragment key={row.id}><Button variant="outline" size="sm" onClick={() => { setSelected(row.id); act(row.id, '已审核') }}>审核通过 · {row.id}</Button><Button variant="ghost" size="sm" onClick={() => act(row.id, '已驳回')}>驳回</Button></React.Fragment>)}</div>
    <div className="flex flex-wrap gap-2">{rows.filter((row) => ['已审核', '部分收货', '待收货'].includes(row.status)).map((row) => <React.Fragment key={`receipt-${row.id}`}><Button variant="outline" size="sm" onClick={() => { setSelected(row.id); act(row.id, '待质检') }}>登记到货 · {row.id}</Button><Button variant="outline" size="sm" onClick={() => { act(row.id, '已入库') }}>确认质检并入库</Button></React.Fragment>)}</div>
    {active ? <p className="text-sm text-muted-foreground">已选 {active.id} · 采购 {active.quantity} · 到货 {active.received} · 合格 {active.passed}。状态节点为演示，不触发真实库存流水。</p> : null}
  </UedWorkspace></>
}
