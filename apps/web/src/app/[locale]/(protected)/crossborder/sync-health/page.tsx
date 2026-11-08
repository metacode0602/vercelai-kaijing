'use client'

import * as React from 'react'
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

const PAGE_SIZE = 20

function formatTime(value: Date | string | null) {
  return value ? new Date(value).toLocaleString() : '—'
}

function healthBadgeVariant(health: string) {
  if (health === 'error') return 'destructive' as const
  if (health === 'success') return 'default' as const
  return 'secondary' as const
}

export default function CrossborderSyncHealthPage() {
  const [page, setPage] = React.useState(1)
  const query = trpc.platformOps.syncHealth.useQuery({
    page,
    pageSize: PAGE_SIZE,
  })
  const data = query.data
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))

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
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground">
                加载中…
              </TableCell>
            </TableRow>
          ) : query.isError ? (
            <TableRow>
              <TableCell colSpan={7} className="text-destructive">
                加载失败：{query.error.message}{' '}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => query.refetch()}
                >
                  重试
                </Button>
              </TableCell>
            </TableRow>
          ) : data?.items.length ? (
            data.items.map((row) => (
              <TableRow key={row.shopId}>
                <TableCell className="font-medium">{row.shopName}</TableCell>
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
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground">
                暂无店铺同步数据。租户连接店铺后，这里会展示各店铺的同步健康状态。
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>共 {data?.total ?? 0} 条</span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1 || query.isFetching}
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
            disabled={page >= pageCount || query.isFetching}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  )
}
