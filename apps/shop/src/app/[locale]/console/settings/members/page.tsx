'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { ConsoleListSection, useConsolePagination } from '@/components/console/list'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table'
import { trpc } from '@/lib/trpc/client'

export default function SettingsMembersPage() {
  const utils = trpc.useUtils()
  const listQuery = trpc.members.list.useQuery({})
  const rows = listQuery.data ?? []
  const { pagedRows, pagination } = useConsolePagination(rows)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const invite = trpc.members.invite.useMutation({
    onSuccess: async (res) => {
      setOpen(false)
      setNotice(res.note)
      await utils.members.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const updateRole = trpc.members.updateRole.useMutation({
    onSuccess: async () => {
      setNotice('角色已更新。')
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

  const editor = open ? (
    <UedDialog
      title="邀请成员"
      description="至少填写手机号或邮箱。填写邮箱将发送邀请邮件；受邀人设密后需重新登录。仅填手机号时，对方用该号 OTP 登录后自动加入本组织。"
      fields={[
        { key: 'name', label: '姓名（可选）' },
        { key: 'phone', label: '手机号', placeholder: '11 位中国大陆手机号' },
        { key: 'email', label: '邮箱（可选，填写则发信）', type: 'email' },
        { key: 'role', label: '角色', options: ['admin', 'member', 'viewer'], required: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const phone = (values.phone || '').trim()
        const email = (values.email || '').trim().toLowerCase()
        if (!phone && !email) {
          setNotice('请至少填写手机号或邮箱')
          return
        }
        invite.mutate({
          phone: phone || undefined,
          email: email || undefined,
          role: values.role || 'member',
          name: values.name,
          locale: 'zh',
        })
      }}
      saveLabel={invite.isPending ? '提交中…' : '创建邀请'}
    />
  ) : null

  return (
    <div className="space-y-4">
      {editor}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">组织成员</h2>
          <p className="text-sm text-muted-foreground">
            better-auth member + invitation；支持手机号自动绑定与邮箱邀请设密。
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>邀请成员</Button>
      </div>
      <UedPrototypeNotice>
        列表展示组织成员；有邮箱的邀请会发送邮件，纯手机邀请在验证码登录时自动加入组织。仅 owner
        可撤销待接受的邀请，本页不支持移除成员或变更 owner。
      </UedPrototypeNotice>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      <ConsoleListSection title="成员列表" description={listQuery.isLoading ? '加载中…' : `共 ${rows.length} 条`} pagination={pagination}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>手机号</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>角色</TableHead>
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
                    <div className="flex flex-wrap justify-end gap-2">
                      {row.source === 'member' && row.role !== 'owner' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateRole.mutate({
                              id: row.id,
                              role: row.role === 'admin' ? 'member' : 'admin',
                            })
                          }
                        >
                          切换 admin/member
                        </Button>
                      ) : null}
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
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ConsoleListSection>
    </div>
  )
}
