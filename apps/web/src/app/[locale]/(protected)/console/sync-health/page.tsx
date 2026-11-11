'use client'

import * as React from 'react'
import { LocaleLink } from '@/lib/i18n/navigation'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'


function formatTime(value: Date | string | null) {
  return value ? new Date(value).toLocaleString() : '—'
}

function healthBadgeVariant(health: string) {
  if (health === 'error') return 'destructive' as const
  if (health === 'success') return 'default' as const
  return 'secondary' as const
}

export default function CrossborderSyncHealthPage() {
  const { page, setPage, pageSize, setPageSize } = useListPagination()
  const query = trpc.platformOps.syncHealth.useQuery({
    page,
    pageSize,
  })
  const data = query.data
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">连接器同步健康</h2>
        <p className="text-sm text-muted-foreground">
          按店铺展示同步健康状态与最近一次订单 / 库存同步时间，数据来自
          integration_states。
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>店铺</TableHead>
            <TableHead>租户</TableHead>
            <TableHead>平台</TableHead>
            <TableHead>健康</TableHead>
            <TableHead>最近订单同步</TableHead>
            <TableHead>最近库存同步</TableHead>
            <TableHead>错误</TableHead>
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
          ) : data?.items.length ? (
            data.items.map((row) => (
              <TableRow key={row.shopId}>
                <TableCell className="font-medium">
                  <LocaleLink className="underline-offset-2 hover:underline" href={`/console/shops/${row.shopId}`}>
                    {row.shopName}
                  </LocaleLink>
                </TableCell>
                <TableCell className="text-sm">
                  {row.organizationName}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{row.platform}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={healthBadgeVariant(row.health)}>
                    {row.health}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {formatTime(row.lastOrdersSyncAt)}
                </TableCell>
                <TableCell className="text-sm">
                  {formatTime(row.lastInventorySyncAt)}
                </TableCell>
                <TableCell className="text-destructive text-sm">
                  {row.lastError ?? '—'}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <LocaleLink href={`/console/shops/${row.shopId}`}>详情</LocaleLink>
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyRow colSpan={8}>
              暂无店铺同步数据。租户连接店铺后，这里会展示各店铺的同步健康状态。
            </TableEmptyRow>
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
    </div>
  )
}
