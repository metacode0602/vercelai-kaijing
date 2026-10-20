'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Input } from '@workspace/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@workspace/ui/components/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@workspace/ui/components/tooltip'
import { trpc } from '@/lib/trpc/client'
import {
  BARE_METAL_SYNC_ERROR_CODES,
  BARE_METAL_SYNC_ERROR_LABELS,
} from '@/lib/supplier/bare-metal-sync-error-labels'
import { formatBareMetalDateTime } from '@/lib/supplier/bare-metal-order-utils'

type Props = {
  initialJobRunId?: string
}

export function BareMetalSyncErrorsContent({ initialJobRunId }: Props) {
  const searchParams = useSearchParams()
  const jobRunFromUrl = searchParams.get('jobRunId') ?? initialJobRunId ?? ''
  const [jobRunId, setJobRunId] = useState(jobRunFromUrl || 'all')
  const [resolved, setResolved] = useState<'open' | 'all'>('open')
  const [errorCode, setErrorCode] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [payloadItemId, setPayloadItemId] = useState<string | null>(null)
  const pageSize = 20

  const queryInput = useMemo(
    () => ({
      jobRunId: jobRunId === 'all' ? undefined : jobRunId,
      resolved,
      errorCodes: errorCode === 'all' ? undefined : [errorCode],
      search: search.trim() || undefined,
      page,
      pageSize,
    }),
    [jobRunId, resolved, errorCode, search, page],
  )

  const utils = trpc.useUtils()
  const { data: jobRunOptions } = trpc.supplier.bareMetalOrder.sync.listJobRunOptions.useQuery()
  const { data: jobRun } = trpc.supplier.bareMetalOrder.sync.getJobRun.useQuery(
    { jobRunId: jobRunId },
    { enabled: jobRunId !== 'all' && jobRunId.length > 0 },
  )
  const { data, isLoading, isFetching } =
    trpc.supplier.bareMetalOrder.sync.listFailedItems.useQuery(queryInput)

  const resolveMutation = trpc.supplier.bareMetalOrder.sync.resolveFailedItem.useMutation({
    onSuccess: async () => {
      toast.success('已标记为已处理')
      await utils.supplier.bareMetalOrder.sync.listFailedItems.invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  const retryMutation = trpc.supplier.bareMetalOrder.sync.retryOrder.useMutation({
    onSuccess: async (result) => {
      if (result.success) {
        toast.success('重试成功')
        await utils.supplier.bareMetalOrder.sync.listFailedItems.invalidate()
      } else {
        toast.error(result.error ?? '重试失败')
        await utils.supplier.bareMetalOrder.sync.listFailedItems.invalidate()
      }
    },
    onError: (e) => toast.error(e.message),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const openCount = data?.openCount ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const payloadItem = items.find((i) => i.id === payloadItemId)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Link
          href="/supplier/bare-metal-orders"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="size-4" />
          返回裸金属订单
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="size-6 text-amber-500" />
            同步错误处理
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            未处理 {openCount} 条 · 当前列表 {total} 条
          </p>
        </div>
      </div>

      {jobRun && jobRunId !== 'all' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">批次摘要</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="outline">{jobRun.trigger === 'manual' ? '手动' : '定时'}</Badge>
              <Badge>{jobRun.status}</Badge>
              <span className="text-muted-foreground">
                {formatBareMetalDateTime(jobRun.startedAt)}
                {jobRun.finishedAt ? ` → ${formatBareMetalDateTime(jobRun.finishedAt)}` : ''}
              </span>
            </div>
            <p>
              拉取 {jobRun.ordersFetchedCount} · 成功 {jobRun.orderUpsertedCount} · 失败{' '}
              {jobRun.failedCount}
            </p>
            {jobRun.errorSummary && (
              <p className="text-muted-foreground whitespace-pre-wrap">{jobRun.errorSummary}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <Select
            value={jobRunId}
            onValueChange={(v) => {
              setJobRunId(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="批次" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部批次</SelectItem>
              {(jobRunOptions ?? []).map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={resolved}
            onValueChange={(v) => {
              setResolved(v as 'open' | 'all')
              setPage(1)
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">未处理</SelectItem>
              <SelectItem value="all">全部</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={errorCode}
            onValueChange={(v) => {
              setErrorCode(v)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="错误码" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部错误码</SelectItem>
              {BARE_METAL_SYNC_ERROR_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {BARE_METAL_SYNC_ERROR_LABELS[code]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="订单号 / 平台 ID / 租户"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-muted-foreground py-16">暂无失败记录</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单</TableHead>
                  <TableHead>租户</TableHead>
                  <TableHead>错误</TableHead>
                  <TableHead>批次时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.orderNo ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{item.platformOrderId}</div>
                    </TableCell>
                    <TableCell>
                      <div>{item.tenantName ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{item.platformTenantId}</div>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      {item.errorCode && (
                        <Badge variant="destructive" className="mb-1">
                          {BARE_METAL_SYNC_ERROR_LABELS[
                            item.errorCode as keyof typeof BARE_METAL_SYNC_ERROR_LABELS
                          ] ?? item.errorCode}
                        </Badge>
                      )}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="text-sm truncate cursor-default">
                              {item.errorMessage ?? '—'}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md">{item.errorMessage}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {item.resolvedAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          已处理 {formatBareMetalDateTime(item.resolvedAt)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatBareMetalDateTime(item.jobStartedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retryMutation.isPending}
                          onClick={() => retryMutation.mutate({ itemId: item.id })}
                        >
                          <RefreshCw className="size-3.5 mr-1" />
                          重试
                        </Button>
                        {!item.resolvedAt && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={resolveMutation.isPending}
                            onClick={() => resolveMutation.mutate({ itemId: item.id })}
                          >
                            已处理
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPayloadItemId(item.id)}
                        >
                          快照
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </Button>
          <span className="text-sm text-muted-foreground self-center">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </Button>
        </div>
      )}

      <Sheet open={Boolean(payloadItemId)} onOpenChange={(open) => !open && setPayloadItemId(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>平台快照</SheetTitle>
          </SheetHeader>
          <pre className="text-xs mt-4 whitespace-pre-wrap break-all bg-muted p-3 rounded-md">
            {payloadItem
              ? JSON.stringify(payloadItem.platformPayload, null, 2)
              : ''}
          </pre>
        </SheetContent>
      </Sheet>
    </div>
  )
}
