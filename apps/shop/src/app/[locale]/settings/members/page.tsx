'use client'

import * as React from 'react'
import { ConsoleListSection, useConsolePagination } from '@/components/console/list'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Checkbox } from '@workspace/ui/components/checkbox'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table'
import { trpc } from '@/lib/trpc/client'

const DEFAULT_ROLE = 'operator'

export default function SettingsMembersPage() {
  const utils = trpc.useUtils()
  const listQuery = trpc.members.list.useQuery({})
  const catalogQuery = trpc.roles.catalog.useQuery()
  const rows = listQuery.data ?? []
  const { pagedRows, pagination } = useConsolePagination(rows)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [name, setName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [roleCodes, setRoleCodes] = React.useState<string[]>([DEFAULT_ROLE])

  const invite = trpc.members.invite.useMutation({
    onSuccess: async (res) => {
      setOpen(false)
      setName('')
      setPhone('')
      setEmail('')
      setRoleCodes([DEFAULT_ROLE])
      setNotice(res.note)
      await utils.members.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const cancelInvitation = trpc.members.cancelInvitation.useMutation({
    onSuccess: async (res) => {
      setNotice(res.note)
      await utils.members.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })

  const toggleRole = (code: string, value: boolean) => {
    setRoleCodes((prev) => {
      const next = value ? [...new Set([...prev, code])] : prev.filter((item) => item !== code)
      return next.length > 0 ? next : [DEFAULT_ROLE]
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">组织成员</h2>
          <p className="text-sm text-muted-foreground">
            管理账号邀请与撤销。业务权限请到「角色权限」分配；邀请时可选择一个或多个业务角色，默认为运营。
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>邀请成员</Button>
      </div>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      <ConsoleListSection title="成员列表" description={listQuery.isLoading ? '加载中…' : `共 ${rows.length} 条`} pagination={pagination}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>手机号</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>业务角色</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  暂无成员。请确认组织上下文或邀请。
                </TableCell>
              </TableRow>
            ) : (
              pagedRows.map((row) => (
                <TableRow key={`${row.source}-${row.id}`}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="font-mono text-xs">{row.phone || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{row.email || '—'}</TableCell>
                  <TableCell>{row.role}</TableCell>
                  <TableCell>
                    {row.source === 'invitation'
                      ? row.emailSent
                        ? '待接受 · 已发邮件'
                        : '待接受 · 待手机登录绑定'
                      : '成员'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.source === 'invitation' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cancelInvitation.isPending}
                        onClick={() => cancelInvitation.mutate({ id: row.id })}
                      >
                        撤销邀请
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ConsoleListSection>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>邀请成员</DialogTitle>
            <DialogDescription>
              至少填写手机号或邮箱。填写邮箱将发送邀请邮件；受邀人设密后需重新登录。仅填手机号时，对方用该号验证码登录后自动加入本组织。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">姓名（可选）</Label>
              <Input id="invite-name" value={name} onChange={(event) => setName(event.target.value)} />
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
              <Label htmlFor="invite-email">邮箱（可选，填写则发信）</Label>
              <Input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>业务角色</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {(catalogQuery.data?.systemRoles ?? []).map((item) => (
                  <label key={item.code} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={roleCodes.includes(item.code)}
                      onCheckedChange={(value) => toggleRole(item.code, value === true)}
                    />
                    <span>
                      {item.name}
                      <span className="ml-1 font-mono text-xs text-muted-foreground">{item.code}</span>
                    </span>
                  </label>
                ))}
              </div>
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
                  roles: roleCodes.length > 0 ? roleCodes : [DEFAULT_ROLE],
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
    </div>
  )
}
