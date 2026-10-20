'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Check, X, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import { Badge } from '@workspace/ui/components/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { Checkbox } from '@workspace/ui/components/checkbox'
import { Textarea } from '@workspace/ui/components/textarea'
import { Label } from '@workspace/ui/components/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { ListPagination } from '@/components/shared/list-pagination'
import { trpc } from '@/lib/trpc/client'

interface DeviceReviewPanelProps {
  batchId: string
}

const reviewStatusColors: Record<string, string> = {
  pending: 'border-yellow-500/50 text-yellow-600 bg-yellow-500/10',
  approved: 'border-green-500/50 text-green-600 bg-green-500/10',
  rejected: 'border-red-500/50 text-red-600 bg-red-500/10',
}

const reviewStatusLabels: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
}

export function DeviceReviewPanel({ batchId }: DeviceReviewPanelProps) {
  const utils = trpc.useUtils()
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null)
  const [reviewRemark, setReviewRemark] = useState('')
  const [filterStatus, setFilterStatus] = useState<'pending' | 'approved' | 'rejected' | undefined>('pending')

  const { data, isLoading } = trpc.supplier.deviceReview.getPendingDevices.useQuery({
    batchId,
    reviewStatus: filterStatus,
    page,
    pageSize,
  })

  const { data: stats } = trpc.supplier.deviceReview.getBatchReviewStats.useQuery({ batchId })

  const reviewMutation = trpc.supplier.deviceReview.batchReview.useMutation({
    onSuccess: (result) => {
      toast.success(`已${reviewAction === 'approve' ? '通过' : '驳回'} ${result.affected} 台设备`)
      setSelectedIds(new Set())
      setReviewRemark('')
      setReviewDialogOpen(false)
      void utils.supplier.deviceReview.getPendingDevices.invalidate()
      void utils.supplier.deviceReview.getBatchReviewStats.invalidate()
      void utils.supplier.onboardingBatch.getDetailPage.invalidate({ batchId })
    },
    onError: (e) => toast.error(e.message),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(items.map((item) => item.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds)
    if (checked) {
      newSet.add(id)
    } else {
      newSet.delete(id)
    }
    setSelectedIds(newSet)
  }

  const openReviewDialog = (action: 'approve' | 'reject') => {
    if (selectedIds.size === 0) {
      toast.error('请先选择要审核的设备')
      return
    }
    setReviewAction(action)
    setReviewDialogOpen(true)
  }

  const handleReview = () => {
    if (!reviewAction) return
    reviewMutation.mutate({
      deviceIds: Array.from(selectedIds),
      action: reviewAction,
      remark: reviewRemark || undefined,
    })
  }

  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(item.id))
  const someSelected = items.some((item) => selectedIds.has(item.id))

  return (
    <div className="space-y-4">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">待审核</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">已通过</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">已驳回</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter and Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>设备审核</CardTitle>
              <CardDescription>批量审核设备清单，支持逐台通过/驳回</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilterStatus('pending')}
                className={filterStatus === 'pending' ? 'bg-muted' : ''}
              >
                待审核
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilterStatus('approved')}
                className={filterStatus === 'approved' ? 'bg-muted' : ''}
              >
                已通过
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilterStatus('rejected')}
                className={filterStatus === 'rejected' ? 'bg-muted' : ''}
              >
                已驳回
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
              <span className="text-sm">
                已选择 <strong>{selectedIds.size}</strong> 台设备
              </span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => openReviewDialog('approve')} className="gap-2">
                  <Check className="w-4 h-4" />
                  批量通过
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => openReviewDialog('reject')}
                  className="gap-2"
                >
                  <X className="w-4 h-4" />
                  批量驳回
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              加载设备列表...
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {filterStatus === 'pending' ? '暂无待审核设备' : '暂无数据'}
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox checked={allSelected} onCheckedChange={handleSelectAll} />
                      </TableHead>
                      <TableHead>SN</TableHead>
                      <TableHead>GPU 卡型</TableHead>
                      <TableHead>GPU 数量</TableHead>
                      <TableHead>机房</TableHead>
                      <TableHead>内网 IP</TableHead>
                      <TableHead>外网 IP</TableHead>
                      <TableHead>审核状态</TableHead>
                      <TableHead>审核备注</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((device) => (
                      <TableRow key={device.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(device.id)}
                            onCheckedChange={(checked) =>
                              handleSelectOne(device.id, checked as boolean)
                            }
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{device.sn}</TableCell>
                        <TableCell>{device.gpuCardTypeName}</TableCell>
                        <TableCell>{device.gpuCount}</TableCell>
                        <TableCell>{device.dataCenterName}</TableCell>
                        <TableCell className="font-mono text-xs">{device.internalIp ?? '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{device.externalIp ?? '—'}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={reviewStatusColors[device.reviewStatus] ?? ''}
                          >
                            {reviewStatusLabels[device.reviewStatus] ?? device.reviewStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {device.reviewRemark ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex justify-end">
                  <ListPagination
                    page={page}
                    pageSize={pageSize}
                    totalItems={total}
                    totalPages={totalPages}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'approve' ? '批量通过设备' : '批量驳回设备'}
            </DialogTitle>
            <DialogDescription>
              将对选中的 {selectedIds.size} 台设备执行
              {reviewAction === 'approve' ? '审核通过' : '审核驳回'}操作
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>审核备注{reviewAction === 'reject' ? ' *' : ''}</Label>
              <Textarea
                placeholder={
                  reviewAction === 'approve'
                    ? '可选填写通过原因或其他说明...'
                    : '请填写驳回原因，将通知供应商...'
                }
                value={reviewRemark}
                onChange={(e) => setReviewRemark(e.target.value)}
                rows={4}
              />
            </div>

            {reviewAction === 'reject' && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
                <p className="text-sm text-amber-800">
                  驳回后将通过站内信通知供应商，供应商可修正后重新提交审核。
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleReview}
              disabled={reviewMutation.isPending || (reviewAction === 'reject' && !reviewRemark.trim())}
              variant={reviewAction === 'approve' ? 'default' : 'destructive'}
            >
              {reviewMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  处理中...
                </>
              ) : reviewAction === 'approve' ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  确认通过
                </>
              ) : (
                <>
                  <X className="w-4 h-4 mr-2" />
                  确认驳回
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
