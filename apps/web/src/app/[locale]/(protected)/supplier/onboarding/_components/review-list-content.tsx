'use client'

import { useMemo, useState } from 'react'
import {
  CheckCircle,
  Download,
  Eye,
  Factory,
  FileText,
  Image as ImageIcon,
  Search,
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
  companyFullName: string | null
  companyShortName: string | null
  uscc: string | null
  legalPersonName: string | null
  contactPhone: string | null
  supplierStatus: string
  createdAt: Date
  contactEmail: string | null
  ownerPhone: string | null
  cooperationPreferences: Record<string, unknown> | null
}

type OnboardingDoc = {
  fileName: string
  storageUri: string
  mimeType?: string
  kind: string
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

const ROLE_LABELS: Record<string, string> = {
  idc: 'IDC / 数据中心',
  cloud: '云厂商 / MSP',
  hpc: '超算中心 / 高校',
  integrator: '系统集成 / 渠道',
  enterprise: '自建算力企业',
}

const GPU_MODEL_LABELS: Record<string, string> = {
  h100: 'H100 / H200',
  a100: 'A100 / A800',
  l40s: 'L40S / L20',
  '4090': 'RTX 4090 / 4090D',
  cpu: '通用 CPU 服务器',
  other: '其他 / 国产卡',
}

const SCALE_LABELS: Record<string, string> = {
  s: '8 – 64 卡（单机房）',
  m: '64 – 256 卡（单机房 / 双活）',
  l: '256 – 1024 卡（多机房）',
  xl: '1000 卡以上（全国节点）',
}

const MODE_LABELS: Record<string, string> = {
  share: '闲时接入 · 收入分成',
  fixed: '闲时接入 · 固定卡时价',
  private: '私有化部署调度平台',
  oem: 'OEM 版本贴牌',
}

const REGION_LABELS: Record<string, string> = {
  north: '华北 (北京 / 天津 / 河北)',
  east: '华东 (上海 / 江浙)',
  south: '华南 (广深 / 港澳)',
  west: '西南 / 西北 (贵州 / 内蒙 / 宁夏)',
  central: '华中 / 东北',
  overseas: '海外节点',
}

const TIMELINE_LABELS: Record<string, string> = {
  now: '已就绪，随时接入',
  '30d': '30 天内',
  '90d': '60 – 90 天',
  eval: '先评估方案',
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
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>(
    'pending',
  )
  const [page, setPage] = useState(1)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedRow, setSelectedRow] = useState<ReviewRow | null>(null)
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const { data, isLoading } = trpc.supplier.review.list.useQuery(
    {
      search: search.trim() || undefined,
      status: statusFilter,
      page,
      pageSize: 20,
    },
    { placeholderData: (prev) => prev },
  )

  const { data: detail } = trpc.supplier.review.getById.useQuery(
    { id: selectedRow?.id ?? '' },
    { enabled: detailOpen && !!selectedRow?.id },
  )

  const utils = trpc.useUtils()

  const approveMutation = trpc.supplier.review.approve.useMutation({
    onSuccess: () => {
      toast.success('审核通过，已创建供应商主数据')
      setApproveOpen(false)
      setSelectedRow(null)
      void utils.supplier.review.list.invalidate()
      void utils.supplier.list.invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  const rejectMutation = trpc.supplier.review.reject.useMutation({
    onSuccess: () => {
      toast.success('已驳回')
      setRejectOpen(false)
      setSelectedRow(null)
      setRejectReason('')
      void utils.supplier.review.list.invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 20))

  const stats = useMemo(
    () => ({
      pending: statusFilter === 'pending' ? total : items.filter((r) => r.supplierStatus === 'pending').length,
    }),
    [items, statusFilter, total],
  )

  const openDetail = (row: ReviewRow) => {
    setSelectedRow(row)
    setDetailOpen(true)
  }

  const openApprove = (row: ReviewRow) => {
    setSelectedRow(row)
    setApproveOpen(true)
  }

  const openReject = (row: ReviewRow) => {
    setSelectedRow(row)
    setRejectReason('')
    setRejectOpen(true)
  }

  const prefs = detail?.cooperationPreferences

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">供应商入驻审核</h1>
        <p className="text-sm text-muted-foreground">
          审核供应商门户自助入驻申请，通过后创建 CRM 供应商主数据并开放控制台
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Factory className="size-8 text-amber-600 opacity-80" />
            <div>
              <p className="text-xs text-muted-foreground">当前列表条数</p>
              <p className="text-xl font-semibold tabular-nums">{total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">筛选状态</p>
            <p className="text-xl font-semibold">{STATUS_LABEL[statusFilter] ?? '全部'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">本页待审核</p>
            <p className="text-xl font-semibold tabular-nums">{stats.pending}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索公司名称 / USCC / 法人 / 邮箱 / 手机号"
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
              <TableHead>企业全称</TableHead>
              <TableHead>简称</TableHead>
              <TableHead>USCC</TableHead>
              <TableHead>法人</TableHead>
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
                  <TableCell className="max-w-[200px] truncate font-medium">
                    {row.companyFullName ?? row.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {row.companyShortName ?? row.name}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.uscc ?? '-'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.legalPersonName ?? '-'}
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{row.contactEmail ?? '-'}</div>
                    <div className="text-muted-foreground">
                      {row.contactPhone ?? row.ownerPhone ?? '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_BADGE[row.supplierStatus] ?? ''}>
                      {STATUS_LABEL[row.supplierStatus] ?? row.supplierStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
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
                      {row.supplierStatus === 'pending' && (
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
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
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

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>入驻申请详情</DialogTitle>
            <DialogDescription>{selectedRow?.companyFullName ?? selectedRow?.name}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <Row label="企业全称" value={detail.companyFullName} />
              <Row label="企业简称" value={detail.companyShortName} />
              <Row label="统一社会信用代码" value={detail.uscc} mono />
              <Row label="法人姓名" value={detail.legalPersonName} />
              <Row label="联系电话" value={detail.contactPhone} />
              <Row label="注册邮箱" value={detail.contactEmail} />
              <Row label="注册手机号" value={detail.ownerPhone} />
              <Row label="状态" value={STATUS_LABEL[detail.supplierStatus] ?? detail.supplierStatus} />
              <Row label="申请时间" value={formatDate(detail.createdAt)} />
              {prefs && (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-xs font-medium text-muted-foreground">合作意向</p>
                  <div className="space-y-1.5 text-xs">
                    {typeof prefs.role === 'string' && prefs.role && (
                      <PrefRow label="身份角色" value={ROLE_LABELS[prefs.role] ?? prefs.role} />
                    )}
                    {Array.isArray(prefs.models) && prefs.models.length > 0 && (
                      <PrefRow
                        label="设备类型"
                        value={prefs.models.map((m: unknown) => GPU_MODEL_LABELS[String(m)] ?? String(m)).join('、')}
                      />
                    )}
                    {typeof prefs.scale === 'string' && prefs.scale && (
                      <PrefRow label="规模" value={SCALE_LABELS[prefs.scale] ?? prefs.scale} />
                    )}
                    {typeof prefs.mode === 'string' && prefs.mode && (
                      <PrefRow label="合作模式" value={MODE_LABELS[prefs.mode] ?? prefs.mode} />
                    )}
                    {Array.isArray(prefs.regions) && prefs.regions.length > 0 && (
                      <PrefRow
                        label="机房区域"
                        value={prefs.regions.map((r: unknown) => REGION_LABELS[String(r)] ?? String(r)).join('、')}
                      />
                    )}
                    {typeof prefs.timeline === 'string' && prefs.timeline && (
                      <PrefRow label="期望上线时间" value={TIMELINE_LABELS[prefs.timeline] ?? prefs.timeline} />
                    )}
                    {typeof prefs.wechat === 'string' && prefs.wechat && (
                      <PrefRow label="微信 / 手机" value={prefs.wechat} />
                    )}
                  </div>
                </div>
              )}
              {detail.metadata?.rejectReason != null && (
                <Row label="驳回原因" value={String(detail.metadata.rejectReason)} />
              )}
              {detail.metadata?.documents != null &&
                Array.isArray(detail.metadata.documents) &&
                detail.metadata.documents.length > 0 && (
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-xs font-medium text-muted-foreground">上传资料</p>
                    <div className="space-y-2">
                      {(detail.metadata.documents as OnboardingDoc[]).map((doc, i) => {
                        const isImage = doc.mimeType?.startsWith('image/')
                        const downloadUrl = `/api/supplier/onboarding-documents/${encodeURIComponent(doc.storageUri)}`
                        const kindLabel =
                          doc.kind === 'businessLicense'
                            ? '营业执照'
                            : doc.kind === 'legalPersonId'
                              ? '法人身份证'
                              : '其他资料'
                        return (
                          <div key={i} className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2">
                            {isImage ? (
                              <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium">{doc.fileName}</p>
                              <p className="text-[10px] text-muted-foreground">{kindLabel}</p>
                            </div>
                            <a
                              href={downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 rounded p-1 text-muted-foreground transition hover:text-foreground"
                              title="查看/下载"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>审核通过</DialogTitle>
            <DialogDescription>
              确认通过「{selectedRow?.companyFullName ?? selectedRow?.name}」的入驻申请？
              通过后将创建供应商主数据（状态：合作中），并开放供应商控制台。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (!selectedRow) return
                approveMutation.mutate({ id: selectedRow.id })
              }}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? '处理中...' : '确认通过'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>驳回入驻申请</DialogTitle>
            <DialogDescription>驳回后申请人需重新提交。是否确认驳回？</DialogDescription>
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
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-right' : 'text-right'}>{value || '-'}</span>
    </div>
  )
}

function PrefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}
