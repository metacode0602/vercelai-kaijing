'use client'

import * as React from 'react'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'

export default function AuditEventsPage() {
  const listQuery = trpc.audit.list.useQuery({ page: 1, pageSize: 100 })
  const rows = listQuery.data?.items ?? []

  return (
    <UedWorkspace
      title="变更审计"
      description="audit_events：谁在何时对何对象做了什么。"
      rows={rows}
      searchKeys={['id', 'actor', 'action', 'object', 'entityType', 'result', 'detail']}
      searchPlaceholder="搜索操作人、对象或动作"
      emptyText={listQuery.isLoading ? '加载中…' : '暂无审计事件。业务写操作落库后会在此显示。'}
      columns={[
        { key: 'at', label: '时间' },
        { key: 'actor', label: '操作人' },
        { key: 'action', label: '动作' },
        { key: 'object', label: '对象' },
        { key: 'entityType', label: '类型' },
        { key: 'result', label: '结果', render: (row) => <Badge variant="secondary">{row.result}</Badge> },
        { key: 'detail', label: '详情' },
      ]}
    >
      <UedPrototypeNotice>已接 audit_events 表；不再使用 localStorage DEMO。本页只读列表。</UedPrototypeNotice>
    </UedWorkspace>
  )
}
