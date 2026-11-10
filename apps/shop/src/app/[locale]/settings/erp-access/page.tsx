'use client'

import * as React from 'react'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { ConsoleListSection, useConsolePagination } from '@/components/console/list'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { trpc } from '@/lib/trpc/client'

export default function AccessControlPage() {
  const router = useLocaleRouter()
  const utils = trpc.useUtils()
  const accessQuery = trpc.roles.myAccess.useQuery()
  const listQuery = trpc.roles.list.useQuery()
  const rows = listQuery.data ?? []
  const { pagedRows, pagination } = useConsolePagination(rows)
  const canConfigure = Boolean(accessQuery.data?.isOwner || accessQuery.data?.permissions.includes('settings.configure'))
  const [notice, setNotice] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [code, setCode] = React.useState('')
  const [description, setDescription] = React.useState('')

  const createRole = trpc.roles.create.useMutation({
    onSuccess: async (role) => {
      setCreateOpen(false)
      setName('')
      setCode('')
      setDescription('')
      setNotice(`已创建角色「${role.name}」。`)
      await utils.roles.list.invalidate()
      router.push(`/settings/erp-access/${role.id}`)
    },
    onError: (error) => setNotice(error.message),
  })
  const copyRole = trpc.roles.copy.useMutation({
    onSuccess: async (role) => {
      setNotice(`已复制为「${role.name}」。`)
      await utils.roles.list.invalidate()
      router.push(`/settings/erp-access/${role.id}`)
    },
    onError: (error) => setNotice(error.message),
  })
  const setStatus = trpc.roles.setStatus.useMutation({
    onSuccess: async (role) => {
      setNotice(role.status === 'disabled' ? `已停用「${role.name}」。` : `已启用「${role.name}」。`)
      await utils.roles.list.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">角色权限</h2>
          <p className="text-sm text-muted-foreground">
            管理系统角色与自定义角色、权限矩阵和数据范围。组织所有者默认拥有全部权限，无需绑定业务角色。
          </p>
        </div>
        {canConfigure ? <Button onClick={() => setCreateOpen(true)}>新建角色</Button> : null}
      </div>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <ConsoleListSection
        title="角色列表"
        description={listQuery.isLoading ? '加载中…' : `共 ${rows.length} 个角色`}
        pagination={pagination}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>编码</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>绑定人数</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  {listQuery.error ? listQuery.error.message : '暂无角色。'}
                </TableCell>
              </TableRow>
            ) : (
              pagedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell>
                    <Badge variant={row.isSystem ? 'secondary' : 'outline'}>
                      {row.isSystem ? '系统' : '自定义'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.status === 'enabled' ? 'secondary' : 'outline'}>
                      {row.status === 'enabled' ? '启用' : '停用'}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.memberCount}</TableCell>
                  <TableCell className="text-muted-foreground">{row.updatedAt}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => router.push(`/settings/erp-access/${row.id}`)}>
                        详情
                      </Button>
                      {canConfigure ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={copyRole.isPending}
                          onClick={() => copyRole.mutate({ id: row.id })}
                        >
                          复制
                        </Button>
                      ) : null}
                      {canConfigure ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={setStatus.isPending}
                          onClick={() => {
                            const next = row.status === 'enabled' ? 'disabled' : 'enabled'
                            const ok = window.confirm(
                              next === 'disabled'
                                ? `确定停用角色「${row.name}」？已绑定成员将保留记录，但该角色不再授权。`
                                : `确定启用角色「${row.name}」？`,
                            )
                            if (!ok) return
                            setStatus.mutate({ id: row.id, status: next })
                          }}
                        >
                          {row.status === 'enabled' ? '停用' : '启用'}
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建角色</DialogTitle>
            <DialogDescription>创建自定义角色后，可在详情页编辑权限矩阵、数据范围并绑定成员。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="role-name">名称</Label>
              <Input id="role-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：店铺运营" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-code">编码（可选）</Label>
              <Input
                id="role-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="小写字母开头，如 shop_ops"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-desc">备注（可选）</Label>
              <Input id="role-desc" value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              disabled={createRole.isPending || !name.trim()}
              onClick={() =>
                createRole.mutate({
                  name: name.trim(),
                  code: code.trim() || undefined,
                  description: description.trim() || undefined,
                })
              }
            >
              {createRole.isPending ? '创建中…' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
