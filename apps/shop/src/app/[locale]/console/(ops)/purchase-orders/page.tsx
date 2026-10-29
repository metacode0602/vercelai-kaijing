'use client'

import * as React from 'react'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type PurchaseOrderRow = {
  id: string
  sourceRequest: string
  supplier: string
  sku: string
  quantity: number
  unitPrice: number
  currency: string
  expectedAt: string
  warehouse: string
  status: string
}

export const DEMO_ORDERS: PurchaseOrderRow[] = [
  { id: 'PO-2026-0031', sourceRequest: 'PR-2026-0011', supplier: '泉州联创数码配件厂', sku: 'HSY000002001', quantity: 50, unitPrice: 62, currency: 'CNY', expectedAt: '2026-11-14', warehouse: 'WH-CN-XMN-001', status: '待发货' },
  { id: 'PO-2026-0030', sourceRequest: 'PR-2026-0009', supplier: '厦门优品服饰有限公司', sku: 'HSY000001002', quantity: 80, unitPrice: 29, currency: 'CNY', expectedAt: '2026-11-05', warehouse: 'WH-CN-XMN-001', status: '部分到货' },
  { id: 'PO-2026-0028', sourceRequest: 'PR-2026-0004', supplier: '厦门优品服饰有限公司', sku: 'HSY000001001', quantity: 100, unitPrice: 28, currency: 'CNY', expectedAt: '2026-10-20', warehouse: 'WH-CN-XMN-001', status: '已完成' },
]

export default function PurchaseOrdersPage() {
  const [rows, setRows] = React.useState<PurchaseOrderRow[]>(DEMO_ORDERS)
  const [notice, setNotice] = React.useState('')
  function advance(id: string, status: PurchaseOrderRow['status']) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status } : row)))
    setNotice(`${id} 推进为「${status}」（原型会话）；到货登记在「到货质检入库」完成。`)
  }
  return (
    <UedWorkspace
      title="采购单"
      description="仅由已审核申请生成；价格与数量取自申请行，预计到货按供应商交期推算。"
      rows={rows} detailHref={(row) => `/console/purchase-orders/${encodeURIComponent(row.id)}`}
      searchKeys={['id', 'sourceRequest', 'supplier', 'sku', 'status']}
      searchPlaceholder="搜索采购单号、申请号或供应商"
      filters={[{ label: '状态', options: ['待发货', '部分到货', '已完成', '已取消'] }]}
      columns={[
        { key: 'id', label: '采购单号' },
        { key: 'sourceRequest', label: '来源申请' },
        { key: 'supplier', label: '供应商' },
        { key: 'sku', label: '内部 SKU' },
        { key: 'quantity', label: '数量', render: (row) => String(row.quantity) },
        { key: 'unitPrice', label: '单价', render: (row) => `${row.unitPrice} ${row.currency}` },
        { key: 'expectedAt', label: '预计到货' },
        { key: 'warehouse', label: '收货仓库' },
        { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '已完成' ? 'secondary' : 'outline'}>{row.status}</Badge> },
      ]}
    >
      <UedPrototypeNotice>
        采购单不可手工创建，只能由审核通过的申请生成，保证「先审后买」。改价或改量必须回退申请重新审批；取消采购单会释放对应在途预估，但不直接改库存。
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        {rows.filter((row) => row.status === '待发货').map((row) => (
          <Button key={row.id} variant="outline" size="sm" onClick={() => advance(row.id, '部分到货')}>登记部分到货 · {row.id}</Button>
        ))}
        {rows.filter((row) => row.status === '部分到货').map((row) => (
          <Button key={`done-${row.id}`} size="sm" onClick={() => advance(row.id, '已完成')}>确认收货完成 · {row.id}</Button>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setNotice('催货通知已生成（原型，不会联系供应商）。')}>供应商催货</Button>
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>
  )
}
