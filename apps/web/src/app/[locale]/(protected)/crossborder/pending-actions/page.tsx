'use client'

import * as React from 'react'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { NativeSelect } from '@workspace/ui/components/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

const PAGE_SIZE = 20

const KIND_LABELS: Record<string, string> = {
  sourcing_upsert: '选品入库',
  listing_submit: '刊登提交',
  price_change: '改价',
  inventory_push: '库存推送',
  settlement_post: '结算过账',
}

function statusBadgeVariant(status: string) {
  if (status === 'pending') return 'default' as const
  if (status === 'failed') return 'destructive' as const
  return 'secondary' as const
}

export default function CrossborderPendingActionsPage() {
  const [page, setPage] = React.useState(1)
  const [status, setStatus] = React.useState('pending')
  const query = trpc.platformOps.pendingActions.useQuery({
    page,
    pageSize: PAGE_SIZE,
    status,
  })
  const data = query.data
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">跨租户待审动作</h2>
          <p className="text-sm text-muted-foreground">
            租户在控制台提交的刊登、改价、库存等动作进入此队列，待审项排在前面。
          </p>
        </div>
        <NativeSelect
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="pending">待审</option>
          <option value="failed">失败</option>
          <option value="all">全部</option>
        </NativeSelect>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>租户</TableHead>
            <TableHead>店铺</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>标题</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>创建时间</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                加载中…
              </TableCell>
            </TableRow>
          ) : query.isError ? (
            <TableRow>
              <TableCell colSpan={6} className="text-destructive">
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
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  {row.organizationName}
                </TableCell>
                <TableCell className="text-sm">{row.shopName ?? '—'}</TableCell>
                <TableCell className="font-mono text-xs">
                  {KIND_LABELS[row.kind] ?? row.kind}
                </TableCell>
                <TableCell className="font-medium">{row.title}</TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(row.status)}>
                    {row.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {new Date(row.createdAt).toLocaleString()}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                暂无数据。当前筛选下没有待审动作。
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
