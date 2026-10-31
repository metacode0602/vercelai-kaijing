'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { ConsoleListSection, useConsolePagination } from '@/components/console/list'
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
import { labelStatus } from '@/lib/console/labels'
import { addMember, updateMember, useMembers } from '@/lib/crossborder/member-store'

export default function SettingsMembersPage() {
  const rows = useMembers()
  const { pagedRows, pagination } = useConsolePagination(rows)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const editor = open ? (
    <UedDialog
      title="邀请成员"
      description="邀请后成员进入启用状态；人员下拉只读取启用成员。所有者不可停用。"
      fields={[
        { key: 'name', label: '姓名', required: true },
        { key: 'email', label: '邮箱', type: 'email', required: true },
        { key: 'role', label: '角色', options: ['admin', 'member', 'viewer'], required: true },
        { key: 'status', label: '状态', options: ['启用', '停用'], required: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const email = (values.email || '').trim().toLowerCase()
        if (!email) return
        if (rows.some((row) => row.email.toLowerCase() === email)) {
          setNotice(`${email} 已在成员列表中，请直接调整角色或状态。`)
          return
        }
        addMember(rows, {
          name: values.name || email,
          email,
          role: (values.role || 'member') as 'admin' | 'member' | 'viewer',
          status: values.status === '停用' ? '停用' : '启用',
        })
        setOpen(false)
        setNotice(`${email} 已加入本次原型会话；人员下拉会读取启用成员。`)
      }}
      saveLabel="发送邀请"
    />
  ) : null

  return (
    <div className="space-y-4">
      {editor}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">组织成员</h2>
          <p className="text-sm text-muted-foreground">维护组织成员与启停状态；人员下拉只读取启用成员。</p>
        </div>
        <Button onClick={() => setOpen(true)}>邀请成员</Button>
      </div>
      <UedPrototypeNotice>
        原型会话使用本地存储；正式环境邀请需邮件确认，角色权限由后端校验。所有者不可停用，停用成员保留历史单据归属。
      </UedPrototypeNotice>
      <ConsoleListSection
        title="成员列表"
        description={`共 ${rows.length} 条`}
        pagination={pagination}
      >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>姓名</TableHead>
            <TableHead>邮箱</TableHead>
            <TableHead>角色</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedRows.map((member) => (
            <TableRow key={member.id}>
              <TableCell className="font-medium">{member.name}</TableCell>
              <TableCell>{member.email}</TableCell>
              <TableCell>
                <Badge variant="secondary">{labelStatus(member.role)}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={member.status === '启用' ? 'secondary' : 'outline'}>{member.status}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={member.role === 'owner'}
                  title={member.role === 'owner' ? '所有者不可停用' : undefined}
                  onClick={() => {
                    const nextStatus = member.status === '启用' ? '停用' : '启用'
                    updateMember(rows, member.id, { status: nextStatus })
                    setNotice(`${member.email} 已${nextStatus === '启用' ? '启用' : '停用'}（原型会话）。`)
                  }}
                >
                  {member.status === '启用' ? '停用' : '启用'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </ConsoleListSection>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
