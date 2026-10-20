'use client'

import { useMemo, useState } from 'react'
import { AppShell } from '@/components/dashboard/app-shell'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@workspace/ui/components/button'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Textarea } from '@workspace/ui/components/textarea'
import { Badge } from '@workspace/ui/components/badge'
import { ListPagination } from '@/components/shared/list-pagination'

const TYPE_LABEL: Record<string, string> = {
  individual: '个人实名',
  enterprise: '企业实名',
  enterprise_upgrade: '升级企业',
  rename: '企业改名',
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  cancelled: '已撤销',
}

export function CrmIdentityReviewsContent() {
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [status, setStatus] = useState('pending')
  const [keyword, setKeyword] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectComment, setRejectComment] = useState('')

  const utils = trpc.useUtils()
  const listQuery = trpc.crm.identityReview.list.useQuery({
    page,
    pageSize,
    status: status || undefined,
    keyword: keyword || undefined,
  })
  const detailQuery = trpc.crm.identityReview.get.useQuery(
    { applicationId: selectedId! },
    { enabled: !!selectedId },
  )
  const approveMutation = trpc.crm.identityReview.approve.useMutation({
    onSuccess: async () => {
      await utils.crm.identityReview.list.invalidate()
      setSelectedId(null)
    },
  })
  const rejectMutation = trpc.crm.identityReview.reject.useMutation({
    onSuccess: async () => {
      await utils.crm.identityReview.list.invalidate()
      setRejectOpen(false)
      setRejectComment('')
      setSelectedId(null)
    },
  })

  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const detail = detailQuery.data

  const suspectHint = useMemo(() => {
    if (!detail?.suspectCustomers?.length) return null
    return detail.suspectCustomers
      .map((c) => `${c.name}(${c.id.slice(0, 8)})`)
      .join('、')
  }, [detail])

  return (
    <AppShell>
      <div className="space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold">实名审核</h1>
          <p className="text-sm text-muted-foreground">
            审核 gpus 提交的个人/企业实名、升级与改名申请
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="pending">待审核</option>
            <option value="approved">已通过</option>
            <option value="rejected">已驳回</option>
            <option value="">全部</option>
          </select>
          <Input
            className="max-w-xs"
            placeholder="搜索姓名/企业/组织"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setPage(1)
            }}
          />
          <Button variant="outline" onClick={() => setPage(1)}>
            查询
          </Button>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead>
                <TableHead>组织</TableHead>
                <TableHead>主体</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>提交时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{TYPE_LABEL[row.type] ?? row.type}</TableCell>
                  <TableCell>{row.organizationName ?? row.organizationId}</TableCell>
                  <TableCell>
                    {row.companyName || row.newCompanyName || row.realName || '—'}
                    {row.idNumberMask ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {row.idNumberMask}
                      </span>
                    ) : null}
                    {row.uscc ? (
                      <span className="ml-2 text-xs text-muted-foreground">{row.uscc}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{STATUS_LABEL[row.status] ?? row.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedId(row.id)}>
                      详情
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    暂无数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <ListPagination
          page={page}
          pageSize={pageSize}
          totalItems={total}
          totalPages={Math.max(1, Math.ceil(total / pageSize))}
          onPageChange={setPage}
        />
      </div>

      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>实名申请详情</DialogTitle>
          </DialogHeader>
          {detailQuery.isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
          {detail && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 text-sm">
                <p>类型：{TYPE_LABEL[detail.type] ?? detail.type}</p>
                <p>状态：{STATUS_LABEL[detail.status] ?? detail.status}</p>
                <p>组织：{detail.organizationName}</p>
                <p>提交人：{detail.submitterName ?? detail.submitterEmail}</p>
                {detail.realName && <p>姓名：{detail.realName}</p>}
                {detail.idNumberMask && <p>证件：{detail.idNumberMask}</p>}
                {detail.mobile && <p>手机：{detail.mobile}</p>}
                {detail.companyName && <p>企业：{detail.companyName}</p>}
                {detail.uscc && <p>USCC：{detail.uscc}</p>}
                {detail.legalPersonName && <p>法人：{detail.legalPersonName}</p>}
                {detail.applicantRole && <p>办理角色：{detail.applicantRole}</p>}
                {detail.authorizedPersonName && <p>授权人：{detail.authorizedPersonName}</p>}
                {detail.newCompanyName && <p>新企业名：{detail.newCompanyName}</p>}
                {detail.renameReason && <p>改名原因：{detail.renameReason}</p>}
                {detail.reviewComment && <p>驳回原因：{detail.reviewComment}</p>}
                {suspectHint && (
                  <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900">
                    疑似已有客户：{suspectHint}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">附件</p>
                {detail.attachments.length === 0 && (
                  <p className="text-sm text-muted-foreground">无附件</p>
                )}
                {detail.attachments.map((a) => (
                  <div key={a.id} className="rounded border p-2 text-sm">
                    <div>
                      {a.kind} · {a.fileName}
                    </div>
                    {a.downloadUrl ? (
                      <a
                        className="text-primary underline"
                        href={a.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        查看/下载
                      </a>
                    ) : (
                      <span className="text-muted-foreground">无法生成下载链接</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {detail?.status === 'pending' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setRejectOpen(true)}
                  disabled={rejectMutation.isPending || approveMutation.isPending}
                >
                  驳回
                </Button>
                <Button
                  onClick={() =>
                    approveMutation.mutate({
                      applicationId: detail.id,
                      bindCustomerId: detail.suspectCustomers[0]?.id,
                    })
                  }
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                >
                  {approveMutation.isPending ? '处理中…' : '通过'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>驳回申请</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="请填写驳回原因"
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
          />
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={!rejectComment.trim() || rejectMutation.isPending || !selectedId}
              onClick={() =>
                selectedId &&
                rejectMutation.mutate({
                  applicationId: selectedId,
                  comment: rejectComment,
                })
              }
            >
              确认驳回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
