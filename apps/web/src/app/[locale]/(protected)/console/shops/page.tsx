'use client'

import * as React from 'react'
import { ConfirmReasonDialog } from '@/components/shared/confirm-reason-dialog'
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


const STATUS_LABELS: Record<string, string> = {
  draft: '待授权',
  connecting: '连接中',
  active: '已授权',
  error: '授权失效',
  disabled: '已停用',
}

const PLATFORM_LABELS: Record<string, string> = {
  daraz: 'Daraz',
  lazada: 'Lazada',
  tiktok_shop: 'TikTok Shop',
  shopee: 'Shopee',
}

function statusBadgeVariant(status: string) {
  if (status === 'active') return 'default' as const
  if (status === 'error' || status === 'disabled') return 'destructive' as const
  return 'secondary' as const
}

export default function CrossborderShopsPage() {
  const { page, setPage, pageSize, setPageSize } = useListPagination()
  const [q, setQ] = React.useState('')
  const [platform, setPlatform] = React.useState('all')
  const [status, setStatus] = React.useState('all')
  const utils = trpc.useUtils()
  const query = trpc.platformShops.list.useQuery({
    page,
    pageSize,
    q: q.trim() || undefined,
    platform,
    status,
  })
  const data = query.data
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))
  const [notice, setNotice] = React.useState('')
  const [disableTarget, setDisableTarget] = React.useState<{ id: string; name: string } | null>(null)

  const disable = trpc.platformShops.disable.useMutation({
    onSuccess: async () => {
      setNotice('店铺已停用，租户将收到站内信通知。')
      setDisableTarget(null)
      await utils.platformShops.list.invalidate()
      await utils.platformOps.syncHealth.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">店铺管理</h2>
          <p className="text-sm text-muted-foreground">
            跨租户店铺总览；默认只读，停用为平台风控操作，会暂停同步并通知租户。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value)
              setPage(1)
            }}
            placeholder="搜索店铺 / 平台店铺 ID / 租户"
            className="w-64"
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
          <NativeSelect
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setPage(1)
            }}
          >
            <option value="all">全部状态</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">店铺总数</p>
          <p className="text-2xl font-semibold tabular-nums">
            {data?.summary.total ?? '—'}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">已授权</p>
          <p className="text-2xl font-semibold tabular-nums">
            {data?.summary.active ?? '—'}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">待授权 / 连接中</p>
          <p className="text-2xl font-semibold tabular-nums">
            {data?.summary.pending ?? '—'}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">失效 / 停用</p>
          <p className="text-2xl font-semibold tabular-nums">
            {data ? data.summary.error + data.summary.disabled : '—'}
          </p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>店铺</TableHead>
            <TableHead>平台 / 站点</TableHead>
            <TableHead>租户</TableHead>
            <TableHead>授权状态</TableHead>
            <TableHead>同步健康</TableHead>
            <TableHead>授权到期</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading ? (
            <TableLoadingRow colSpan={7} />
          ) : query.isError ? (
            <TableErrorRow
              colSpan={7}
              message={query.error.message}
              onRetry={() => query.refetch()}
            />
          ) : data?.items.length ? (
            data.items.map((shop) => (
              <TableRow key={shop.id}>
                <TableCell>
                  <LocaleLink
                    className="font-medium underline-offset-2 hover:underline"
                    href={`/console/shops/${shop.id}`}
                  >
                    {shop.name}
                  </LocaleLink>
                  <div className="font-mono text-xs text-muted-foreground">
                    {shop.externalShopId || '—'}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {PLATFORM_LABELS[shop.platform] ?? shop.platform}
                  </Badge>
                  {shop.region ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {shop.region.toUpperCase()}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div>{shop.organizationName}</div>
                  {!shop.organizationEntryApproved ? (
                    <div className="text-xs text-muted-foreground">入驻未通过</div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant={statusBadgeVariant(shop.status)}>
                      {STATUS_LABELS[shop.status] ?? shop.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {shop.hasCredential ? '已配置凭证' : '未配置凭证'}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {shop.health ? (
                      <Badge
                        variant={
                          shop.health === 'error'
                            ? 'destructive'
                            : shop.health === 'success'
                              ? 'default'
                              : 'secondary'
                        }
                      >
                        {shop.health}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {shop.syncPaused ? (
                      <span className="text-xs text-muted-foreground">同步已暂停</span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  {shop.authExpiresAt
                    ? new Date(shop.authExpiresAt).toLocaleDateString()
                    : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button asChild size="sm" variant="outline">
                      <LocaleLink href={`/console/shops/${shop.id}`}>详情</LocaleLink>
                    </Button>
                    {shop.status === 'disabled' ? null : (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={disable.isPending}
                        onClick={() => setDisableTarget({ id: shop.id, name: shop.name })}
                      >
                        停用
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyRow colSpan={7}>
              暂无店铺。租户绑定店铺后，这里会展示跨租户店铺总览。
            </TableEmptyRow>
          )}
        </TableBody>
      </Table>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      <ConfirmReasonDialog
        open={Boolean(disableTarget)}
        onOpenChange={(open) => {
          if (!open) setDisableTarget(null)
        }}
        title="停用店铺"
        description={
          disableTarget
            ? `确认停用店铺「${disableTarget.name}」？停用将暂停同步并通知租户。停用店仍占绑定名额。`
            : ''
        }
        confirmLabel="确认停用"
        confirmVariant="destructive"
        reasonLabel="停用原因"
        placeholder="可填写停用原因（可留空）"
        required={false}
        pending={disable.isPending}
        onConfirm={(reason) => {
          if (disableTarget) {
            disable.mutate({
              shopId: disableTarget.id,
              reason: reason || undefined,
            })
          }
        }}
      />
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