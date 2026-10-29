'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ERP_DEMO_AFTERSALES, type DemoAfterSale } from '@/lib/crossborder/erp-ued-data'
import { Badge } from '@workspace/ui/components/badge'

export default function AftersalesPage() {
  const [rows, setRows] = React.useState<DemoAfterSale[]>(ERP_DEMO_AFTERSALES)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  function inspect(row: DemoAfterSale) {
    if (row.returned > 0 && row.qc === '待质检') {
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, qc: '质检完成：可售 1', status: '已入库' } : item))
      setNotice(`${row.id}：质检后可售数量形成回库流水（原型）；退款不新增库存。`)
    } else {
      setNotice(`${row.id}：${row.type} · 退款 ${row.refund} ${row.currency} · ${row.qc}。`)
    }
  }
  const editor = open ? <UedDialog title="登记售后" description="关联原订单和订单行；未收到实物时不可登记质检入库。" fields={[
        { key: 'order', label: '平台订单号', required: true, placeholder: '如 DZ-10021' },
        { key: 'sku', label: '订单行 / 内部 SKU', options: ['HSY000001001', 'HSY000001002', 'HSY000002001'], required: true },
        { key: 'type', label: '售后类型', options: ['取消', '仅退款', '退货退款', '换货'], required: true },
        { key: 'reason', label: '售后原因', type: 'textarea', required: true, fullWidth: true },
        { key: 'refund', label: '退款金额', type: 'number', required: true },
        { key: 'currency', label: '币种', options: ['USD', 'MYR', 'LKR', 'THB'], required: true },
        { key: 'returned', label: '退货数量', type: 'number', helper: '仅退款填 0' },
        { key: 'qc', label: '质检 / 回库状态', options: ['不适用', '待质检', '质检完成：可售', '质检完成：残次'], required: true },
        { key: 'status', label: '售后状态', options: ['待确认', '已审核', '已驳回', '已入库'], required: true },
      ]} onClose={() => setOpen(false)} onSave={() => { setRows((current) => [{ id: `AS-2026-${String(current.length + 83).padStart(4, '0')}`, order: 'DZ-10021', sku: 'HSY000001001', type: '退货退款', reason: '示例录入', refund: 12.5, currency: 'USD', returned: 1, qc: '待质检', status: '待确认' }, ...current]); setOpen(false); setNotice('售后记录已加入本次原型会话。') }} /> : null
  return <>{editor}<UedWorkspace title="售后管理" description="退款与实物退货分开记录；只有质检可售数量进入可用库存。" rows={rows} detailHref={(row) => `/console/aftersales/${encodeURIComponent(row.id)}`} searchKeys={['id', 'order', 'sku', 'type', 'reason', 'status']} addLabel="登记售后" onAdd={() => setOpen(true)} columns={[
    { key: 'id', label: '售后单号' }, { key: 'order', label: '原订单' }, { key: 'sku', label: '内部 SKU' }, { key: 'type', label: '售后类型' }, { key: 'reason', label: '原因' }, { key: 'refund', label: '退款金额', render: (row) => `${row.refund} ${row.currency}` }, { key: 'returned', label: '退货数量' }, { key: 'qc', label: '质检 / 回库' }, { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '待确认' ? 'outline' : 'secondary'}>{row.status}</Badge> },
  ]}>
    <UedPrototypeNotice>取消订单释放库存的精确平台节点待 Q07/Q08 确认。仅退款不虚增库存；退货实物必须先收货、质检。</UedPrototypeNotice>
    <div className="flex flex-wrap gap-2">{rows.map((row) => <button key={row.id} type="button" onClick={() => inspect(row)} className="rounded-md border px-3 py-2 text-left text-sm hover:bg-muted">处理 {row.id}</button>)}</div>{notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
  </UedWorkspace></>
}
