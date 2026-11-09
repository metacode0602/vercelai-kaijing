'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
  StatusTimeline,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { SyncConfirmDialog } from '@/components/console/sync-confirm-dialog'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
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
  const [notice, setNotice] = React.useState('')
  const [retryConfirmOpen, setRetryConfirmOpen] = React.useState(false)
  const utils = trpc.useUtils()
  const detailQuery = trpc.sync.get.useQuery({ id })
  const retryMutation = trpc.sync.retry.useMutation({
    onSuccess: async (task) => {
      await utils.sync.get.invalidate({ id })
      await utils.sync.list.invalidate()
      await utils.sync.stats.invalidate()
      setNotice(`${task.taskNo} 已排队重试（写 sync_job_runs + integration_logs，未调平台）。`)
    },
    onError: (error) => setNotice(error.message),
  })

  if (detailQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">加载同步任务…</p>
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>未找到任务</AlertTitle>
        <AlertDescription>{detailQuery.error?.message ?? `无任务 ${id}`}</AlertDescription>
      </Alert>
    )
  }

  const task = detailQuery.data
  const runs = task.runs

  return (
    <div className="space-y-4">
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '发布与同步任务', href: '/console/sync-tasks' },
          { label: task.taskNo },
        ]}
      />
      <DetailPageHeader
        backHref="/console/sync-tasks"
        backLabel="同步任务"
        title={task.taskNo}
        description={`${task.type} · ${task.shop} · ${task.target}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={retryMutation.isPending}
              onClick={() => setRetryConfirmOpen(true)}
            >
              重试入队
            </Button>
            <Button size="sm" variant="outline" asChild>
              <LocaleLink
                href={`/console/settings/integration-log?requestId=${encodeURIComponent(task.requestId)}`}
              >
                接口日志
              </LocaleLink>
            </Button>
          </div>
        }
      />
      <UedPrototypeNotice>
        重试只生成请求记录，不代表已与 Daraz / Lazada 联调成功。
      </UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '进度', value: task.progress },
          { label: '重试次数', value: String(task.retries) },
          { label: '状态', value: task.status },
          { label: '最近执行', value: task.lastRun },
        ]}
      />
      <DetailFieldGrid
        fields={[
          { label: '任务号', value: task.taskNo, mono: true },
          { label: '类型', value: task.type },
          { label: '目标', value: task.target },
          { label: '店铺', value: task.shop },
          { label: 'Request ID', value: task.requestId, mono: true },
          { label: '错误', value: task.error },
          { label: '备注', value: task.note || '—' },
          {
            label: '状态',
            value: <Badge variant={statusVariant(task.status)}>{task.status}</Badge>,
          },
        ]}
        columns={3}
      />
      <DetailSection title="执行记录" description="sync_job_runs：每次入队/重试一条">
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无执行记录。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>Request ID</TableHead>
                <TableHead>HTTP</TableHead>
                <TableHead>延迟</TableHead>
                <TableHead>说明</TableHead>
                <TableHead>时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="tabular-nums">{run.runNo}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{run.requestId}</TableCell>
                  <TableCell>{run.httpStatus ?? '—'}</TableCell>
                  <TableCell>{run.latencyMs == null ? '—' : `${run.latencyMs}ms`}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{run.message || run.detail || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{run.createdAt}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DetailSection>
      <StatusTimeline
        steps={[
          { status: '创建', at: task.createdAt },
          { status: '最近执行', at: task.lastRun },
          { status: task.status, at: task.lastRun, current: true },
        ]}
      />
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      <SyncConfirmDialog
        open={retryConfirmOpen}
        onOpenChange={setRetryConfirmOpen}
        title="重试同步任务"
        description="重新执行该同步任务，按任务类型调用对应平台接口。"
        scope={{
          label: '作用任务',
          value: `任务 ${task.taskNo} · ${task.type} · ${task.shop !== '—' ? task.shop : '全部店铺'}`,
        }}
        impacts={[
          '会按任务类型（订单/刊登/物流/评论/结算）真实调用平台 OpenAPI',
          '结果会回写 sync_job_runs 与 integration_logs',
          '失败可在任务详情查看错误详情',
        ]}
        platformCall={{
          label: '将调用平台 OpenAPI',
          detail: '按 task.type 路由（orders/listings/logistics/reviews/settlements）',
        }}
        confirmLabel="确认重试"
        pending={retryMutation.isPending}
        onConfirm={() => {
          setRetryConfirmOpen(false)
          retryMutation.mutate({ id: task.id })
        }}
      />
    </div>
  )
}
