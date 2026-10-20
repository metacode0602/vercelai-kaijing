'use client'

import { useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@workspace/ui/components/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@workspace/ui/components/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Badge } from '@workspace/ui/components/badge'
import { Skeleton } from '@workspace/ui/components/skeleton'
import { Label } from '@workspace/ui/components/label'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@workspace/ui/components/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import { Check, X, RefreshCw, Eye, Loader2, AlertTriangle, Server } from 'lucide-react'
import { toast } from '@workspace/ui/hooks/use-toast'

const PAGE_SIZE = 20

const AUDIT_STATUS_MAP: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  pending: { label: '待审核', variant: 'secondary' },
  approved: { label: '已通过', variant: 'default' },
  rejected: { label: '已拒绝', variant: 'destructive' },
}

const HEALTH_STATUS_MAP: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  healthy: { label: '健康', variant: 'default' },
  degraded: { label: '降级', variant: 'secondary' },
  unhealthy: { label: '异常', variant: 'destructive' },
  unknown: { label: '未知', variant: 'outline' },
}

function TableRowSkeleton() {
  return (
    <TableRow>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableCell key={i}>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      ))}
    </TableRow>
  )
}

export function GatewayNodeListClient() {
  const [page, setPage] = useState(1)
  const [auditStatusFilter, setAuditStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [reviewingNode, setReviewingNode] = useState<any | null>(null)
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve')
  const [reviewRemark, setReviewRemark] = useState('')

  const { data, isLoading, refetch, isError } = trpc.supplier.gatewayNodeList.useQuery({
    page,
    pageSize: PAGE_SIZE,
    auditStatus: auditStatusFilter === 'all' ? undefined : auditStatusFilter,
  })

  const reviewMutation = trpc.supplier.gatewayNodeReview.useMutation({
    onSuccess: () => {
      toast({
        title: reviewAction === 'approve' ? '审核通过' : '已拒绝',
        description: '网关节点审核已完成',
      })
      setReviewDialogOpen(false)
      setReviewingNode(null)
      setReviewRemark('')
      refetch()
    },
    onError: (error) => {
      toast({
        title: '审核失败',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const handleReviewClick = useCallback((node: any, action: 'approve' | 'reject') => {
    setReviewingNode(node)
    setReviewAction(action)
    setReviewRemark('')
    setReviewDialogOpen(true)
  }, [])

  const handleReviewConfirm = useCallback(() => {
    if (!reviewingNode) return

    if (reviewAction === 'reject' && !reviewRemark.trim()) {
      toast({
        title: '请填写拒绝原因',
        variant: 'destructive',
      })
      return
    }

    reviewMutation.mutate({
      id: reviewingNode.id,
      auditStatus: reviewAction === 'approve' ? 'approved' : 'rejected',
      auditRemark: reviewRemark.trim() || undefined,
    })
  }, [reviewingNode, reviewAction, reviewRemark, reviewMutation])

  const nodes = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">网关节点审核</h1>
          <p className="text-muted-foreground text-sm">审核供应商提交的网关管控节点</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>网关节点列表</CardTitle>
            <div className="flex items-center gap-2">
              <Select
                value={auditStatusFilter}
                onValueChange={(v) => {
                  setAuditStatusFilter(v as typeof auditStatusFilter)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="审核状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="pending">待审核</SelectItem>
                  <SelectItem value="approved">已通过</SelectItem>
                  <SelectItem value="rejected">已拒绝</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p>加载失败</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                重试
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>节点名称</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead>机房</TableHead>
                  <TableHead>内网 IP</TableHead>
                  <TableHead>健康状态</TableHead>
                  <TableHead>审核状态</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <>
                    <TableRowSkeleton />
                    <TableRowSkeleton />
                    <TableRowSkeleton />
                  </>
                ) : nodes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <Server className="h-12 w-12 opacity-50" />
                        <div>
                          <p className="font-medium">暂无网关节点</p>
                          <p className="text-sm">等待供应商提交网关节点</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  nodes.map((node: any) => {
                    const auditInfo =
                      AUDIT_STATUS_MAP[node.auditStatus] ?? {
                        label: node.auditStatus,
                        variant: 'outline' as const,
                      }
                    const healthInfo =
                      HEALTH_STATUS_MAP[node.healthStatus] ?? {
                        label: node.healthStatus,
                        variant: 'outline' as const,
                      }
                    return (
                      <TableRow key={node.id}>
                        <TableCell className="font-medium">{node.name}</TableCell>
                        <TableCell>{node.supplierName ?? '—'}</TableCell>
                        <TableCell>{node.dataCenterName ?? '—'}</TableCell>
                        <TableCell className="font-mono text-sm">{node.internalIp}</TableCell>
                        <TableCell>
                          <Badge variant={healthInfo.variant}>{healthInfo.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={auditInfo.variant}>{auditInfo.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(node.createdAt).toLocaleDateString('zh-CN')}
                        </TableCell>
                        <TableCell className="text-right">
                          {node.auditStatus === 'pending' && (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReviewClick(node, 'approve')}
                                disabled={reviewMutation.isPending}
                                title="批准"
                              >
                                <Check className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReviewClick(node, 'reject')}
                                disabled={reviewMutation.isPending}
                                title="拒绝"
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {!isLoading && total > 0 && (
          <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">
              显示 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} 条，共 {total} 条
            </p>
            {totalPages > 1 && (
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      text="上一页"
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 7) {
                      pageNum = i + 1
                    } else if (page <= 4) {
                      pageNum = i + 1
                    } else if (page >= totalPages - 3) {
                      pageNum = totalPages - 6 + i
                    } else {
                      pageNum = page - 3 + i
                    }
                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          isActive={pageNum === page}
                          onClick={() => setPage(pageNum)}
                          className="cursor-pointer"
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className={page >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      text="下一页"
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        )}
      </Card>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewAction === 'approve' ? '批准网关节点' : '拒绝网关节点'}</DialogTitle>
            <DialogDescription>
              {reviewAction === 'approve'
                ? '确认批准该网关节点注册申请？'
                : '确认拒绝该网关节点注册申请？请填写拒绝原因。'}
            </DialogDescription>
          </DialogHeader>
          {reviewingNode && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <p className="text-sm">
                  <span className="text-muted-foreground">节点名称：</span>
                  <span className="font-medium">{reviewingNode.name}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">供应商：</span>
                  <span className="font-medium">{reviewingNode.supplierName}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">内网 IP：</span>
                  <span className="font-medium font-mono">{reviewingNode.internalIp}</span>
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="remark">
                  {reviewAction === 'approve' ? '审核备注' : '拒绝原因'}{' '}
                  {reviewAction === 'reject' && <span className="text-destructive">*</span>}
                </Label>
                <Textarea
                  id="remark"
                  placeholder={
                    reviewAction === 'approve' ? '审核备注（可选）' : '请填写拒绝原因'
                  }
                  value={reviewRemark}
                  onChange={(e) => setReviewRemark(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleReviewConfirm}
              disabled={reviewMutation.isPending}
              className={
                reviewAction === 'reject'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {reviewMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  处理中...
                </>
              ) : (
                <>{reviewAction === 'approve' ? '批准' : '拒绝'}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
