'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ERP_DEMO_SUPPLIERS, type DemoSupplier } from '@/lib/crossborder/erp-ued-data'
import { Badge } from '@workspace/ui/components/badge'

export default function SuppliersPage() {
  const [rows, setRows] = React.useState<DemoSupplier[]>(ERP_DEMO_SUPPLIERS)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? <UedDialog title="新增供应商 / SKU 关系" description="保存为本次原型会话示例，不会写入服务器。" fields={[{ label: '供应商名称' }, { label: '内部 SKU', options: ['HSY000001001', 'HSY000001002', 'HSY000002001'] }, { label: '厂家款号' }, { label: '采购价' }, { label: '币种', options: ['CNY', 'USD'] }, { label: '预计交期（天）', type: 'number' }, { label: '生效日期', type: 'date' }]} onClose={() => setOpen(false)} onSave={() => { setRows((current) => [...current, { code: `SUP-${String(current.length + 1).padStart(4, '0')}`, name: '新供应商（示例）', contact: '待补充', phone: '—', sku: 'HSY000001001', factoryCode: '待补充', price: 30, currency: 'CNY', leadDays: 14, preferred: false, status: '待确认' }]); setOpen(false); setNotice('供应商映射已加入本次原型会话。') }} /> : null
  return <>{editor}<UedWorkspace title="供应商管理" description="维护供应商资料与 SKU 采购来源；历史价格按生效记录保留。" rows={rows} searchKeys={['code', 'name', 'contact', 'sku', 'factoryCode']} searchPlaceholder="搜索供应商、SKU 或厂家款号" addLabel="新增供应商映射" onAdd={() => setOpen(true)} columns={[
    { key: 'code', label: '供应商编码' }, { key: 'name', label: '供应商' }, { key: 'contact', label: '联系人' }, { key: 'sku', label: '内部 SKU' }, { key: 'factoryCode', label: '厂家款号' }, { key: 'price', label: '采购价', render: (row) => `${row.price} ${row.currency}` }, { key: 'leadDays', label: '交期' }, { key: 'preferred', label: '首选', render: (row) => row.preferred ? <Badge variant="secondary">首选</Badge> : '—' }, { key: 'status', label: '状态' },
  ]}>
    <UedPrototypeNotice>一个内部 SKU 可关联多个供应商；价格变更新增生效记录，不覆盖历史采购单价格。</UedPrototypeNotice>
    {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
  </UedWorkspace></>
}
