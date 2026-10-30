'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  SYNC_TASK_STATUSES,
  countSyncTasksByStatus,
  retrySyncTask,
  useSyncTasks,
} from '@/lib/crossborder/sync-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function statusVariant(status: string) {
  if (status === '失败') return 'destructive' as const
  if (status === '部分失败') return 'outline' as const
  if (status === '成功') return 'secondary' as const
  return 'outline' as const
}

export default function SyncTasksPage() {
  const tasks = useSyncTasks()
  const counts = React.useMemo(() => countSyncTasksByStatus(tasks), [tasks])
  const [notice, setNotice] = React.useState('')

  const kpiItems = React.useMemo(
    () => [
      { label: '任务数', value: String(tasks.length), hint: '当前原型会话' },
      { label: '成功', value: String(counts.成功) },
      { label: '失败', value: String(counts.失败) },
      { label: '部分失败', value: String(counts.部分失败) },
      { label: '排队 / 运行', value: String(counts.排队) },
    ],
    [tasks.length, counts],
  )

  function retry(id: string) {
    const result = retrySyncTask(id)
    setNotice(result.ok ? `${result.task.id} 已排队重试（原型，未调用平台）` : result.reason)
  }

  return (
    <UedWorkspace
      title="发布与同步任务"
      description="发布 / 库存 / 价格 / 状态 / 订单 / 评论同步任务：进度、错误摘要与人工重试；通过 request id 关联接口日志。"
      rows={tasks}
      detailHref={(row) => `/console/sync-tasks/${encodeURIComponent(row.id)}`}
      searchKeys={['id', 'type', 'target', 'shop', 'error', 'status', 'requestId']}
      searchPlaceholder="搜索任务号、类型、店铺、错误码或 request id"
      filters={[{ label: '状态', options: [...SYNC_TASK_STATUSES] }]}
      emptyText="暂无同步任务。店铺授权后由调度创建任务；可在店铺连接暂停自动同步。"
      columns={[
        { key: 'id', label: '任务号' },
        { key: 'type', label: '任务类型' },
        { key: 'target', label: '目标' },
        { key: 'shop', label: '店铺' },
        { key: 'progress', label: '进度' },
        { key: 'error', label: '错误' },
        { key: 'retries', label: '重试', render: (row) => String(row.retries) },
        { key: 'requestId', label: 'Request ID' },
        { key: 'lastRun', label: '最近执行' },
        {
          key: 'status',
          label: '状态',
          render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
        },
      ]}
    >
      <DetailKpiRow items={kpiItems} />
      <UedPrototypeNotice>
        本页是「任务视角」；设置 · 接口日志是「HTTP 流水视角」。两者通过 request id 关联。重试不改变业务审批状态，也不调用真实平台 connector。
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        {tasks
          .filter((row) => row.status === '失败' || row.status === '部分失败')
          .map((row) => (
            <React.Fragment key={row.id}>
              <Button size="sm" onClick={() => retry(row.id)}>
                重试 · {row.id}
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <LocaleLink
                  href={`/console/settings/integration-log?requestId=${encodeURIComponent(row.requestId)}`}
                >
                  接口日志 · {row.requestId}
                </LocaleLink>
              </Button>
            </React.Fragment>
          ))}
      </div>
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </UedWorkspace>
  )
}
