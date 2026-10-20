'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
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
import { Textarea } from '@workspace/ui/components/textarea'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { ListPagination } from '@/components/shared/list-pagination'
import { trpc } from '@/lib/trpc/client'
import type { PayoutAccountReviewRow } from '@/lib/server/dataaccess/merchant/merchant-payout-account-review'

const STATUS_LABEL: Record<string, string> = {
  pending_review: '待审核',
  active: '已生效',
  rejected: '已驳回',
  disabled: '已停用',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending_review: 'outline',
  active: 'default',
  rejected: 'destructive',
  disabled: 'secondary',
}

type Props = {
  items: PayoutAccountReviewRow[]
  total: number
  page: number
  pageSize: number
  pendingCount: number
  status?: string
  ownerType?: string
  search?: string
}

/**
 * 收款账户审核面板
 *
 * 三条硬约束在 UI 层也做了兜底，避免运营做出无法回滚的操作：
 *   - 生效中的账户不能「驳回」（可能已在打款途中），只能先停用
 *   - 停用会让该商户失去打款目标，弹窗明确提示
 *   - 审核通过会自动停用原默认账户，弹窗提前告知
 */
export function PayoutAccountsPanel({
  items,
  total,
  page,
  pageSize,
  pendingCount,
  status,
  ownerType,
  search,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<PayoutAccountReviewRow | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [disableTarget, setDisableTarget] = useState<PayoutAccountReviewRow | null>(null)
  const [disableReason, setDisableReason] = useState('')
  const [auditTarget, setAuditTarget] = useState<PayoutAccountReviewRow | null>(null)

  const utils = trpc.useUtils()
  const invalidate = () => {
    void utils.merchant.payoutAccount.invalidate()
    startTransition(() => router.refresh())
  }

  const approve = trpc.merchant.payoutAccount.approve.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.disabledPreviousId ? '已通过，原默认账户已自动停用' : '已通过审核',
      )
      invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  const reject = trpc.merchant.payoutAccount.reject.useMutation({
    onSuccess: () => {
      toast.success('已驳回')
      setRejectTarget(null)
      setRejectReason('')
      invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  const disable = trpc.merchant.payoutAccount.disable.useMutation({
    onSuccess: () => {
      toast.success('已停用')
      setDisableTarget(null)
      setDisableReason('')
      invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  const go = (next: Record<string, string | undefined>) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v)
    startTransition(() => router.push(`?${qs.toString()}`))
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">收款账户审核</h1>
          <p className="text-muted-foreground text-sm">
            商户提交的收款账户需审核通过后，平台才会向其打款
            {pendingCount > 0 && (
              <Badge variant="outline" className="ml-2">
                {pendingCount} 条待审核
              </Badge>
            )}
          </p>
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            go({
              status,
              ownerType,
              search: String(fd.get('search') ?? '') || undefined,
              page: undefined,
              pageSize: String(pageSize),
            })
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="pa-status">状态</Label>
            <select
              id="pa-status"
              name="status"
              defaultValue={status ?? ''}
              className="border-input h-9 rounded-md border px-2 text-sm"
            >
              <option value="">全部</option>
              <option value="pending_review">待审核</option>
              <option value="active">已生效</option>
              <option value="rejected">已驳回</option>
              <option value="disabled">已停用</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pa-owner">归属</Label>
            <select
              id="pa-owner"
              name="ownerType"
              defaultValue={ownerType ?? ''}
              className="border-input h-9 rounded-md border px-2 text-sm"
            >
              <option value="">全部</option>
              <option value="merchant">商户</option>
              <option value="supplier">供应商</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pa-search">开户名 / 银行</Label>
            <Input id="pa-search" name="search" defaultValue={search} placeholder="模糊搜索" />
          </div>
          <Button type="submit" variant="outline" size="sm">
            筛选
          </Button>
        </form>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>归属</TableHead>
              <TableHead>开户名</TableHead>
              <TableHead>银行账号</TableHead>
              <TableHead>开户行</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>默认</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground py-8 text-center">
                  暂无收款账户
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="text-sm font-medium">{row.ownerName}</div>
                    <div className="text-muted-foreground text-xs">
                      {row.ownerType === 'merchant' ? '商户' : '供应商'}
                    </div>
                  </TableCell>
                  <TableCell>{row.accountName}</TableCell>
                  <TableCell className="font-mono text-xs">{row.accountNoMasked}</TableCell>
                  <TableCell>
                    <div className="text-sm">{row.bankName}</div>
                    {row.bankBranch && (
                      <div className="text-muted-foreground text-xs">{row.bankBranch}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.accountType === 'enterprise' ? '对公' : '个人'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[row.status] ?? 'outline'}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </Badge>
                    {row.rejectReason && (
                      <div className="text-muted-foreground mt-1 max-w-40 text-xs">
                        {row.rejectReason}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{row.isDefault ? '是' : '—'}</TableCell>
                  <TableCell className="space-x-1 text-right">
                    {row.status === 'pending_review' && (
                      <>
                        <Button
                          size="sm"
                          disabled={busyId === row.id}
                          onClick={() => {
                            setBusyId(row.id)
                            approve.mutate({ payoutAccountId: row.id })
                          }}
                        >
                          通过
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRejectTarget(row)}>
                          驳回
                        </Button>
                      </>
                    )}
                    {row.status === 'active' && (
                      <Button size="sm" variant="outline" onClick={() => setDisableTarget(row)}>
                        停用
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setAuditTarget(row)}>
                      日志
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <ListPagination
          page={page}
          totalPages={totalPages}
          totalItems={total}
          pageSize={pageSize}
          onPageChange={(p) => go({ status, ownerType, search, page: String(p), pageSize: String(pageSize) })}
        />
      </div>

      <RejectDialog
        target={rejectTarget}
        reason={rejectReason}
        setReason={setRejectReason}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null)
            setRejectReason('')
          }
        }}
        onConfirm={() => {
          if (!rejectTarget) return
          reject.mutate({ payoutAccountId: rejectTarget.id, reason: rejectReason })
        }}
        loading={reject.isPending}
      />

      <Dialog
        open={!!disableTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDisableTarget(null)
            setDisableReason('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>停用收款账户</DialogTitle>
            <DialogDescription>
              停用后 <strong>{disableTarget?.ownerName}</strong> 将失去生效的打款目标，
              平台佣金将无处可付。确认停用？
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="disable-reason">停用原因（可选）</Label>
            <Textarea
              id="disable-reason"
              rows={3}
              value={disableReason}
              onChange={(e) => setDisableReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDisableTarget(null)
                setDisableReason('')
              }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={disable.isPending}
              onClick={() => {
                if (disableTarget) {
                  disable.mutate({ payoutAccountId: disableTarget.id, reason: disableReason || undefined })
                }
              }}
            >
              确认停用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AuditDialog target={auditTarget} onOpenChange={(open) => !open && setAuditTarget(null)} />
    </div>
  )
}

function RejectDialog({
  target,
  reason,
  setReason,
  onOpenChange,
  onConfirm,
  loading,
}: {
  target: PayoutAccountReviewRow | null
  reason: string
  setReason: (v: string) => void
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  loading: boolean
}) {
  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>驳回收款账户</DialogTitle>
          <DialogDescription>
            驳回原因会展示给商户，请写清需要修正的内容（必填）。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reject-reason">驳回原因</Label>
          <Textarea
            id="reject-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={loading || !reason.trim()}
            onClick={onConfirm}
          >
            确认驳回
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const AUDIT_ACTION_LABEL: Record<string, string> = {
  submit: '商户提交',
  approve: '审核通过',
  reject: '驳回',
  disable: '停用',
  superseded: '被新默认账户取代',
}

function AuditDialog({
  target,
  onOpenChange,
}: {
  target: PayoutAccountReviewRow | null
  onOpenChange: (open: boolean) => void
}) {
  const [open, setOpen] = useState(!!target)
  const { data, isLoading } = trpc.merchant.payoutAccount.auditLog.useQuery(
    { payoutAccountId: target?.id ?? '' },
    { enabled: !!target && open },
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onOpenChange(false)
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>账户操作日志</DialogTitle>
          <DialogDescription>
            {target?.ownerName} · {target?.accountName} · {target?.accountNoMasked}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-auto">
          {isLoading ? (
            <p className="text-muted-foreground py-6 text-center text-sm">加载中…</p>
          ) : !data || data.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">暂无日志</p>
          ) : (
            <ol className="space-y-3">
              {data.map((log) => (
                <li key={log.id} className="border-l-2 pl-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">
                      {AUDIT_ACTION_LABEL[log.action] ?? log.action}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {new Date(log.occurredAt).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    操作人：{log.operatorName ?? log.operatorStaffId ?? '—'}
                    {log.remark ? ` · ${log.remark}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
