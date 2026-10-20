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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Badge } from '@workspace/ui/components/badge'
import { Skeleton } from '@workspace/ui/components/skeleton'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@workspace/ui/components/pagination'
import {
  Ban, Check, X, RefreshCw, FileUp, Loader2, AlertTriangle, FileCheck2 } from 'lucide-react'
import { toast } from '@workspace/ui/hooks/use-toast'
import { InvoiceFileUpload, type InvoiceAttachment } from './invoice-file-upload'

const PAGE_SIZE = 20

const STATUS_MAP: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  pending: { label: '待审核', variant: 'secondary' },
  approved: { label: '已批准', variant: 'default' },
  rejected: { label: '已拒绝', variant: 'destructive' },
  issued: { label: '已开具', variant: 'default' },
  cancelled: { label: '已取消', variant: 'outline' },
}

const INVOICE_TYPE_MAP: Record<string, string> = {
  special_vat: '增值税专用发票',
  normal_vat: '增值税普通发票',
  normal_electronic: '电子普通发票',
}

function formatMoney(v: string | number | null | undefined): string {
  if (v == null) return '¥0.00'
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return '¥0.00'
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
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

export function InvoiceRequestListClient() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'pending' | 'approved' | 'rejected' | 'issued' | 'completed' | 'cancelled'
  >('all')
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false)
  const [issueDialogOpen, setIssueDialogOpen] = useState(false)
  const [reviewingRequest, setReviewingRequest] = useState<any | null>(null)
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve')
  const [reviewRemark, setReviewRemark] = useState('')

  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceCode, setInvoiceCode] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [taxAmount, setTaxAmount] = useState('')
  const [taxRate, setTaxRate] = useState('0.06')
  const [issuedAt, setIssuedAt] = useState('')
  const [attachment, setAttachment] = useState<InvoiceAttachment | null>(null)
  const [issuerName, setIssuerName] = useState('')
  const [issuerTaxNo, setIssuerTaxNo] = useState('')
  const [voidDialogOpen, setVoidDialogOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState<any | null>(null)
  const [voidReason, setVoidReason] = useState('')

  const { data, isLoading, refetch, isError } = trpc.supplier.invoiceRequestList.useQuery({
    page,
    pageSize: PAGE_SIZE,
    status: statusFilter === 'all' ? undefined : statusFilter,
  })

  const voidMutation = trpc.supplier.invoiceVoid.useMutation({
    onSuccess: () => {
      toast({ title: '发票已作废' })
      setVoidDialogOpen(false)
      setVoidTarget(null)
      setVoidReason('')
      void refetch()
    },
    onError: (e) => toast({ title: '作废失败', description: e.message, variant: 'destructive' }),
  })

  const reviewMutation = trpc.supplier.invoiceRequestReview.useMutation({
    onSuccess: () => {
      toast({
        title: reviewAction === 'approve' ? '审核通过' : '已拒绝',
        description: '发票申请审核已完成',
      })
      setReviewDialogOpen(false)
      setReviewingRequest(null)
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

  const issueMutation = trpc.supplier.invoiceIssue.useMutation({
    onSuccess: () => {
      toast({
        title: '开具成功',
        description: '发票已成功开具',
      })
      setIssueDialogOpen(false)
      setReviewingRequest(null)
      resetIssueForm()
      refetch()
    },
    onError: (error) => {
      toast({
        title: '开具失败',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const resetIssueForm = useCallback(() => {
    setInvoiceNo('')
    setInvoiceCode('')
    setTotalAmount('')
    setTaxAmount('')
    setTaxRate('0.06')
    setIssuedAt('')
    setAttachment(null)
    setIssuerName('')
    setIssuerTaxNo('')
  }, [])

  const handleReviewClick = useCallback((request: any, action: 'approve' | 'reject') => {
    setReviewingRequest(request)
    setReviewAction(action)
    setReviewRemark('')
    setReviewDialogOpen(true)
  }, [])

  const handleIssueClick = useCallback((request: any) => {
    setReviewingRequest(request)
    setTotalAmount(request.requestAmount ?? '')
    setIssuedAt(new Date().toISOString().split('T')[0] ?? '')
    setIssueDialogOpen(true)
  }, [])

  const handleReviewConfirm = useCallback(() => {
    if (!reviewingRequest) return

    if (reviewAction === 'reject' && !reviewRemark.trim()) {
      toast({
        title: '请填写拒绝原因',
        variant: 'destructive',
      })
      return
    }

    reviewMutation.mutate({
      id: reviewingRequest.id,
      action: reviewAction,
      rejectionReason: reviewRemark.trim() || undefined,
    })
  }, [reviewingRequest, reviewAction, reviewRemark, reviewMutation])

  const handleIssueConfirm = useCallback(() => {
    if (!reviewingRequest) return

    if (!invoiceNo || !totalAmount || !taxAmount || !issuedAt || !attachment) {
      toast({
        title: '请填写必填字段',
        description: '发票号、金额、税额、开票日期和发票附件为必填项',
        variant: 'destructive',
      })
      return
    }

    issueMutation.mutate({
      requestId: reviewingRequest.id,
      invoiceNo,
      invoiceCode: invoiceCode || undefined,
      taxRate: parseFloat(taxRate),
      issuerName: issuerName || undefined,
      issuerTaxNo: issuerTaxNo || undefined,
      pdfUrl: attachment.fileUrl,
      pdfStorageKey: attachment.storageKey || undefined,
      fileMimeType: attachment.mimeType,
      fileSize: attachment.size,
      fileOriginalName: attachment.originalName,
    })
  }, [
    reviewingRequest,
    invoiceNo,
    invoiceCode,
    taxRate,
    issuerName,
    issuerTaxNo,
    attachment,
    issueMutation,
  ])

  const requests = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">发票申请审核</h1>
          <p className="text-muted-foreground text-sm">审核并开具发票</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>发票申请列表</CardTitle>
            <div className="flex items-center gap-2">
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v as typeof statusFilter)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="pending">待审核</SelectItem>
                  <SelectItem value="approved">已批准</SelectItem>
                  <SelectItem value="rejected">已拒绝</SelectItem>
                  <SelectItem value="issued">已开具</SelectItem>
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
                  <TableHead>申请时间</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead>账单月份</TableHead>
                  <TableHead>发票类型</TableHead>
                  <TableHead>申请金额</TableHead>
                  <TableHead>状态</TableHead>
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
                ) : requests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <FileCheck2 className="h-12 w-12 opacity-50" />
                        <div>
                          <p className="font-medium">暂无发票申请</p>
                          <p className="text-sm">等待供应商提交发票申请</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  requests.map((request: any) => {
                    const statusInfo =
                      STATUS_MAP[request.status] ?? { label: request.status, variant: 'outline' as const }
                    return (
                      <TableRow key={request.id}>
                        <TableCell className="text-sm">
                          {new Date(request.createdAt).toLocaleString('zh-CN')}
                        </TableCell>
                        <TableCell>{request.supplierName ?? '—'}</TableCell>
                        <TableCell className="font-medium">{request.billMonth}</TableCell>
                        <TableCell>{INVOICE_TYPE_MAP[request.invoiceType] ?? request.invoiceType}</TableCell>
                        <TableCell className="font-medium">{formatMoney(request.requestAmount)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                            {request.invoiceVoidStatus === 'voided' && (
                              <Badge
                                variant="destructive"
                                title={request.invoiceVoidReason ?? undefined}
                              >
                                发票已作废
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {request.status === 'pending' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleReviewClick(request, 'approve')}
                                  disabled={reviewMutation.isPending}
                                  title="批准"
                                >
                                  <Check className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleReviewClick(request, 'reject')}
                                  disabled={reviewMutation.isPending}
                                  title="拒绝"
                                >
                                  <X className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                            {request.status === 'approved' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleIssueClick(request)}
                                disabled={issueMutation.isPending}
                                title="开具发票"
                              >
                                <FileUp className="h-4 w-4" />
                              </Button>
                            )}
                            {/* 作废：仅已开具且未作废时可点。voided 后申请单会被退回
                                approved，此时应由「开具」按钮接管，而非继续显示作废。 */}
                            {request.status === 'issued' &&
                              request.invoiceVoidStatus !== 'voided' &&
                              request.invoiceId && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setVoidTarget(request)
                                    setVoidReason('')
                                    setVoidDialogOpen(true)
                                  }}
                                  disabled={voidMutation.isPending}
                                  title="作废发票"
                                >
                                  <Ban className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                          </div>
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
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const pageNum = page <= 3 ? i + 1 : page - 2 + i
                    if (pageNum > totalPages) return null
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
            <DialogTitle>{reviewAction === 'approve' ? '批准发票申请' : '拒绝发票申请'}</DialogTitle>
            <DialogDescription>
              {reviewAction === 'approve'
                ? '确认批准该发票申请？批准后可继续开具发票。'
                : '确认拒绝该发票申请？请填写拒绝原因。'}
            </DialogDescription>
          </DialogHeader>
          {reviewingRequest && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <p className="text-sm">
                  <span className="text-muted-foreground">供应商：</span>
                  <span className="font-medium">{reviewingRequest.supplierName}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">账单月份：</span>
                  <span className="font-medium">{reviewingRequest.billMonth}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">申请金额：</span>
                  <span className="font-medium">{formatMoney(reviewingRequest.requestAmount)}</span>
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="remark">
                  {reviewAction === 'approve' ? '审核备注' : '拒绝原因'}{' '}
                  {reviewAction === 'reject' && <span className="text-destructive">*</span>}
                </Label>
                <Textarea
                  id="remark"
                  placeholder={reviewAction === 'approve' ? '审核备注（可选）' : '请填写拒绝原因'}
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

      <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>作废发票</DialogTitle>
            <DialogDescription>
              作废后该发票票据失效，账单收款状态不受影响。作废原因会记入操作审计。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="voidReason">作废原因（必填）</Label>
            <Textarea
              id="voidReason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="例如：开票金额有误，需重新开具"
              maxLength={500}
            />
            {voidTarget?.invoiceNo && (
              <p className="text-muted-foreground text-sm">发票号：{voidTarget.invoiceNo}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidDialogOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!voidReason.trim() || voidMutation.isPending}
              onClick={() => {
                if (!voidTarget?.invoiceId) return
                voidMutation.mutate({ id: voidTarget.invoiceId, reason: voidReason.trim() })
              }}
            >
              确认作废
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>开具发票</DialogTitle>
            <DialogDescription>填写发票信息并上传 PDF</DialogDescription>
          </DialogHeader>
          {reviewingRequest && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <p className="text-sm">
                  <span className="text-muted-foreground">供应商：</span>
                  <span className="font-medium">{reviewingRequest.supplierName}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">账单月份：</span>
                  <span className="font-medium">{reviewingRequest.billMonth}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">发票类型：</span>
                  <span className="font-medium">
                    {INVOICE_TYPE_MAP[reviewingRequest.invoiceType] ?? reviewingRequest.invoiceType}
                  </span>
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invoiceNo">
                    发票号码 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="invoiceNo"
                    placeholder="发票号码"
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoiceCode">发票代码</Label>
                  <Input
                    id="invoiceCode"
                    placeholder="发票代码（可选）"
                    value={invoiceCode}
                    onChange={(e) => setInvoiceCode(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="totalAmount">
                    价税合计 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="totalAmount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxAmount">
                    税额 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="taxAmount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={taxAmount}
                    onChange={(e) => setTaxAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxRate">税率</Label>
                  <Select value={taxRate} onValueChange={setTaxRate}>
                    <SelectTrigger id="taxRate">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="0.03">3%</SelectItem>
                      <SelectItem value="0.06">6%</SelectItem>
                      <SelectItem value="0.09">9%</SelectItem>
                      <SelectItem value="0.13">13%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="issuedAt">
                  开票日期 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="issuedAt"
                  type="date"
                  value={issuedAt}
                  onChange={(e) => setIssuedAt(e.target.value)}
                />
              </div>

              <InvoiceFileUpload
                attachment={attachment}
                onAttachmentChange={setAttachment}
                required
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="issuerName">开票方名称</Label>
                  <Input
                    id="issuerName"
                    placeholder="开票方名称（可选）"
                    value={issuerName}
                    onChange={(e) => setIssuerName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="issuerTaxNo">开票方税号</Label>
                  <Input
                    id="issuerTaxNo"
                    placeholder="开票方税号（可选）"
                    value={issuerTaxNo}
                    onChange={(e) => setIssuerTaxNo(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleIssueConfirm} disabled={issueMutation.isPending}>
              {issueMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  开具中...
                </>
              ) : (
                '开具发票'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
