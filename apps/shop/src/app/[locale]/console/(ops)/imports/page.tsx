'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ERP_DEMO_IMPORTS, type DemoImport } from '@/lib/crossborder/erp-ued-data'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function ImportsPage() {
  const [rows, setRows] = React.useState<DemoImport[]>(ERP_DEMO_IMPORTS)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? <UedDialog title="创建导入批次" description="原型模拟模板类型与数据校验，不会上传文件或写入数据库。" fields={[{ label: '导入类型', options: ['仓库 / 库位', '商品 / SKU', 'Seller SKU 映射', '期初库存', '历史订单'] }, { label: '来源文件名' }, { label: '重复记录处理', options: ['阻止冲突行', '仅更新允许字段'] }]} onClose={() => setOpen(false)} onSave={() => { setRows((current) => [{ id: `IMP-2026-${String(current.length + 22).padStart(4, '0')}`, file: 'new_import.xlsx', kind: '期初库存', createdAt: '刚刚', success: 0, errors: 0, status: '待确认', rollback: '未执行' }, ...current]); setOpen(false); setNotice('导入批次草稿已建立；尚未上传或处理真实文件。') }} /> : null
  return <>{editor}<UedWorkspace title="数据导入与迁移" description="模板校验、逐行错误、批次追溯与受控回滚。" rows={rows} searchKeys={['id', 'file', 'kind', 'status']} addLabel="新建导入" onAdd={() => setOpen(true)} columns={[
    { key: 'id', label: '批次号' }, { key: 'file', label: '来源文件' }, { key: 'kind', label: '数据类型' }, { key: 'createdAt', label: '创建时间' }, { key: 'success', label: '成功行' }, { key: 'errors', label: '错误行' }, { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '异常' ? 'destructive' : 'secondary'}>{row.status}</Badge> }, { key: 'rollback', label: '回滚能力' },
  ]}>
    <UedPrototypeNotice>导入错误行与正确行隔离；涉及后续业务流水的批次不可物理删除，需走补偿。库存中的文字值或“无进货”状态必须显式确认。</UedPrototypeNotice>
    <div className="flex flex-wrap gap-2">{['仓库 / 库位', '商品 / SKU', 'Seller SKU 映射', '期初库存', '历史订单'].map((template) => <Button key={template} variant="outline" size="sm" onClick={() => setNotice(`已选择「${template}」模板（示例）；下一步上传并映射字段。`)}>下载{template}模板</Button>)}</div>
    {rows.filter((row) => row.errors > 0).map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 p-3 text-sm"><span>{row.file} · {row.errors} 行需修复：重复 Seller SKU、未知内部 SKU（示例）</span><Button variant="outline" size="sm" onClick={() => setNotice(`${row.id} 错误行报告已准备（原型，无真实文件）。`)}>查看错误行</Button></div>)}{notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
  </UedWorkspace></>
}
