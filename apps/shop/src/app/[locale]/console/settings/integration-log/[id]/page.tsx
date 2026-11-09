'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function IntegrationLogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const query = trpc.integrationLogs.get.useQuery({ id })
  const log = query.data
  const [notice, setNotice] = React.useState('')

  const retry = trpc.integrationLogs.retry.useMutation({
    onSuccess: async (res) => {
      setNotice(res.note)
      await utils.integrationLogs.get.invalidate({ id })
      await utils.integrationLogs.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })

  if (query.isLoading) {
    return (
      <DetailPageHeader
        backHref="/console/settings/integration-log"
        title="加载中…"
        description="读取 integration_logs…"
      />
    )
  }
  if (!log) {
    return (
      <DetailPageHeader
        backHref="/console/settings/integration-log"
        title="未找到接口日志"
        description={`日志 ${id} 不存在或不属于当前组织。`}
      />
    )
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '接口与操作日志', href: '/console/settings/integration-log' },
          { label: log.requestId || log.id },
        ]}
      />
      <DetailPageHeader
        backHref="/console/settings/integration-log"
        title={log.action}
        description={`${log.method} ${log.path} · ${log.shop}`}
        badges={
          <>
            <Badge variant="outline">{log.direction}</Badge>
            <Badge variant={log.result === '成功' ? 'secondary' : 'destructive'}>{log.result}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {log.canRetry ? (
              <Button size="sm" disabled={retry.isPending} onClick={() => retry.mutate({ id: log.id })}>
                重试同步任务
              </Button>
            ) : null}
            {log.syncTaskId ? (
              <Button size="sm" variant="outline" asChild>
                <LocaleLink href={`/console/sync-tasks/${encodeURIComponent(log.syncTaskId)}`}>
                  同步任务
                </LocaleLink>
              </Button>
            ) : null}
          </div>
        }
      />
      <Alert>
        <AlertTitle>HTTP / 同步流水 · 凭证已脱敏</AlertTitle>
        <AlertDescription>
          Request ID：{log.requestId || '—'}。不展示 access token；仅脱敏 payloadSummary。
          {!log.syncTaskId ? ' 本条未关联 sync_tasks，不可重试。' : ''}
        </AlertDescription>
      </Alert>
      <UedPrototypeNotice>
        {notice || '重试会发起真实请求；没有关联任务时会返回错误，不会标记为成功。'}
      </UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: 'HTTP', value: log.httpStatus || '—' },
          { label: '耗时', value: log.latencyMs ? `${log.latencyMs} ms` : '—' },
          { label: '错误码', value: log.errorCode || '—' },
          { label: '结果', value: log.result },
        ]}
      />
      <DetailFieldGrid
        title="调用详情"
        description="integration_logs（组织隔离）"
        fields={[
          { label: '日志 ID', value: log.id, mono: true },
          { label: 'Request ID', value: log.requestId || '—', mono: true },
          { label: '时间', value: log.at },
          { label: '操作人', value: log.actor },
          { label: '店铺', value: log.shop },
          { label: '对象', value: log.object || '—', mono: true },
          { label: '方法', value: log.method, mono: true },
          { label: '路径', value: log.path, mono: true },
          { label: '同步任务', value: log.syncTaskId || '—', mono: true },
          { label: '摘要', value: log.message || '—' },
          { label: 'Payload（脱敏）', value: log.payloadSummary || '—' },
        ]}
      />
    </div>
  )
}
