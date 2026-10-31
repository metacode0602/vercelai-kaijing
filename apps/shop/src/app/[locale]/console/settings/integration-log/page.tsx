'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  countLogsByResult,
  retryIntegrationLog,
  useIntegrationLogs,
} from '@/lib/crossborder/sync-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function resultVariant(result: string) {
  if (result === '失败' || result === '未连接') return 'destructive' as const
  if (result === '成功') return 'secondary' as const
  return 'outline' as const
}

export default function SystemLogPage() {
  const logs = useIntegrationLogs()
  const searchParams = useSearchParams()
  const requestIdFilter = searchParams.get('requestId') || ''
  const [notice, setNotice] = React.useState('')

  const filtered = React.useMemo(() => {
    if (!requestIdFilter) return logs
    return logs.filter((item) => item.requestId === requestIdFilter)
  }, [logs, requestIdFilter])

  const counts = React.useMemo(() => countLogsByResult(logs), [logs])
  const kpiItems = React.useMemo(
    () => [
      { label: '日志条数', value: String(logs.length) },
      { label: '成功', value: String(counts.成功) },
      { label: '失败', value: String(counts.失败) },
      { label: '未连接', value: String(counts.未连接) },
    ],
    [logs.length, counts],
  )

  return (
    <UedWorkspace
      title="接口与操作日志"
      description="平台 HTTP 调用流水：方法、路径、状态码、耗时与错误码；与同步任务通过 request id 关联。"
      rows={filtered}
      detailHref={(row) => `/console/settings/integration-log/${encodeURIComponent(row.id)}`}
      searchKeys={['requestId', 'actor', 'action', 'object', 'result', 'detail', 'shop', 'path', 'errorCode', 'syncTaskId']}
      searchPlaceholder="搜索 request id、店铺、路径或错误码"
      filters={[{ label: '结果', options: ['成功', '失败', '未连接', '重试已排队'], key: 'result' }]}
      emptyText={
        requestIdFilter
          ? `没有 request id = ${requestIdFilter} 的日志。清除筛选或返回同步任务。`
          : '暂无接口日志。同步任务执行后会写入本机原型会话。'
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
      <DetailKpiRow items={kpiItems} />
      <UedPrototypeNotice>
        敏感 token 不展示。详情保留脱敏摘要、错误代码、重试状态与 request id。
        {requestIdFilter ? ` 当前按 request id 筛选：${requestIdFilter}。` : ''}
      </UedPrototypeNotice>
      {requestIdFilter ? (
        <Button variant="outline" size="sm" asChild>
          <LocaleLink href="/console/settings/integration-log">清除 request id 筛选</LocaleLink>
        </Button>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {filtered
          .filter((row) => row.result === '失败' || row.result === '未连接' || row.result === '部分成功')
          .map((row) => (
            <React.Fragment key={row.id}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const result = retryIntegrationLog(row.id)
                  setNotice(
                    result.ok
                      ? `${row.object} 重试已排队（原型）${result.task ? ` · 任务 ${result.task.id}` : ''}`
                      : result.reason,
                  )
                }}
              >
                重试 · {row.object}
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
