'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { SyncConfirmDialog } from '@/components/console/sync-confirm-dialog'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

const PAGE_SIZE = 20

function statusVariant(status: string) {
  if (status === '失败') return 'destructive' as const
  if (status === '部分失败') return 'outline' as const
  if (status === '成功') return 'secondary' as const
  return 'outline' as const
}

export default function SyncTasksPage() {
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('全部')
  const [notice, setNotice] = React.useState('')
  const [retryTarget, setRetryTarget] = React.useState<{
    id: string
    taskNo: string
    type: string
    shop: string
    target: string
  } | null>(null)
  const utils = trpc.useUtils()

  const metaQuery = trpc.sync.meta.useQuery()
  const statsQuery = trpc.sync.stats.useQuery()
  const listQuery = trpc.sync.list.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status === '全部' ? undefined : status,
  })

  const enqueueMutation = trpc.sync.enqueue.useMutation({
    onSuccess: async (task) => {
      await utils.sync.list.invalidate()
      await utils.sync.stats.invalidate()
      setNotice(`${task.taskNo} 已入队（仅写请求记录，未调用真实平台）。`)
    },
    onError: (error) => setNotice(error.message),
  })
  const retryMutation = trpc.sync.retry.useMutation({
    onSuccess: async (task) => {
      await utils.sync.list.invalidate()
      await utils.sync.stats.invalidate()
      setNotice(`${task.taskNo} 已排队重试（未调用平台 connector）。`)
    },
    onError: (error) => setNotice(error.message),
  })

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const stats = statsQuery.data
  const statuses = metaQuery.data?.statuses ?? ['成功', '失败', '部分失败', '排队', '排队重试', '运行中']
  const shops = metaQuery.data?.shops ?? []

  const kpiItems = [
    { label: '任务数', value: String(stats?.total ?? 0), hint: 'sync_tasks' },
    { label: '成功', value: String(stats?.success ?? 0) },
    { label: '失败', value: String(stats?.failed ?? 0) },
    { label: '部分失败', value: String(stats?.partialFailed ?? 0) },
    { label: '排队 / 运行', value: String((stats?.queued ?? 0) + (stats?.running ?? 0)) },
  ]

  return (
    <UedWorkspace
      title="发布与同步任务"
      description="发布 / 库存 / 价格 / 状态 / 订单 / 评论同步：进度、错误摘要、人工重试。已接 PostgreSQL；入队只写请求记录。"
      rows={rows}
      detailHref={(row) => `/console/sync-tasks/${encodeURIComponent(row.id)}`}
      search={q}
      onSearchChange={(value) => {
        setQ(value)
        setPage(1)
      }}
      searchPlaceholder="搜索任务号、类型、店铺、错误码或 request id"
      filters={[{ label: '状态', options: [...statuses] }]}
      onStatusFilterChange={(value) => {
        setStatus(value === '全部' ? '全部' : value)
        setPage(1)
      }}
      pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      emptyText={
        listQuery.isError
          ? `加载失败：${listQuery.error.message}`
          : listQuery.isLoading
            ? '正在从数据库加载同步任务…'
            : '暂无同步任务。可入队演示任务，或跑 db:seed:commerce-finance。'
      }
      columns={[
        { key: 'taskNo', label: '任务号' },
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
        本页是「任务视角」（sync_tasks / sync_job_runs）；设置 · 接口日志是「HTTP 流水」。重试/入队会写 requestId，但<strong>不会</strong>调用真实 Daraz/Lazada OpenAPI。
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={enqueueMutation.isPending}
          onClick={() =>
            enqueueMutation.mutate({
              type: '库存同步',
              target: '控制台手动入队',
              shopId: shops[0]?.id,
              note: '控制台手动入队演示',
            })
          }
        >
          入队库存同步
        </Button>
        {rows
          .filter((row) => row.status === '失败' || row.status === '部分失败')
          .slice(0, 6)
          .map((row) => (
            <React.Fragment key={row.id}>
              <Button size="sm" disabled={retryMutation.isPending} onClick={() => setRetryTarget(row)}>
                重试 · {row.taskNo}
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
      <SyncConfirmDialog
        open={Boolean(retryTarget)}
        onOpenChange={(open) => {
          if (!open) setRetryTarget(null)
        }}
        title="重试同步任务"
        description="重新执行该同步任务，按任务类型调用对应平台接口。"
        scope={{
          label: '作用任务',
          value: retryTarget
            ? `任务 ${retryTarget.taskNo} · ${retryTarget.type} · ${retryTarget.shop !== '—' ? retryTarget.shop : '全部店铺'}`
            : '',
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
          if (!retryTarget) return
          const target = retryTarget
          setRetryTarget(null)
          retryMutation.mutate({ id: target.id })
        }}
      />
    </UedWorkspace>
  )
}
