'use client'

import { useMemo, useState } from 'react'
import { Loader2, Search, Image, Trash2, Pin, PinOff } from 'lucide-react'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent } from '@workspace/ui/components/card'
import { Input } from '@workspace/ui/components/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
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

function formatBytes(bytes: number | null) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  ready: { label: '可用', variant: 'default' },
  pending: { label: '处理中', variant: 'secondary' },
  scanning: { label: '扫描中', variant: 'secondary' },
  creating: { label: '创建中', variant: 'secondary' },
  failed: { label: '失败', variant: 'destructive' },
  running: { label: '运行中', variant: 'default' },
  stopped: { label: '已停止', variant: 'outline' },
}

const sourceLabels: Record<string, string> = {
  push: 'Push',
  commit: 'Commit',
  external: '外部导入',
}

export function CustomImagesContent() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null)

  const utils = trpc.useUtils()

  const queryInput = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      source: sourceFilter === 'all' ? undefined : sourceFilter,
      page,
      pageSize: 20,
    }),
    [search, statusFilter, sourceFilter, page],
  )

  const { data, isLoading, isFetching } = trpc.admin.customImage.list.useQuery(queryInput)

  const togglePinMutation = trpc.admin.customImage.togglePin.useMutation({
    onSuccess: () => {
      utils.admin.customImage.list.invalidate()
      toast.success('操作成功')
    },
    onError: (e) => toast.error(e.message),
  })

  const deleteMutation = trpc.admin.customImage.delete.useMutation({
    onSuccess: () => {
      utils.admin.customImage.list.invalidate()
      setDeleteDialogId(null)
      toast.success('镜像已删除')
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
            <Image className="size-6" />
            系统镜像管理
          </h1>
          <p className="text-muted-foreground text-sm mt-1">查看和管理所有租户的自定义 Docker 镜像</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="搜索标签名、镜像引用…"
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
              {Object.entries(statusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="来源" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部来源</SelectItem>
              {Object.entries(sourceLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                  <TableHead>标签名</TableHead>
                  <TableHead>租户</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead>大小</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>扫描</TableHead>
                  <TableHead>固定</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                      暂无镜像
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((img) => {
                    const st = statusLabels[img.status] ?? { label: img.status, variant: 'outline' as const }
                    return (
                      <TableRow key={img.id}>
                        <TableCell>
                          <div>
                            <span className="font-medium text-sm">{img.tagName}</span>
                            <code className="block text-xs text-muted-foreground font-mono truncate max-w-[300px]">
                              {img.imageRef}
                            </code>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{img.tenantName ?? img.tenantId}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{sourceLabels[img.source] ?? img.source}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatBytes(img.sizeBytes)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {img.scanStatus ? (
                            <Badge variant={img.scanStatus === 'clean' ? 'default' : 'destructive'}>
                              {img.scanStatus === 'clean' ? '通过' : img.scanStatus}
                            </Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => togglePinMutation.mutate({ id: img.id, isPinned: !img.isPinned })}
                          >
                            {img.isPinned ? (
                              <Pin className="size-3.5 text-primary" />
                            ) : (
                              <PinOff className="size-3.5 text-muted-foreground" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(img.createdAt).toLocaleDateString('zh-CN')}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => setDeleteDialogId(img.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogId !== null} onOpenChange={(open) => { if (!open) setDeleteDialogId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除镜像</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            确定要删除此镜像吗？此操作将从数据库中移除镜像记录，不会影响 Harbor 中的实际镜像数据。此操作不可撤销。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogId(null)}>取消</Button>
            <Button
              variant="destructive"
              onClick={() => { if (deleteDialogId) deleteMutation.mutate({ id: deleteDialogId }) }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? '删除中…' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
