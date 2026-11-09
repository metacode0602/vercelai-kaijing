'use client'

import * as React from 'react'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
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

export default function CrossborderTenantsPage() {
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const utils = trpc.useUtils()
  const query = trpc.platformOnboarding.tenants.useQuery({
    page,
    pageSize: 20,
    q: q.trim() || undefined,
  })
  const [notice, setNotice] = React.useState('')
  const disable = trpc.platformOnboarding.disableTenant.useMutation({
    onSuccess: async (result) => {
      setNotice(`租户已停用，${result.shops} 个店铺已停止同步。`)
      await utils.platformOnboarding.tenants.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / 20))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">租户列表</h2>
        <Input
          value={q}
          onChange={(event) => {
            setQ(event.target.value)
            setPage(1)
          }}
          placeholder="搜索租户名称或 slug"
          className="w-64"
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>入驻</TableHead>
            <TableHead>实名</TableHead>
            <TableHead>店铺</TableHead>
            <TableHead>待审</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading ? (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground">
                加载中…
              </TableCell>
            </TableRow>
          ) : query.data?.items.length ? (
            query.data.items.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell className="font-medium">{tenant.name}</TableCell>
                <TableCell className="font-mono text-xs">{tenant.slug || '—'}</TableCell>
                <TableCell>
                  <Badge variant={tenant.entryApproved ? 'default' : 'secondary'}>
                    {tenant.entryApproved ? '已通过' : '未通过'}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{tenant.identityStatus}</TableCell>
                <TableCell>{Number(tenant.shopCount)}</TableCell>
                <TableCell>{Number(tenant.pendingCount)}</TableCell>
                <TableCell>
                  <Badge variant={tenant.status === 'active' ? 'secondary' : 'destructive'}>
                    {tenant.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {tenant.status === 'active' ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={disable.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `确认停用租户「${tenant.name}」？其店铺将停止同步。`,
                          )
                        ) {
                          disable.mutate({ organizationId: tenant.id })
                        }
                      }}
                    >
                      停用
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground">
                暂无租户。
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>共 {query.data?.total ?? 0} 条</span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            上一页
          </Button>
          <span>
            {page} / {pageCount}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  )
}
