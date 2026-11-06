'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { trpc } from '@/lib/trpc/client'

export default function ImportTemplatesPage() {
  const utils = trpc.useUtils()
  const listQuery = trpc.importTemplates.list.useQuery({ page: 1, pageSize: 100 })
  const rows = listQuery.data?.items ?? []
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const createMutation = trpc.importTemplates.create.useMutation({
    onSuccess: async () => {
      setOpen(false)
      setNotice('模板已落库。批量导入作业执行仍待导入流水。')
      await utils.importTemplates.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })

  const editor = open ? (
    <UedDialog
      title="新增导入模板"
      description="模板配置落库；实际批处理执行仍待导入作业。"
      fields={[
        { key: 'kind', label: '导入类型', options: ['仓库 / 库位', '商品 / SKU', 'Seller SKU 映射', '期初库存', '历史订单'], required: true },
        { key: 'version', label: '模板版本', required: true, placeholder: '如 v2026-11' },
        { key: 'fields', label: '字段清单', type: 'textarea', required: true, fullWidth: true },
        { key: 'duplicateStrategy', label: '重复记录处理', options: ['阻止冲突行', '仅更新允许字段'], required: true },
        { key: 'rollbackStrategy', label: '回滚策略', options: ['允许回滚', '仅补偿'], required: true },
        { key: 'status', label: '状态', options: ['启用', '停用'], required: true },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        createMutation.mutate({
          kind: values.kind || '仓库 / 库位',
          version: values.version || 'v1',
          fields: values.fields || '',
          duplicateStrategy: values.duplicateStrategy || '阻止冲突行',
          rollbackStrategy: values.rollbackStrategy || '允许回滚',
          status: values.status === '停用' ? '停用' : '启用',
          note: values.note || '',
        })
      }}
      saveLabel="保存模板"
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="导入模板"
        description="commerce_import_templates；保存即生效，不设假审批成功。"
        rows={rows}
        detailHref={(row) => `/console/settings/import-templates/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'kind', 'version', 'fields', 'status']}
        searchPlaceholder="搜索导入类型、版本或字段"
        addLabel="新增模板"
        onAdd={() => setOpen(true)}
        emptyText={listQuery.isLoading ? '加载中…' : '暂无模板。可新增配置；批量导入作业仍待接入。'}
        columns={[
          { key: 'id', label: '模板 ID' },
          { key: 'kind', label: '导入类型' },
          { key: 'version', label: '版本' },
          { key: 'fields', label: '字段清单' },
          { key: 'duplicateStrategy', label: '重复记录' },
          { key: 'rollbackStrategy', label: '回滚策略' },
          {
            key: 'status',
            label: '状态',
            render: (row) => <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>,
          },
          { key: 'updatedAt', label: '更新时间' },
        ]}
      >
        <UedPrototypeNotice>配置已接库；执行导入流水 / 回滚作业仍待平台与作业调度。</UedPrototypeNotice>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
