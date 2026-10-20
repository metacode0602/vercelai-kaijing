'use client'

import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { trpc } from '@/lib/trpc/client'

const PHASE_LABELS: Record<string, string> = {
  billing_sync: '账单同步',
  tenant_import: '租户导入',
  order_upsert: '订单写入',
}

function formatDt(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN')
}

function statusBadge(status: string) {
  const variant =
    status === 'success'
      ? 'default'
      : status === 'failed'
        ? 'destructive'
        : status === 'partial'
          ? 'secondary'
          : 'outline'
  return <Badge variant={variant}>{status}</Badge>
}

export function BareMetalOrderSyncJobDetailContent({ jobRunId }: { jobRunId: string }) {
  const { data, isLoading, error } = trpc.crm.bareMetalOrderSync.getRunById.useQuery({ id: jobRunId })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" />
        加载中…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/supplier/bare-metal-orders">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4 mr-1" />
            返回裸金属订单
          </Button>
        </Link>
        <Alert variant="destructive">
          <AlertDescription>{error?.message ?? '同步批次不存在'}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Link href="/supplier/bare-metal-orders">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="size-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">裸金属同步批次</h1>
            {statusBadge(data.status)}
            <Badge variant="outline">{data.trigger === 'manual' ? '手动' : '定时'}</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1 font-mono">{data.id}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">运行摘要</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">开始时间</p>
            <p className="font-medium">{formatDt(data.startedAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">结束时间</p>
            <p className="font-medium">{formatDt(data.finishedAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">拉取订单数</p>
            <p className="font-medium">{data.ordersFetchedCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground">写入订单数</p>
            <p className="font-medium">{data.orderUpsertedCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground">自动导入租户</p>
            <p className="font-medium">{data.tenantsAutoImportedCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground">账单同步租户</p>
            <p className="font-medium">{data.billingSyncTenantCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground">成功 / 失败</p>
            <p className="font-medium">
              {data.successCount} / {data.failedCount}
            </p>
          </div>
        </CardContent>
      </Card>

      {data.errorSummary ? (
        <Alert variant="destructive">
          <AlertDescription>{data.errorSummary}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">租户级明细（{data.items.length}）</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">
              本任务无租户级明细（可能无新租户账单同步）
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>平台租户 ID</TableHead>
                  <TableHead>CRM 租户</TableHead>
                  <TableHead>阶段</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>错误</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.platformTenantId}</TableCell>
                    <TableCell>{item.tenantName ?? item.tenantId ?? '—'}</TableCell>
                    <TableCell>{PHASE_LABELS[item.phase] ?? item.phase}</TableCell>
                    <TableCell>{statusBadge(item.status)}</TableCell>
                    <TableCell className="text-xs max-w-xs text-destructive">
                      {item.errorMessage ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
