'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ERP_DEMO_IMPORTS, type DemoImport } from '@/lib/crossborder/erp-ued-data'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table'
import { LocaleLink } from '@/lib/i18n/navigation'

export default function ImportsPage() {
  const [rows, setRows] = React.useState<DemoImport[]>(ERP_DEMO_IMPORTS)
  const [open, setOpen] = React.useState(false)
  const [preview, setPreview] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? <UedDialog title="创建导入批次" description="原型模拟模板类型与数据校验，不会上传文件或写入数据库。" fields={[
        { key: 'kind', label: '导入类型', options: ['仓库 / 库位', '商品 / SKU', 'Seller SKU 映射', '期初库存', '历史订单'], required: true },
        { key: 'file', label: '来源文件名', required: true, placeholder: '如 seller_sku_mapping_oct.xlsx' },
        { key: 'templateVersion', label: '模板版本', options: ['v2026-10', 'v2026-09'], required: true },
        { key: 'duplicate', label: '重复记录处理', options: ['阻止冲突行', '仅更新允许字段'], required: true },
        { key: 'rollback', label: '回滚策略', options: ['允许回滚', '仅补偿'], required: true },
        { key: 'operator', label: '操作人', required: true },
        { key: 'remark', label: '导入说明', type: 'textarea', fullWidth: true },
      ]} onClose={() => setOpen(false)} onSave={() => { setRows((current) => [{ id: `IMP-2026-${String(current.length + 22).padStart(4, '0')}`, file: 'new_import.xlsx', kind: '期初库存', createdAt: '刚刚', success: 0, errors: 0, status: '待确认', rollback: '未执行' }, ...current]); setOpen(false); setNotice('导入批次草稿已建立；尚未上传或处理真实文件。') }} /> : null
  return <>{editor}<UedWorkspace title="数据导入与迁移" description="模板下载 → 上传校验 → 错误行隔离 → 确认写入 → 受控回滚；批次全程可追溯。" rows={rows} detailHref={(row) => `/console/settings/imports/${encodeURIComponent(row.id)}`} searchKeys={['id', 'file', 'kind', 'status']} addLabel="新建导入" onAdd={() => setOpen(true)} columns={[
    { key: 'id', label: '批次号' }, { key: 'file', label: '来源文件' }, { key: 'kind', label: '数据类型' }, { key: 'createdAt', label: '创建时间' }, { key: 'success', label: '成功行' }, { key: 'errors', label: '错误行' }, { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '异常' ? 'destructive' : 'secondary'}>{row.status}</Badge> }, { key: 'rollback', label: '回滚能力' },
  ]}>
    <UedPrototypeNotice>导入错误行与正确行隔离；涉及后续业务流水的批次不可物理删除，需走补偿。库存中的文字值或“无进货”状态必须显式确认。</UedPrototypeNotice>
    <div className="flex flex-wrap gap-2">{['仓库 / 库位', '商品 / SKU', 'Seller SKU 映射', '期初库存', '历史订单'].map((template) => <Button key={template} variant="outline" size="sm" onClick={() => setNotice(`已选择「${template}」模板（示例）；下一步上传并映射字段。`)}>下载{template}模板</Button>)}<Button variant="outline" size="sm" asChild><LocaleLink href="/console/settings/import-templates">管理导入模板</LocaleLink></Button></div>
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3"><span className="text-sm">导入预览样例：Seller SKU 映射</span><Button size="sm" onClick={() => setPreview((current) => !current)}>{preview ? '隐藏校验预览' : '查看字段校验预览'}</Button>{preview ? <Badge variant="secondary">预览，不写入</Badge> : null}</div>
    {preview ? <div className="overflow-hidden rounded-lg border"><Table><TableHeader><TableRow><TableHead>原文件行</TableHead><TableHead>Seller SKU</TableHead><TableHead>内部 SKU</TableHead><TableHead>校验结果</TableHead><TableHead>建议处理</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>2</TableCell><TableCell>TEE-BLK-L</TableCell><TableCell>HSY000001001</TableCell><TableCell><Badge variant="secondary">可导入</Badge></TableCell><TableCell>创建映射</TableCell></TableRow><TableRow><TableCell>3</TableCell><TableCell>TEE-BLK-L</TableCell><TableCell>HSY000001002</TableCell><TableCell><Badge variant="destructive">冲突</Badge></TableCell><TableCell>同店 Seller SKU 重复，先核对</TableCell></TableRow><TableRow><TableCell>4</TableCell><TableCell>TEE-NEW-XL</TableCell><TableCell>SKU-UNKNOWN</TableCell><TableCell><Badge variant="outline">需确认</Badge></TableCell><TableCell>内部 SKU 不存在</TableCell></TableRow></TableBody></Table><div className="flex flex-wrap justify-between gap-2 border-t p-3"><p className="text-sm text-muted-foreground">1 行可导入 · 1 行冲突 · 1 行需确认；错误行不会写入。</p><Button variant="outline" onClick={() => setNotice('确认导入被保留为原型动作；示例阶段不会写入业务数据。')}>确认导入（原型）</Button></div></div> : null}
    {rows.filter((row) => row.errors > 0).map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 p-3 text-sm"><span>{row.file} · {row.errors} 行需修复：重复 Seller SKU、未知内部 SKU（示例）</span><Button variant="outline" size="sm" onClick={() => setNotice(`${row.id} 错误行报告已准备（原型，无真实文件）。`)}>查看错误行</Button></div>)}{rows.filter((row) => row.rollback === '可撤销' || row.rollback === '允许回滚' || row.status === '已审核' || row.status === '异常').slice(0, 3).map((row) => (
      <div key={`rb-${row.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
        <span>{row.id} · {row.kind} · 回滚策略：{row.rollback}</span>
        <Button variant="outline" size="sm" onClick={() => setNotice(`${row.id} 已标记为补偿回滚（原型会话，未改业务库）。`)}>执行受控回滚</Button>
      </div>
    ))}
    <div className="rounded-lg border p-4 text-sm text-muted-foreground space-y-1">
      <p className="font-medium text-foreground">导入能力清单</p>
      <p>支持类型：仓库/库位 · 商品/SKU · Seller SKU 映射 · 期初库存 · 历史订单</p>
      <p>校验：必填列、类型、店铺范围、内部 SKU 存在性、同店 Seller SKU 唯一</p>
      <p>隔离：错误行不写入；可下载错误报告；成功行可受控回滚或补偿</p>
    </div>
    {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
  </UedWorkspace></>
}
