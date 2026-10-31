'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailRelatedTables,
  DetailSection,
  StatusTimeline,
  parentsToFields,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { buildUedRelatedInfo } from '@/lib/console/related-info'
import {
  getLogsBySyncTask,
  retrySyncTask,
  toRelatedSyncTaskShape,
  useIntegrationLogs,
  useSyncTasks,
} from '@/lib/crossborder/sync-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

function statusVariant(status: string) {
  if (status === '失败') return 'destructive' as const
  if (status === '成功') return 'secondary' as const
  return 'outline' as const
}

export default function SyncTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const tasks = useSyncTasks()
  useIntegrationLogs()
  const task = tasks.find((item) => item.id === id)
  const [mounted, setMounted] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!task) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/sync-tasks"
          title={mounted ? '未找到同步任务' : '加载中…'}
          description={mounted ? `任务 ${id} 不存在。` : '正在读取本机原型会话…'}
        />
      </div>
    )
  }

  const logs = getLogsBySyncTask(task.id)
  const related = buildUedRelatedInfo('sync-tasks', toRelatedSyncTaskShape(task))
  const parentFields = parentsToFields(related.parents)
  const canRetry = task.status === '失败' || task.status === '部分失败'

  const timeline = [
    { at: task.createdAt, status: '创建', note: '任务入队', current: task.status === '排队' },
    {
      at: task.lastRun || '—',
      status: '执行',
      note: task.progress,
      current: task.status === '运行中' || task.status === '排队重试',
    },
    {
      at: task.lastRun || '—',
      status: task.status,
      note: task.error !== '—' ? task.error : '无错误',
      current: task.status === '成功' || task.status === '失败' || task.status === '部分失败',
    },
  ]

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[{ label: '发布与同步任务', href: '/console/sync-tasks' }, { label: task.id }]}
      />
      <DetailPageHeader
        backHref="/console/sync-tasks"
        title={task.id}
        description={`${task.type} · ${task.shop} · ${task.target}`}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
            <Badge variant={statusVariant(task.status)}>{task.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canRetry ? (
              <Button
                size="sm"
                onClick={() => {
                  const result = retrySyncTask(task.id)
                  setNotice(result.ok ? `${result.task.id} 已排队重试` : result.reason)
                }}
              >
                重试任务
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <LocaleLink
                href={`/console/settings/integration-log?requestId=${encodeURIComponent(task.requestId)}`}
              >
                关联接口日志
              </LocaleLink>
            </Button>
          </div>
        }
      />
      <Alert>
        <AlertTitle>任务与接口日志关联</AlertTitle>
        <AlertDescription>
          Request ID：{task.requestId}。重试仅更新本机原型会话，不会调用真实平台 connector。
        </AlertDescription>
      </Alert>
      <UedPrototypeNotice>
        {notice ||
          (canRetry
            ? '失败 / 部分失败可人工重试；技术重试不替代业务审批。'
            : '当前状态无需重试，或已在排队中。')}
      </UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '进度', value: task.progress },
          { label: '重试次数', value: String(task.retries) },
          { label: 'HTTP 日志', value: String(logs.length) },
          { label: '状态', value: task.status },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <DetailFieldGrid
          title="任务主信息"
          description="同步任务头：类型、目标、店铺、错误"
          fields={[
            { label: '任务号', value: task.id, mono: true },
            ...parentFields,
            { label: '任务类型', value: task.type },
            { label: '目标', value: task.target },
            { label: '店铺', value: task.shop },
            { label: 'Request ID', value: task.requestId, mono: true },
            { label: '错误摘要', value: task.error },
            { label: '创建时间', value: task.createdAt },
            { label: '最近执行', value: task.lastRun },
          ]}
        />
        <StatusTimeline title="执行时间线" steps={timeline} />
      </div>
      <DetailSection title="关联 HTTP 日志" description="同任务 request / syncTaskId 下的接口调用">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>方法</TableHead>
                <TableHead>路径</TableHead>
                <TableHead>HTTP</TableHead>
                <TableHead>结果</TableHead>
                <TableHead>错误码</TableHead>
                <TableHead className="text-right">详情</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">{log.at}</TableCell>
                  <TableCell className="font-mono text-xs">{log.method}</TableCell>
                  <TableCell className="font-mono text-xs">{log.path}</TableCell>
                  <TableCell className="tabular-nums">{log.httpStatus || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={log.result === '失败' || log.result === '未连接' ? 'destructive' : 'secondary'}>
                      {log.result}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.errorCode}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" asChild>
                      <LocaleLink href={`/console/settings/integration-log/${encodeURIComponent(log.id)}`}>
                        查看
                      </LocaleLink>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                    暂无关联接口日志
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </DetailSection>
      <DetailRelatedTables sections={related.sections ?? []} />
    </div>
  )
}
