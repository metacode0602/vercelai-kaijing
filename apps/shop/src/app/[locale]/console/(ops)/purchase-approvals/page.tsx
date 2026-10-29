'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type ApprovalRow = {
  id: string
  applicant: string
  sku: string
  quantity: number
  unitPrice: number
  currency: string
  submittedAt: string
  approver: string
  opinion: string
  status: string
}

export const DEMO_APPROVALS: ApprovalRow[] = [
  { id: 'PR-2026-0012', applicant: '李萍', sku: 'HSY000001001', quantity: 100, unitPrice: 28, currency: 'CNY', submittedAt: '2026-10-28 09:40', approver: '杨洁 / 黄发聪', opinion: '—', status: '待审核' },
  { id: 'PR-2026-0010', applicant: '兰雨晨', sku: 'HSY000002001', quantity: 30, unitPrice: 62, currency: 'CNY', submittedAt: '2026-10-27 16:12', approver: '杨洁 / 黄发聪', opinion: '—', status: '待审核' },
  { id: 'PR-2026-0011', applicant: '杨洁', sku: 'HSY000002001', quantity: 50, unitPrice: 62, currency: 'CNY', submittedAt: '2026-10-27 11:05', approver: '黄发聪', opinion: '价格与上单一致，通过', status: '已审核' },
  { id: 'PR-2026-0008', applicant: '黄发聪', sku: 'HSY000001002', quantity: 80, unitPrice: 31, currency: 'CNY', submittedAt: '2026-10-24 14:22', approver: '杨洁', opinion: '单价高于近三单均价，暂缓', status: '已驳回' },
]

export default function PurchaseApprovalsPage() {
  const [rows, setRows] = React.useState<ApprovalRow[]>(DEMO_APPROVALS)
  const [notice, setNotice] = React.useState('')
  const [opinionFor, setOpinionFor] = React.useState<string | null>(null)
  function decide(id: string, approved: boolean) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? { ...row, status: approved ? '已审核' : '已驳回', opinion: approved ? '同意（原型）' : '不符合补货节奏（原型）' }
          : row,
      ),
    )
    setNotice(`${id} ${approved ? '已通过' : '已驳回'}（本次原型会话）；通过后可在「采购单」查看生成结果。`)
    setOpinionFor(null)
  }
  const editor = opinionFor ? (
    <UedDialog
      title={`填写审核意见 · ${opinionFor}`}
      description="审核意见随审批事件留痕；通过或驳回都会记录审核人与时间。"
      fields={[
        { key: 'decision', label: '审核结论', options: ['通过', '驳回'], required: true },
        { key: 'opinion', label: '审核意见', type: 'textarea', required: true, fullWidth: true, placeholder: '说明通过或驳回的依据' },
        { key: 'approver', label: '审核人', required: true, helper: '系统按互审规则自动分配，不允许自审' },
        { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpinionFor(null)}
      onSave={() => decide(opinionFor, true)}
      saveLabel="提交审核"
    />
  ) : null
  return (
    <>
      {editor}
      <UedWorkspace
        title="采购审核"
        description="审核队列按提交时间先进先出；自动分配审核人，互审规则强制执行。"
        rows={rows} detailHref={(row) => `/console/purchase-approvals/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'applicant', 'sku', 'approver', 'status']}
        searchPlaceholder="搜索申请号、申请人或 SKU"
        filters={[{ label: '状态', options: ['待审核', '已审核', '已驳回'] }]}
        columns={[
          { key: 'id', label: '申请单号' },
          { key: 'applicant', label: '申请人' },
          { key: 'sku', label: '内部 SKU' },
          { key: 'quantity', label: '数量', render: (row) => String(row.quantity) },
          { key: 'unitPrice', label: '单价', render: (row) => `${row.unitPrice} ${row.currency}` },
          { key: 'submittedAt', label: '提交时间' },
          { key: 'approver', label: '分配审核人' },
          { key: 'opinion', label: '审核意见' },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '待审核' ? 'outline' : row.status === '已驳回' ? 'destructive' : 'secondary'}>{row.status}</Badge> },
        ]}
      >
        <UedPrototypeNotice>
          互审规则：普通员工由杨洁或黄发聪审核；杨洁的申请由黄发聪审核、黄发聪的申请由杨洁审核，禁止自审——审核人字段在服务端按 approval_rules 校验，前端仅展示。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {['杨洁 ↔ 黄发聪 互审', '禁自审', '运营 / 美工申请仅可查看进度'].map((rule) => (
            <Badge key={rule} variant="outline">{rule}</Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {rows.filter((row) => row.status === '待审核').map((row) => (
            <React.Fragment key={row.id}>
              <Button size="sm" onClick={() => decide(row.id, true)}>通过 · {row.id}</Button>
              <Button variant="outline" size="sm" onClick={() => setOpinionFor(row.id)}>填写意见并驳回</Button>
            </React.Fragment>
          ))}
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
