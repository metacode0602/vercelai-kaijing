'use client'

import * as React from 'react'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { appendAuditEvent, useAuditEvents } from '@/lib/crossborder/audit-store'
import { UedDialog } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function AuditEventsPage() {
  const rows = useAuditEvents()
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const editor = open ? (
    <UedDialog
      title="补录审计事件"
      description="对齐 audit_events：记录操作人、动作、对象与结果；仅写入本机原型会话。"
      fields={[
        { key: 'actor', label: '操作人', options: ['杨洁', '黄发聪'], required: true },
        { key: 'action', label: '动作', required: true, placeholder: '如 审核采购申请' },
        { key: 'object', label: '对象', required: true, placeholder: '如 PR-2026-0012' },
        {
          key: 'entityType',
          label: '对象类型',
          options: ['purchase', 'settlement', 'import', 'inventory', 'mapping', 'system'],
          required: true,
        },
        { key: 'result', label: '结果', options: ['成功', '失败', '已审核', '已确认', '已忽略'], required: true },
        { key: 'detail', label: '详情', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        appendAuditEvent({
          actor: values.actor || '杨洁',
          action: values.action || '手动补录',
          object: values.object || '—',
          entityType: values.entityType || 'system',
          result: values.result || '成功',
          detail: values.detail || '',
        })
        setOpen(false)
        setNotice('审计事件已写入本机会话。')
      }}
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="变更审计"
        description="audit_events：谁在何时对何对象做了什么；采购审核、结算确认、导入回滚等关键操作留痕。"
        rows={rows}
        searchKeys={['id', 'actor', 'action', 'object', 'entityType', 'result', 'detail']}
        searchPlaceholder="搜索操作人、对象或动作"
        filters={[
          { label: '对象类型', options: ['purchase', 'settlement', 'import', 'inventory', 'mapping', 'system'] },
        ]}
        addLabel="补录事件"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'at', label: '时间' },
          { key: 'actor', label: '操作人' },
          { key: 'action', label: '动作' },
          { key: 'object', label: '对象' },
          { key: 'entityType', label: '类型' },
          {
            key: 'result',
            label: '结果',
            render: (row) => <Badge variant="secondary">{row.result}</Badge>,
          },
          { key: 'detail', label: '详情' },
        ]}
      >
        <UedPrototypeNotice>
          对齐 schema audit_events。当前为 localStorage 原型，不接 tRPC / DB。审批人统一为杨洁 / 黄发聪。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setNotice(`共 ${rows.length} 条审计事件；最近：${rows[0]?.action ?? '无'} · ${rows[0]?.object ?? ''}`)
            }
          >
            刷新摘要
          </Button>
        </div>
        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </UedWorkspace>
    </>
  )
}
