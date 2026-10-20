'use client'

import { useMemo, useState } from 'react'
import {
  CheckCircle,
  Eye,
  Search,
  Store,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent } from '@workspace/ui/components/card'
import { Input } from '@workspace/ui/components/input'
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
import { Label } from '@workspace/ui/components/label'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'

type ReviewRow = {
  id: string
  name: string
  merchantType: 'enterprise' | 'individual'
  companyFullName: string | null
  unifiedSocialCreditCode: string | null
  legalPersonName: string | null
  legalPersonIdNumber: string | null
  licenseDataUrl: string | null
  idNumber: string | null
  idCardFrontDataUrl: string | null
  idCardBackDataUrl: string | null
  merchantStatus: string
  createdAt: Date
  contactEmail: string | null
  contactPhone: string | null
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
  approved: 'border-green-500/40 text-green-700 dark:text-green-300',
  rejected: 'border-red-500/40 text-red-700 dark:text-red-300',
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
}

const MERCHANT_TYPE_LABEL: Record<string, string> = {
  enterprise: '企业',
  individual: '个人',
}

function formatDate(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ReviewListContent() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [page, setPage] = useState(1)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedRow, setSelectedRow] = useState<ReviewRow | null>(null)
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [approveType, setApproveType] = useState<'partner' | 'platform_direct'>('partner')

  const { data, isLoading, refetch } = trpc.merchant.review.list.useQuery(
    { search: search.trim() || undefined, status: statusFilter, page, pageSize: 20 },
    { placeholderData: (prev) => prev },
  )

  const { data: detail } = trpc.merchant.review.getById.useQuery(
    { id: selectedRow?.id ?? '' },
    { enabled: detailOpen && !!selectedRow?.id },
  )

  const utils = trpc.useUtils()

  const approveMutation = trpc.merchant.review.approve.useMutation({
    onSuccess: () => {
      toast.success('审核通过')
      setApproveOpen(false)
      setSelectedRow(null)
      utils.merchant.review.list.invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  const rejectMutation = trpc.merchant.review.reject.useMutation({
    onSuccess: () => {
      toast.success('已驳回')
      setRejectOpen(false)
      setSelectedRow(null)
      setRejectReason('')
      utils.merchant.review.list.invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 20))

  const stats = useMemo(
    () => ({
      pending: items.filter((r) => r.merchantStatus === 'pending').length,
      enterprise: items.filter((r) => r.merchantType === 'enterprise').length,
      individual: items.filter((r) => r.merchantType === 'individual').length,
    }),
    [items],
  )

  const openDetail = (row: ReviewRow) => {
    setSelectedRow(row)
    setDetailOpen(true)
  }

  const openApprove = (row: ReviewRow) => {
    setSelectedRow(row)
    setApproveType('partner')
    setApproveOpen(true)
  }

  const openReject = (row: ReviewRow) => {
    setSelectedRow(row)
    setRejectReason('')
    setRejectOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">商户入驻审核</h1>
        <p className="text-sm text-muted-foreground">审核商户自助入驻申请，通过后自动创建商户记录</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Store className="size-8 text-amber-600 opacity-80" />
            <div>
              <p className="text-xs text-muted-foreground">待审核</p>
              <p className="text-xl font-semibold tabular-nums">{stats.pending}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">企业申请</p>
            <p className="text-xl font-semibold tabular-nums">{stats.enterprise}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">个人申请</p>
            <p className="text-xl font-semibold tabular-nums">{stats.individual}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="搜索公司名称 / USCC / 姓名 / 身份证号 / 邮箱 / 手机号"
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as typeof statusFilter)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">待审核</SelectItem>
            <SelectItem value="approved">已通过</SelectItem>
            <SelectItem value="rejected">已驳回</SelectItem>
            <SelectItem value="all">全部</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">共 {total} 条</span>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>商户类型</TableHead>
              <TableHead>公司 / 姓名</TableHead>
              <TableHead>USCC / 身份证号</TableHead>
              <TableHead>法人 / 联系人</TableHead>
              <TableHead>联系方式</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>申请时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {MERCHANT_TYPE_LABEL[row.merchantType] ?? row.merchantType}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {row.merchantType === 'enterprise'
                      ? (row.companyFullName ?? row.name)
                      : row.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">
                    {row.merchantType === 'enterprise'
                      ? (row.unifiedSocialCreditCode ?? '-')
                      : (row.idNumber ?? '-')}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {row.merchantType === 'enterprise'
                      ? (row.legalPersonName ?? '-')
                      : row.name}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{row.contactEmail ?? '-'}</div>
                    <div className="text-muted-foreground">{row.contactPhone ?? '-'}</div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_BADGE[row.merchantStatus] ?? ''}
                    >
                      {STATUS_LABEL[row.merchantStatus] ?? row.merchantStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {formatDate(row.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title="查看详情"
                        onClick={() => openDetail(row)}
                      >
                        <Eye className="size-4" />
                      </Button>
                      {row.merchantStatus === 'pending' && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-green-600"
                            title="审核通过"
                            onClick={() => openApprove(row)}
                          >
                            <CheckCircle className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            title="驳回"
                            onClick={() => openReject(row)}
                          >
                            <XCircle className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </Button>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>入驻申请详情</DialogTitle>
            <DialogDescription>
              {selectedRow?.merchantType === 'enterprise' ? '企业入驻' : '个人入驻'} — {selectedRow?.name}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              {detail.merchantType === 'enterprise' ? (
                <>
                  <Row label="公司全称" value={detail.companyFullName} />
                  <Row label="统一社会信用代码" value={detail.unifiedSocialCreditCode} mono />
                  <Row label="法人姓名" value={detail.legalPersonName} />
                  <Row label="法人身份证号" value={detail.legalPersonIdNumber} mono />
                  {detail.licenseDataUrl && (
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">营业执照</Label>
                      <img
                        src={detail.licenseDataUrl}
                        alt="营业执照"
                        className="rounded border max-h-48 object-contain"
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Row label="姓名" value={detail.name} />
                  <Row label="身份证号" value={detail.idNumber} mono />
                  {detail.idCardFrontDataUrl && (
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">身份证正面</Label>
                      <img
                        src={detail.idCardFrontDataUrl}
                        alt="身份证正面"
                        className="rounded border max-h-48 object-contain"
                      />
                    </div>
                  )}
                  {detail.idCardBackDataUrl && (
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">身份证反面</Label>
                      <img
                        src={detail.idCardBackDataUrl}
                        alt="身份证反面"
                        className="rounded border max-h-48 object-contain"
                      />
                    </div>
                  )}
                </>
              )}
              <Row label="状态" value={STATUS_LABEL[detail.merchantStatus] ?? detail.merchantStatus} />
              <Row label="注册邮箱" value={detail.contactEmail} />
              <Row label="注册手机号" value={detail.contactPhone} />
              <Row label="申请时间" value={formatDate(detail.createdAt)} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>审核通过</DialogTitle>
            <DialogDescription>
              确认通过 {selectedRow?.merchantType === 'enterprise' ? '企业' : '个人'}入驻申请？
              通过后将自动创建商户记录。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>商户类型</Label>
            <Select value={approveType} onValueChange={(v) => setApproveType(v as typeof approveType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="partner">合作伙伴</SelectItem>
                <SelectItem value="platform_direct">平台直营</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (!selectedRow) return
                approveMutation.mutate({ id: selectedRow.id, merchantType: approveType })
              }}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? '处理中...' : '确认通过'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>驳回入驻申请</DialogTitle>
            <DialogDescription>
              驳回后申请人可重新提交。是否确认驳回？
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>驳回原因（可选）</Label>
            <Textarea
              placeholder="请输入驳回原因..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!selectedRow) return
                rejectMutation.mutate({ id: selectedRow.id, reason: rejectReason || undefined })
              }}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? '处理中...' : '确认驳回'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono' : ''}>{value || '-'}</span>
    </div>
  )
}
