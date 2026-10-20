'use client'

import { useMemo, useState } from 'react'
import { Loader2, Search, HardDriveDownload, XCircle } from 'lucide-react'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent } from '@workspace/ui/components/card'
import { Input } from '@workspace/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'

const statusBadgeVariant: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'secondary',
  downloading: 'default',
  ready: 'outline',
  failed: 'destructive',
}

const statusLabel: Record<string, string> = {
  pending: '等待中',
  downloading: '下载中',
  ready: '已完成',
  failed: '失败',
}

function formatBytes(bytes: number | null) {
  if (bytes == null) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export function PreloadTasksContent() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [regionFilter, setRegionFilter] = useState('')
  const [page, setPage] = useState(1)

  const utils = trpc.useUtils()

  const queryInput = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      regionId: regionFilter.trim() || undefined,
      page,
      pageSize: 20,
    }),
    [search, statusFilter, regionFilter, page],
  )

  const { data, isLoading, isFetching } = trpc.admin.preloadTask.list.useQuery(queryInput)

  const cancelMutation = trpc.admin.preloadTask.cancel.useMutation({
    onSuccess: () => {
      utils.admin.preloadTask.list.invalidate()
      toast.success('任务已取消')
    },
    onError: (e) => toast.error(e.message),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 20))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HardDriveDownload className="size-6" />
            预加载监控
          </h1>
          <p className="text-muted-foreground text-sm mt-1">查看镜像预加载任务状态与进度</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="搜索镜像引用…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="pending">等待中</SelectItem>
              <SelectItem value="downloading">下载中</SelectItem>
              <SelectItem value="ready">已完成</SelectItem>
              <SelectItem value="failed">失败</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="w-[180px]"
            placeholder="区域 ID"
            value={regionFilter}
            onChange={(e) => { setRegionFilter(e.target.value); setPage(1) }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="size-5 animate-spin mr-2" />
              加载中…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>镜像引用</TableHead>
                  <TableHead>区域</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>进度</TableHead>
                  <TableHead>大小</TableHead>
                  <TableHead>已下载</TableHead>
                  <TableHead>错误</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                      暂无预加载任务
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono truncate max-w-[300px] block">
                          {t.imageRef}
                        </code>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{t.regionId}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant[t.status] ?? 'secondary'}>
                          {statusLabel[t.status] ?? t.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{t.progress}%</TableCell>
                      <TableCell>{formatBytes(t.sizeBytes)}</TableCell>
                      <TableCell>{formatBytes(t.downloadedBytes)}</TableCell>
                      <TableCell>
                        {t.errorMessage ? (
                          <span className="text-destructive text-xs truncate max-w-[200px] block" title={t.errorMessage}>
                            {t.errorMessage}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}
                      </TableCell>
                      <TableCell>
                        {(t.status === 'pending' || t.status === 'downloading') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            onClick={() => cancelMutation.mutate({ id: t.id })}
                            disabled={cancelMutation.isPending}
                            title="取消任务"
                          >
                            <XCircle className="size-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>共 {total} 条{isFetching && !isLoading ? '（刷新中…）' : ''}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            上一页
          </Button>
          <span>{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            下一页
          </Button>
        </div>
      </div>
    </div>
  )
}
