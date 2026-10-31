'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ERP_DEMO_ROLES } from '@/lib/crossborder/erp-ued-data'
import { useMembers } from '@/lib/crossborder/member-store'
import { Badge } from '@workspace/ui/components/badge'

type RoleRow = (typeof ERP_DEMO_ROLES)[number]

export default function AccessControlPage() {
  const [rows, setRows] = React.useState<RoleRow[]>(ERP_DEMO_ROLES)
  const members = useMembers()
  const personOptions = members.filter((member) => member.status === '启用').map((member) => member.name)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? <UedDialog title="新增业务角色" description="角色权限和负责范围仅保存在本次原型会话。" fields={[
        { key: 'role', label: '角色名称', required: true },
        { key: 'person', label: '人员', options: personOptions.length > 0 ? personOptions : ['杨洁'], required: true },
        { key: 'module', label: '模块', options: ['经营总览', '商品库', '采购', '库存', '订单与物流', '系统配置'], required: true },
        { key: 'permissions', label: '操作权限', options: ['查看', '新增 / 修改', '审核', '导出', '配置'], required: true },
        { key: 'scope', label: '数据范围', options: ['全组织', '平台', '国家 / 站点', '指定店铺'], required: true },
        { key: 'shops', label: '指定店铺', placeholder: '数据范围为指定店铺时填写', fullWidth: true },
        { key: 'note', label: '权限说明', type: 'textarea', fullWidth: true },
      ]} onClose={() => setOpen(false)} onSave={(values) => { setRows((current) => [...current, { role: values.role || '自定义角色（示例）', person: values.person || personOptions[0] || '待分配', scope: values.scope || '指定店铺', permissions: values.permissions || '查看', note: values.note || '待业务确认' }]); setOpen(false); setNotice('角色已加入本次原型会话；没有保存到权限服务。') }} /> : null
  return <>{editor}<UedWorkspace title="角色与数据范围" description="角色授予操作权限；平台 / 站点 / 店铺 scope 决定可见数据；采购互审：杨洁 ↔ 黄发聪。" rows={rows} detailHref={(row) => `/console/settings/erp-access/${encodeURIComponent(row.role)}`} searchKeys={['role', 'person', 'scope', 'permissions', 'note']} addLabel="新增角色" onAdd={() => setOpen(true)} columns={[
    { key: 'role', label: '角色' }, { key: 'person', label: '人员' }, { key: 'scope', label: '数据范围' }, { key: 'permissions', label: '权限摘要' }, { key: 'note', label: '规则 / 状态', render: (row) => <Badge variant={row.note.includes('待确认') || row.note.includes('需确认') ? 'outline' : 'secondary'}>{row.note}</Badge> },
  ]}>
    <UedPrototypeNotice>示例矩阵依据附件整理，仍待杨洁确认。外部 IT 的技术排查权不等于业务读写权限；服务端必须校验组织与 scope。</UedPrototypeNotice>
    <div className="flex flex-wrap gap-2">{['查看', '新增', '修改', '审核', '导出', '配置'].map((action) => <Badge key={action} variant="outline">{action}</Badge>)}</div>
    <div className="rounded-lg border p-4 text-sm space-y-2">
      <p className="font-medium">权限矩阵要点</p>
      <ul className="list-disc pl-5 text-muted-foreground space-y-1">
        <li>杨洁：ERP 业务负责人，全业务统筹；不能自审本人发起的采购申请</li>
        <li>黄发聪：采购负责人，与杨洁互审</li>
        <li>外部 IT 技术排查权 ≠ 业务读写；服务端必须校验组织与 scope</li>
        <li>蔡值：财务只读，不能导入账单或确认对账</li>
      </ul>
    </div>
    {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
  </UedWorkspace></>
}
