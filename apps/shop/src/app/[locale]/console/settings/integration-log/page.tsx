'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function resultVariant(result: string) {
  if (result === '失败' || result === '未连接') return 'destructive' as const
  if (result === '成功') return 'secondary' as const
  return 'outline' as const
}

export default function SystemLogPage() {
  const searchParams = useSearchParams()
  const requestIdFilter = searchParams.get('requestId') || ''
  const utils = trpc.useUtils()
  const listQuery = trpc.integrationLogs.list.useQuery({
    page: 1,
    pageSize: 100,
    requestId: requestIdFilter || undefined,
  })
  const meta = trpc.integrationLogs.meta.useQuery()
  const rows = listQuery.data?.items ?? []
  const [notice, setNotice] = React.useState('')

  const retry = trpc.integrationLogs.retry.useMutation({
    onSuccess: async (res) => {
      setNotice(res.note)
      await utils.integrationLogs.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })

  const counts = React.useMemo(() => {
    const c = { 成功: 0, 失败: 0, 未连接: 0, 其他: 0 }
    for (const row of rows) {
      if (row.result === '成功') c.成功 += 1
      else if (row.result === '失败') c.失败 += 1
      else if (row.result === '未连接') c.未连接 += 1
      else c.其他 += 1
    }
    return c
  }, [rows])

  return (
    <UedWorkspace
      title="接口与操作日志"
      description="integration_logs：方法/状态/摘要（脱敏）；与同步任务通过 requestId / taskId 关联。"
      rows={rows}
      detailHref={(row) => `/console/settings/integration-log/${encodeURIComponent(row.id)}`}
      searchKeys={['requestId', 'actor', 'action', 'object', 'result', 'detail', 'shop', 'path', 'errorCode', 'syncTaskId']}
      searchPlaceholder="搜索 request id、店铺、路径或错误码"
      filters={[{ label: '结果', options: ['成功', '失败', '未连接', '排队中', '部分成功'], key: 'result' }]}
      emptyText={
        listQuery.isLoading
          ? '加载中…'
          : requestIdFilter
            ? `没有 request id = ${requestIdFilter} 的日志。`
            : '暂无接口日志。同步任务入队后会写入 integration_logs。'
      }
      columns={[
        { key: 'at', label: '时间' },
        { key: 'shop', label: '店铺' },
        { key: 'action', label: '动作' },
        {
          key: 'method',
          label: '方法 / 路径',
          render: (row) => (
            <span className="font-mono text-xs">
              {row.method} {row.path}
            </span>
          ),
        },
        {
          key: 'httpStatus',
          label: 'HTTP',
          render: (row) => (row.httpStatus ? String(row.httpStatus) : '—'),
        },
        {
          key: 'latencyMs',
          label: '耗时 ms',
          render: (row) => (row.latencyMs ? String(row.latencyMs) : '—'),
        },
        { key: 'requestId', label: 'Request ID' },
        {
          key: 'result',
          label: '结果',
          render: (row) => <Badge variant={resultVariant(row.result)}>{row.result}</Badge>,
        },
        { key: 'detail', label: '摘要' },
      ]}
    >
      <DetailKpiRow
        items={[
          { label: '日志条数', value: String(rows.length) },
          { label: '成功', value: String(counts.成功) },
          { label: '失败', value: String(counts.失败) },
          { label: '未连接', value: String(counts.未连接) },
        ]}
      />
      <UedPrototypeNotice>
        {meta.data?.note || '敏感 token 已脱敏。重试仅当关联真实 sync_tasks。'}
        {requestIdFilter ? ` 当前按 request id 筛选：${requestIdFilter}。` : ''}
      </UedPrototypeNotice>
      {requestIdFilter ? (
        <Button variant="outline" size="sm" asChild>
          <LocaleLink href="/console/settings/integration-log">清除 request id 筛选</LocaleLink>
        </Button>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {rows
          .filter((row) => row.canRetry)
          .map((row) => (
            <React.Fragment key={row.id}>
              <Button
                variant="outline"
                size="sm"
                disabled={retry.isPending}
                onClick={() => retry.mutate({ id: row.id })}
              >
                重试 · {row.object || row.action}
              </Button>
              {row.syncTaskId ? (
                <Button variant="ghost" size="sm" asChild>
                  <LocaleLink href={`/console/sync-tasks/${encodeURIComponent(row.syncTaskId)}`}>
                    同步任务 · {row.syncTaskId}
                  </LocaleLink>
                </Button>
              ) : null}
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
