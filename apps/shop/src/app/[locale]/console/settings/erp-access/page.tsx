'use client'

import * as React from 'react'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { ConsoleListSection, useConsolePagination } from '@/components/console/list'
import { Badge } from '@workspace/ui/components/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

/** 静态策略说明（非演示业务数据行） */
const POLICY_NOTES = [
  { role: 'owner / admin', scope: '全组织', permissions: '配置 / 审核 / 读写', note: 'better-auth 组织角色' },
  { role: 'member', scope: '组织业务', permissions: '业务读写（待细粒度 RBAC）', note: '细粒度 scope 待权限服务' },
  { role: 'viewer', scope: '只读', permissions: '查看', note: '不可写配置' },
]

export default function AccessControlPage() {
  const membersQuery = trpc.members.list.useQuery({})
  const members = (membersQuery.data ?? []).filter((m) => m.source === 'member')
  const { pagedRows, pagination } = useConsolePagination(members)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">角色与数据范围</h2>
        <p className="text-sm text-muted-foreground">成员来自 better-auth；细粒度 ERP 角色矩阵待权限服务，不再展示 DEMO 角色行。</p>
      </div>
      <Alert>
        <AlertTitle>待权限服务 / RBAC</AlertTitle>
        <AlertDescription>
          下一步：对接组织角色策略与店铺 scope 校验。当前仅展示真实成员与静态策略说明，禁止把演示矩阵当成已生效权限。
        </AlertDescription>
      </Alert>
      <UedPrototypeNotice>已移除 ERP_DEMO_ROLES。成员列表读 member 表。</UedPrototypeNotice>

      <ConsoleListSection title="组织成员（真实）" description={membersQuery.isLoading ? '加载中…' : `共 ${members.length} 人`} pagination={pagination}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-sm text-muted-foreground">
                  暂无成员。
                </TableCell>
              </TableRow>
            ) : (
              pagedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="font-mono text-xs">{row.email}</TableCell>
                  <TableCell>{row.role}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </ConsoleListSection>

      <ConsoleListSection title="策略说明（静态，非演示业务数据）" description={`${POLICY_NOTES.length} 条`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>角色</TableHead>
              <TableHead>数据范围</TableHead>
              <TableHead>权限摘要</TableHead>
              <TableHead>说明</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {POLICY_NOTES.map((row) => (
              <TableRow key={row.role}>
                <TableCell>{row.role}</TableCell>
                <TableCell>{row.scope}</TableCell>
                <TableCell>{row.permissions}</TableCell>
                <TableCell className="text-muted-foreground">{row.note}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ConsoleListSection>
    </div>
  )
}
