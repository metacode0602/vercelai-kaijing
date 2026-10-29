'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ERP_DEMO_PURCHASES, type DemoPurchase } from '@/lib/crossborder/erp-ued-data'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type RequestRow = Omit<DemoPurchase, 'status'> & { status: string }

export default function PurchaseRequestsPage() {
  const [rows, setRows] = React.useState<RequestRow[]>(ERP_DEMO_PURCHASES)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? (
    <UedDialog
      title="新建采购申请"
      description="提交后进入采购审核队列（互审，禁自审）；通过后才生成正式采购单。"
      fields={[
        { key: 'reason', label: '采购原因', options: ['备货', '补货', '订单采购'], required: true },
        { key: 'sku', label: '内部 SKU', options: ['HSY000001001', 'HSY000001002', 'HSY000002001'], required: true },
        { key: 'quantity', label: '申请数量', type: 'number', required: true },
        { key: 'supplier', label: '供应商', options: ['厦门优品服饰有限公司', '泉州联创数码配件厂'], required: true },
        { key: 'unitPrice', label: '采购单价', type: 'number', required: true },
        { key: 'currency', label: '币种', options: ['CNY', 'USD'], required: true },
        { key: 'expectedAt', label: '期望到货日期', type: 'date', required: true },
        { key: 'warehouse', label: '收货仓库', options: ['WH-CN-XMN-001'], required: true },
        { key: 'priority', label: '优先级', options: ['普通', '紧急'], required: true },
        { key: 'remark', label: '申请说明', type: 'textarea', fullWidth: true, placeholder: '关联库存预警、活动备货或 AI 选品候选' },
      ]}
      onClose={() => setOpen(false)}
      onSave={() => {
        setRows((current) => [
          {
            id: `PR-2026-${String(current.length + 13).padStart(4, '0')}`,
            applicant: '当前用户',
            sku: 'HSY000001001',
            quantity: 20,
            supplier: '厦门优品服饰有限公司',
            unitPrice: 28,
            currency: 'CNY',
            warehouse: 'WH-CN-XMN-001',
            reason: '补货',
            status: '待审核',
            approver: '杨洁 / 黄发聪',
            received: 0,
            passed: 0,
          },
          ...current,
        ])
        setOpen(false)
        setNotice('采购申请已提交，进入「采购审核」队列（原型会话）。')
      }}
    />
  ) : null
  return (
    <>
      {editor}
      <UedWorkspace
        title="采购申请"
        description="全员可提交的补货入口：关联库存预警或 AI 选品候选，提交后由审核队列处理。"
        rows={rows} detailHref={(row) => `/console/purchase-requests/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'applicant', 'sku', 'supplier', 'reason', 'status']}
        searchPlaceholder="搜索申请号、SKU、申请人或供应商"
        filters={[{ label: '状态', options: ['草稿', '待审核', '已审核', '已驳回', '部分收货', '待收货', '已入库'] }]}
        addLabel="新建采购申请"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '申请单号' },
          { key: 'applicant', label: '申请人' },
          { key: 'reason', label: '采购原因' },
          { key: 'sku', label: '内部 SKU' },
          { key: 'quantity', label: '申请数量', render: (row) => String(row.quantity) },
          { key: 'supplier', label: '供应商' },
          { key: 'unitPrice', label: '单价', render: (row) => `${row.unitPrice} ${row.currency}` },
          { key: 'warehouse', label: '收货仓库' },
          { key: 'approver', label: '审核人' },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '待审核' ? 'outline' : 'secondary'}>{row.status}</Badge> },
        ]}
      >
        <UedPrototypeNotice>
          申请提交后进入采购审核队列：普通员工由杨洁或黄发聪审核，杨洁申请由黄发聪审核、黄发聪申请由杨洁审核，禁止自审。撤回仅限「待审核」状态；通过后由系统生成采购单，申请行不可再改。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows.filter((row) => row.status === '待审核').map((row) => (
            <Button key={row.id} variant="outline" size="sm" onClick={() => { setRows((current) => current.map((item) => (item.id === row.id ? { ...item, status: '草稿' } : item))); setNotice(`${row.id} 已撤回为草稿（原型）；可修改后重新提交。`) }}>撤回 · {row.id}</Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => setNotice('补货建议来源：库存预警「HSY000001002 可用 9 低于安全库存 20」（示例）。')}>从库存预警带入</Button>
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
