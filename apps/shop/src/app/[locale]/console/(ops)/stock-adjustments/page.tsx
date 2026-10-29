'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type AdjustmentRow = {
  id: string
  type: string
  sku: string
  warehouse: string
  bin: string
  before: number
  delta: number
  after: number
  reason: string
  applicant: string
  status: string
}

export const DEMO_ADJUSTMENTS: AdjustmentRow[] = [
  { id: 'ADJ-2026-0018', type: '盘亏', sku: 'HSY000001001', warehouse: 'WH-CN-XMN-001', bin: 'A-01-01-01', before: 46, delta: -1, after: 45, reason: '月度盘点差异（示例）', applicant: '兰雨晨', status: '待审批' },
  { id: 'ADJ-2026-0017', type: '报损', sku: 'HSY000002001', warehouse: 'WH-CN-XMN-001', bin: 'B-02-01-01', before: 86, delta: -1, after: 85, reason: '运输破损（示例）', applicant: '仓库员', status: '已通过' },
  { id: 'ADJ-2026-0016', type: '库位转移', sku: 'HSY000001002', warehouse: 'WH-CN-XMN-001', bin: 'A-01-01-02 → C-01-01-01', before: 12, delta: 0, after: 12, reason: '库位整理（示例）', applicant: '仓库员', status: '已通过' },
  { id: 'ADJ-2026-0015', type: '盘盈', sku: 'HSY000001001', warehouse: 'WH-CN-XMN-001', bin: 'A-01-01-01', before: 45, delta: 1, after: 46, reason: '漏记回库（示例）', applicant: '兰雨晨', status: '已驳回' },
]

export default function StockAdjustmentsPage() {
  const [rows, setRows] = React.useState<AdjustmentRow[]>(DEMO_ADJUSTMENTS)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? (
    <UedDialog
      title="发起盘点 / 调整"
      description="调整不直接改余额：生成调整单 → 审批通过 → 记账并追加流水，保留前后数量与原因。"
      fields={[
        { key: 'type', label: '调整类型', options: ['盘点', '盘盈', '盘亏', '报损', '库位转移'], required: true },
        { key: 'sku', label: '内部 SKU', options: ['HSY000001001', 'HSY000001002', 'HSY000002001'], required: true },
        { key: 'warehouse', label: '仓库', options: ['WH-CN-XMN-001'], required: true },
        { key: 'bin', label: '库位', options: ['A-01-01-01', 'A-01-01-02', 'B-02-01-01'], required: true },
        { key: 'targetBin', label: '目标库位', options: ['A-01-01-01', 'A-01-01-02', 'C-01-01-01'], helper: '仅库位转移时填写' },
        { key: 'delta', label: '实盘 / 调整数量', type: 'number', required: true, helper: '盘亏、报损填写负数' },
        { key: 'reason', label: '原因 / 证据单号', type: 'textarea', required: true, fullWidth: true },
        { key: 'applicant', label: '申请人', required: true },
        { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={() => {
        setRows((current) => [
          {
            id: `ADJ-2026-${String(current.length + 19).padStart(4, '0')}`,
            type: '盘点',
            sku: 'HSY000001001',
            warehouse: 'WH-CN-XMN-001',
            bin: 'A-01-01-01',
            before: 46,
            delta: 1,
            after: 47,
            reason: '人工盘点（示例）',
            applicant: '当前用户',
            status: '待审批',
          },
          ...current,
        ])
        setOpen(false)
        setNotice('调整单已提交审批（原型）；审批通过前余额不变。')
      }}
    />
  ) : null
  function decide(id: string, approved: boolean) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status: approved ? '已通过' : '已驳回' } : row)))
    setNotice(`${id} ${approved ? '审批通过并记账（原型）' : '已驳回，余额未变化'}。`)
  }
  return (
    <>
      {editor}
      <UedWorkspace
        title="盘点与调整"
        description="盘点任务、差异确认、报损与库位转移都在此审批记账；保留前后数量与原因。"
        rows={rows} detailHref={(row) => `/console/stock-adjustments/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'type', 'sku', 'bin', 'applicant', 'status']}
        searchPlaceholder="搜索调整单号、类型或 SKU"
        filters={[{ label: '状态', options: ['待审批', '已通过', '已驳回'] }]}
        addLabel="发起盘点 / 调整"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '调整单号' },
          { key: 'type', label: '类型' },
          { key: 'sku', label: '内部 SKU' },
          { key: 'warehouse', label: '仓库', render: (row) => row.warehouse },
          { key: 'bin', label: '库位' },
          { key: 'before', label: '调整前', render: (row) => String(row.before) },
          { key: 'delta', label: '差异', render: (row) => <span className={row.delta < 0 ? 'text-destructive' : undefined}>{row.delta > 0 ? `+${row.delta}` : row.delta}</span> },
          { key: 'after', label: '调整后', render: (row) => String(row.after) },
          { key: 'reason', label: '原因' },
          { key: 'applicant', label: '申请人' },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '已驳回' ? 'destructive' : row.status === '待审批' ? 'outline' : 'secondary'}>{row.status}</Badge> },
        ]}
      >
        <UedPrototypeNotice>
          调整和报损的审批门槛（金额/数量阈值、审批人）待 Q11 确认；审批链上保留申请、审批、记账三个时间点与操作者。更正历史一律创建反向流水，不允许编辑或删除已记账记录。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows.filter((row) => row.status === '待审批').map((row) => (
            <React.Fragment key={row.id}>
              <Button size="sm" onClick={() => decide(row.id, true)}>通过 · {row.id}</Button>
              <Button variant="outline" size="sm" onClick={() => decide(row.id, false)}>驳回</Button>
            </React.Fragment>
          ))}
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
