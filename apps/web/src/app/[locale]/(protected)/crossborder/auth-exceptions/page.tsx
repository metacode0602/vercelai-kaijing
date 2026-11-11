'use client'

import * as React from 'react'
import { LocaleLink } from '@/lib/i18n/navigation'
import { useListPagination } from '@/lib/pagination/use-list-pagination'
import { trpc } from '@/lib/trpc/client'
import {
  TableEmptyRow,
  TableErrorRow,
  TableLoadingRow,
} from '@/components/shared/data-table'
import { ListPagination } from '@/components/shared/list-pagination'
import { Badge } from '@workspace/ui/components/badge'
import { Input } from '@workspace/ui/components/input'
import { NativeSelect } from '@workspace/ui/components/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

const PLATFORM_LABELS: Record<string, string> = {
  daraz: 'Daraz',
  lazada: 'Lazada',
  tiktok_shop: 'TikTok Shop',
  shopee: 'Shopee',
}

function formatTime(value: Date | string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

export default function AuthExceptionsPage() {
  const { page, setPage, pageSize, setPageSize } = useListPagination()
  const [q, setQ] = React.useState('')
  const [platform, setPlatform] = React.useState('all')
  const query = trpc.platformOps.authExceptions.useQuery({
    page,
    pageSize,
    q: q.trim() || undefined,
    platform,
  })
  const data = query.data
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">授权异常</h2>
          <p className="text-sm text-muted-foreground">
            企业添加店铺并完成 OAuth 授权时的失败记录，供平台运营排查原因并给出处理意见。数据来自授权回调日志，不含令牌或密钥。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value)
              setPage(1)
            }}
            placeholder="搜索租户 / 店铺 / 平台店铺 ID / 错误"
            className="w-72"
          />
          <NativeSelect
            value={platform}
            onChange={(event) => {
              setPlatform(event.target.value)
              setPage(1)
            }}
          >
            <option value="all">全部平台</option>
            <option value="daraz">Daraz</option>
            <option value="lazada">Lazada</option>
            <option value="tiktok_shop">TikTok Shop</option>
            <option value="shopee">Shopee</option>
          </NativeSelect>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>租户 / 店铺</TableHead>
            <TableHead>平台</TableHead>
            <TableHead>错误码</TableHead>
            <TableHead>原因</TableHead>
            <TableHead>建议操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading ? (
            <TableLoadingRow colSpan={6} />
          ) : query.isError ? (
            <TableErrorRow
              colSpan={6}
              message={query.error.message}
              onRetry={() => query.refetch()}
            />
          ) : data?.items.length ? (
            data.items.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-xs">
                  {formatTime(row.createdAt)}
                  <div className="text-muted-foreground">Asia/Shanghai</div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{row.organizationName}</div>
                  <LocaleLink
                    className="text-sm underline-offset-2 hover:underline"
                    href={`/crossborder/shops/${row.shopId}`}
                  >
                    {row.shopName}
                  </LocaleLink>
                  <div className="font-mono text-xs text-muted-foreground">
                    {row.externalShopId || '—'}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {PLATFORM_LABELS[row.platform] ?? row.platform}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="font-mono text-xs">{row.errorCode}</div>
                  {row.errorCode === 'shop_bound_other_org' ? (
                    <LocaleLink
                      className="mt-1 block text-xs underline-offset-2 hover:underline"
                      href="/crossborder/shop-conflicts"
                    >
                      打开店铺冲突
                    </LocaleLink>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-64 text-sm">{row.reason}</TableCell>
                <TableCell className="max-w-80 text-sm text-muted-foreground">
                  {row.advice}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyRow colSpan={6}>
              暂无授权异常。租户授权失败后，原因会出现在这里。
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
