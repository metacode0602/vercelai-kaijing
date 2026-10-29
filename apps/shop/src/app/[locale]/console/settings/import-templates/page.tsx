'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { addImportTemplate, useImportTemplates } from '@/lib/crossborder/import-template-store'

export default function ImportTemplatesPage() {
  const rows = useImportTemplates()
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const editor = open ? (
    <UedDialog
      title="新增导入模板"
      description="模板保存后立即生效，不需要审批；旧批次继续使用创建时的模板版本。"
      fields={[
        { key: 'kind', label: '导入类型', options: ['仓库 / 库位', '商品 / SKU', 'Seller SKU 映射', '期初库存', '历史订单'], required: true },
        { key: 'version', label: '模板版本', required: true, placeholder: '如 v2026-11' },
        { key: 'fields', label: '字段清单', type: 'textarea', required: true, fullWidth: true, placeholder: '逗号分隔，如 仓库编码, 库位编码, 库区' },
        { key: 'duplicateStrategy', label: '重复记录处理', options: ['阻止冲突行', '仅更新允许字段'], required: true },
        { key: 'rollbackStrategy', label: '回滚策略', options: ['允许回滚', '仅补偿'], required: true },
        { key: 'status', label: '状态', options: ['启用', '停用'], required: true },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        addImportTemplate(rows, {
          kind: values.kind || '仓库 / 库位',
          version: values.version || 'v2026-11',
          fields: values.fields || '待补充',
          duplicateStrategy: values.duplicateStrategy || '阻止冲突行',
          rollbackStrategy: values.rollbackStrategy || '允许回滚',
          status: values.status === '停用' ? '停用' : '启用',
          updatedAt: '2026-10-29',
          note: values.note || '',
        })
        setOpen(false)
        setNotice('模板已保存并立即生效；无需审批，旧批次继续使用原版本。')
      }}
      saveLabel="保存模板"
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="导入模板"
        description="维护各导入类型的字段、重复处理和回滚策略；保存即生效，不设版本审批。"
        rows={rows}
        detailHref={(row) => `/console/settings/import-templates/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'kind', 'version', 'fields', 'status']}
        searchPlaceholder="搜索导入类型、版本或字段"
        addLabel="新增模板"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '模板 ID' },
          { key: 'kind', label: '导入类型' },
          { key: 'version', label: '版本' },
          { key: 'fields', label: '字段清单' },
          { key: 'duplicateStrategy', label: '重复记录' },
          { key: 'rollbackStrategy', label: '回滚策略' },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge> },
          { key: 'updatedAt', label: '更新时间' },
        ]}
      >
        <UedPrototypeNotice>
          模板发布不需要审批，保存后新批次立即可用；旧批次保留创建时的模板版本，避免历史数据被新规则重算。
        </UedPrototypeNotice>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
