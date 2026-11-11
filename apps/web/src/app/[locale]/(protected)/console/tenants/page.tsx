'use client'

import * as React from 'react'
import { LocaleLink } from '@/lib/i18n/navigation'
import { ConfirmActionDialog } from '@/components/shared/confirm-action-dialog'
import { useListPagination } from '@/lib/pagination/use-list-pagination'
import {
  TableEmptyRow,
  TableErrorRow,
  TableLoadingRow,
} from '@/components/shared/data-table'
import { ListPagination } from '@/components/shared/list-pagination'
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
  const { page, setPage, pageSize, setPageSize } = useListPagination()
  const [q, setQ] = React.useState('')
  const utils = trpc.useUtils()
  const query = trpc.platformOnboarding.tenants.useQuery({
    page,
    pageSize,
    q: q.trim() || undefined,
  })
  const [notice, setNotice] = React.useState('')
  const [disableTarget, setDisableTarget] = React.useState<{ id: string; name: string } | null>(null)
  const disable = trpc.platformOnboarding.disableTenant.useMutation({
    onSuccess: async (result) => {
      setNotice(`租户已停用，${result.shops} 个店铺已停止同步。`)
      setDisableTarget(null)
      await utils.platformOnboarding.tenants.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / pageSize))

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
            <TableLoadingRow colSpan={8} />
          ) : query.isError ? (
            <TableErrorRow
              colSpan={8}
              message={query.error.message}
              onRetry={() => query.refetch()}
            />
          ) : query.data?.items.length ? (
            query.data.items.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell className="font-medium">
                  <LocaleLink className="underline-offset-2 hover:underline" href={`/console/tenants/${tenant.id}`}>
                    {tenant.name}
                  </LocaleLink>
                </TableCell>
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
                  <div className="flex justify-end gap-2">
                    <Button asChild size="sm" variant="outline">
                      <LocaleLink href={`/console/tenants/${tenant.id}`}>详情</LocaleLink>
                    </Button>
                    {tenant.status === 'active' ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={disable.isPending}
                        onClick={() => setDisableTarget({ id: tenant.id, name: tenant.name })}
                      >
                        停用
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyRow colSpan={8}>暂无租户。</TableEmptyRow>
          )}
        </TableBody>
      </Table>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      <ListPagination
        page={page}
        totalPages={pageCount}
        totalItems={query.data?.total ?? 0}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
      <ConfirmActionDialog
        open={Boolean(disableTarget)}
        onOpenChange={(open) => {
          if (!open) setDisableTarget(null)
        }}
        title="停用租户"
        description={
          disableTarget
            ? `确认停用租户「${disableTarget.name}」？其店铺将停止同步。停用店仍占绑定名额。`
            : ''
        }
        confirmLabel="确认停用"
        confirmVariant="destructive"
        pending={disable.isPending}
        onConfirm={() => {
          if (disableTarget) disable.mutate({ organizationId: disableTarget.id })
        }}
      />
    </div>
  )
}
