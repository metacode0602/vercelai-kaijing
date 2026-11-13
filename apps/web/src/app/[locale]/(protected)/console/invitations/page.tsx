'use client'

import * as React from 'react'
import { ConfirmActionDialog } from '@/components/shared/confirm-action-dialog'
import {
  TableEmptyRow,
  TableErrorRow,
  TableLoadingRow,
} from '@/components/shared/data-table'
import { ListPagination } from '@/components/shared/list-pagination'
import { formatOpsTime } from '@/lib/console/format-time'
import { useListPagination } from '@/lib/pagination/use-list-pagination'
import {
  DEFAULT_PLATFORM_INVITE_ROLE,
  PLATFORM_INVITE_ROLE_LABELS,
} from '@/lib/platform-invite'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { NativeSelect } from '@workspace/ui/components/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import type { PlatformRole } from '@workspace/auth'

const STATUS_LABELS: Record<string, string> = {
  pending: '待接受',
  accepted: '已接受',
  canceled: '已撤销',
  expired: '已过期',
}

function statusVariant(status: string): 'secondary' | 'outline' | 'destructive' {
  if (status === 'pending') return 'secondary'
  if (status === 'accepted') return 'outline'
  return 'destructive'
}

export default function PlatformInvitationsPage() {
  const utils = trpc.useUtils()
  const { page, setPage, pageSize, setPageSize } = useListPagination()
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState<'all' | 'pending' | 'accepted' | 'canceled' | 'expired'>('all')
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [name, setName] = React.useState('')
  const [role, setRole] = React.useState<PlatformRole>(DEFAULT_PLATFORM_INVITE_ROLE)
  const [confirm, setConfirm] = React.useState<{ type: 'cancel' | 'resend'; id: string; label: string } | null>(null)

  const query = trpc.platformInvitations.list.useQuery({
    page,
    pageSize,
    q: q.trim() || undefined,
    status,
  })
  const data = query.data
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))

  const invite = trpc.platformInvitations.invite.useMutation({
    onSuccess: async (result) => {
      setOpen(false)
      setEmail('')
      setPhone('')
      setName('')
      setRole(DEFAULT_PLATFORM_INVITE_ROLE)
      setNotice(result.note)
      await utils.platformInvitations.list.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const cancelInvitation = trpc.platformInvitations.cancel.useMutation({
    onSuccess: async (result) => {
      setConfirm(null)
      setNotice(result.note)
      await utils.platformInvitations.list.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const resendInvitation = trpc.platformInvitations.resend.useMutation({
    onSuccess: async (result) => {
      setConfirm(null)
      setNotice(result.note)
      await utils.platformInvitations.list.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">邀请</h2>
          <p className="text-sm text-muted-foreground">
            邀请用户加入平台组织。可只填手机号或邮箱，也可同时填写（视为同一人）。填写邮箱将发送邀请邮件；填写手机号后，对方用该号验证码登录或注册即可加入。
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>邀请用户</Button>
      </div>

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(event) => {
            setQ(event.target.value)
            setPage(1)
          }}
          placeholder="搜索邮箱 / 手机号 / 邀请人"
          className="w-72"
        />
        <NativeSelect
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as typeof status)
            setPage(1)
          }}
        >
          <option value="all">全部状态</option>
          <option value="pending">待接受</option>
          <option value="accepted">已接受</option>
          <option value="canceled">已撤销</option>
          <option value="expired">已过期</option>
        </NativeSelect>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>邮箱</TableHead>
            <TableHead>手机号</TableHead>
            <TableHead>角色</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>邀请人</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading ? (
            <TableLoadingRow colSpan={7} />
          ) : query.isError ? (
            <TableErrorRow
              colSpan={7}
              message={query.error.message}
              onRetry={() => query.refetch()}
            />
          ) : data?.items.length ? (
            data.items.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-xs">{formatOpsTime(row.createdAt)}</TableCell>
                <TableCell className="font-mono text-xs">{row.email || '—'}</TableCell>
                <TableCell className="font-mono text-xs">{row.phone || '—'}</TableCell>
                <TableCell>{row.roleLabel}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(row.status)}>{STATUS_LABELS[row.status] ?? row.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{row.inviterName}</div>
                  <div className="font-mono text-xs text-muted-foreground">{row.inviterEmail || '—'}</div>
                </TableCell>
                <TableCell className="text-right">
                  {row.storedStatus === 'pending' ? (
                    <div className="flex justify-end gap-2">
                      {row.email ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setConfirm({
                              type: 'resend',
                              id: row.id,
                              label: row.email || row.phone || row.id,
                            })
                          }
                        >
                          重发
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setConfirm({
                            type: 'cancel',
                            id: row.id,
                            label: row.email || row.phone || row.id,
                          })
                        }
                      >
                        撤销
                      </Button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyRow colSpan={7}>暂无邀请。点击右上角「邀请用户」创建一条。</TableEmptyRow>
          )}
        </TableBody>
      </Table>

      <ListPagination
        page={page}
        totalPages={pageCount}
        totalItems={data?.total ?? 0}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="min-w-[35vw] max-w-4xl sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>邀请用户</DialogTitle>
            <DialogDescription>
              至少填写手机号或邮箱，也可同时填写（视为同一个用户，不会拆成两条邀请）。填写邮箱将发送邀请邮件；仅填或同时填写手机号时，不会另发短信邀请函，对方使用该号验证码登录后自动加入平台组织。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">姓名（可选）</Label>
              <Input
                id="invite-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="显示名称"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">邮箱</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="填写则发送邀请邮件"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-phone">手机号</Label>
              <Input
                id="invite-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="11 位中国大陆手机号"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">平台角色</Label>
              <NativeSelect
                id="invite-role"
                value={role}
                onChange={(event) => setRole(event.target.value as PlatformRole)}
              >
                {Object.entries(PLATFORM_INVITE_ROLE_LABELS).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              disabled={invite.isPending}
              onClick={() => {
                const nextPhone = phone.trim()
                const nextEmail = email.trim().toLowerCase()
                if (!nextPhone && !nextEmail) {
                  setNotice('请至少填写手机号或邮箱')
                  return
                }
                invite.mutate({
                  phone: nextPhone || undefined,
                  email: nextEmail || undefined,
                  role,
                  name: name.trim() || undefined,
                  locale: 'zh',
                })
              }}
            >
              {invite.isPending ? '提交中…' : '创建邀请'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={confirm?.type === 'cancel'}
        onOpenChange={(next) => {
          if (!next) setConfirm(null)
        }}
        title="撤销邀请"
        description={`确认撤销对「${confirm?.label ?? ''}」的邀请？撤销后对方将无法再通过此邀请加入。`}
        confirmLabel="确认撤销"
        confirmVariant="destructive"
        pending={cancelInvitation.isPending}
        onConfirm={() => {
          if (confirm?.type === 'cancel') cancelInvitation.mutate({ id: confirm.id })
        }}
      />

      <ConfirmActionDialog
        open={confirm?.type === 'resend'}
        onOpenChange={(next) => {
          if (!next) setConfirm(null)
        }}
        title="重发邀请邮件"
        description={`确认向「${confirm?.label ?? ''}」重发邀请邮件？有效期将重新计算为 7 天。不会发送短信邀请函。`}
        confirmLabel="确认重发"
        pending={resendInvitation.isPending}
        onConfirm={() => {
          if (confirm?.type === 'resend') resendInvitation.mutate({ id: confirm.id, locale: 'zh' })
        }}
      />
    </div>
  )
}
