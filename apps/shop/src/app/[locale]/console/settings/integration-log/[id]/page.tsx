'use client'

import * as React from 'react'
import {
  ConsoleBreadcrumbs,
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailRelatedTables,
  parentsToFields,
} from '@/components/console/detail'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { buildUedRelatedInfo } from '@/lib/console/related-info'
import {
  retryIntegrationLog,
  toRelatedIntegrationLogShape,
  useIntegrationLogs,
  useSyncTasks,
} from '@/lib/crossborder/sync-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function IntegrationLogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const logs = useIntegrationLogs()
  useSyncTasks()
  const log = logs.find((item) => item.id === id || `${item.at}::${item.object}` === id)
  const [mounted, setMounted] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!log) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/settings/integration-log"
          title={mounted ? '未找到接口日志' : '加载中…'}
          description={mounted ? `日志 ${id} 不存在。` : '正在读取本机原型会话…'}
        />
      </div>
    )
  }

  const related = buildUedRelatedInfo('integration-log', toRelatedIntegrationLogShape(log))
  const parentFields = parentsToFields(related.parents)
  const canRetry = log.result === '失败' || log.result === '未连接' || log.result === '部分成功'

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbs
        items={[
          { label: '接口与操作日志', href: '/console/settings/integration-log' },
          { label: log.requestId },
        ]}
      />
      <DetailPageHeader
        backHref="/console/settings/integration-log"
        title={log.action}
        description={`${log.method} ${log.path} · ${log.shop}`}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
            <Badge variant={log.result === '成功' ? 'secondary' : 'destructive'}>{log.result}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canRetry ? (
              <Button
                size="sm"
                onClick={() => {
                  const result = retryIntegrationLog(log.id)
                  setNotice(result.ok ? '重试已排队（原型）' : result.reason)
                }}
              >
                重试调用
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
        <AlertTitle>HTTP 流水 · 凭证已脱敏</AlertTitle>
        <AlertDescription>
          Request ID：{log.requestId}。不展示 access token；正式环境仅保留脱敏请求摘要。
        </AlertDescription>
      </Alert>
      <UedPrototypeNotice>{notice || '重试为原型动作，不会调用真实连接器。'}</UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: 'HTTP', value: log.httpStatus ? String(log.httpStatus) : '—' },
          { label: '耗时', value: log.latencyMs ? `${log.latencyMs} ms` : '—' },
          { label: '错误码', value: log.errorCode },
          { label: '结果', value: log.result },
        ]}
      />
      <DetailFieldGrid
        title="调用详情"
        description="integration_logs 投影"
        fields={[
          { label: '日志 ID', value: log.id, mono: true },
          { label: 'Request ID', value: log.requestId, mono: true },
          ...parentFields,
          { label: '时间', value: log.at },
          { label: '操作人', value: log.actor },
          { label: '店铺', value: log.shop },
          { label: '对象', value: log.object, mono: true },
          { label: '方法', value: log.method, mono: true },
          { label: '路径', value: log.path, mono: true },
          { label: '同步任务', value: log.syncTaskId || '—' , mono: true },
          { label: '摘要', value: log.detail },
        ]}
      />
      <DetailRelatedTables sections={related.sections ?? []} />
    </div>
  )
}
