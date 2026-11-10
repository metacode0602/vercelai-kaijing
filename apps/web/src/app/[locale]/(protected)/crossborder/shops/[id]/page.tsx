'use client'

import * as React from 'react'
import { LocaleLink } from '@/lib/i18n/navigation'
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

const STATUS_LABELS: Record<string, string> = {
  draft: '待授权',
  connecting: '连接中',
  active: '已授权',
  error: '授权失效',
  disabled: '已停用',
}

const FULFILLMENT_LABELS: Record<string, string> = {
  fbm: '自营仓发货',
  fbp: '平台仓履约',
  hybrid: '混合履约',
}

function formatTime(value: Date | string | null) {
  return value ? new Date(value).toLocaleString() : '—'
}

export default function PlatformShopDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const id = React.use(params).id
  const utils = trpc.useUtils()
  const query = trpc.platformShops.get.useQuery({ id })
  const [notice, setNotice] = React.useState('')

  const disable = trpc.platformShops.disable.useMutation({
    onSuccess: async () => {
      setNotice('店铺已停用，租户将收到站内信通知。')
      await utils.platformShops.get.invalidate({ id })
      await utils.platformShops.list.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const restore = trpc.platformShops.restore.useMutation({
    onSuccess: async () => {
      setNotice('店铺已恢复，等待租户重新授权。')
      await utils.platformShops.get.invalidate({ id })
      await utils.platformShops.list.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">加载中…</p>
  }
  if (!query.data) {
    return <p className="text-sm text-muted-foreground">店铺不存在。</p>
  }

  const { shop, organization, health, lastError, credential, syncPaused, logs } =
    query.data
  const { lastOrdersSyncAt, lastInventorySyncAt } = query.data
  const platformMeta =
    shop.meta && typeof shop.meta === 'object'
      ? (shop.meta as Record<string, unknown>)
      : {}

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            <LocaleLink className="underline" href="/crossborder/shops">
              店铺管理
            </LocaleLink>{' '}
            / 店铺详情
          </p>
          <h2 className="text-lg font-medium">{shop.name}</h2>
          <p className="text-sm text-muted-foreground">
            租户 {organization.name} · 平台 {shop.platform}
            {shop.region ? ` · ${shop.region.toUpperCase()}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={shop.status === 'active' ? 'default' : 'secondary'}>
            {STATUS_LABELS[shop.status] ?? shop.status}
          </Badge>
          {syncPaused ? <Badge variant="outline">同步已暂停</Badge> : null}
        </div>
      </div>

      <section>
        <h3 className="mb-2 font-medium">店铺信息</h3>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 border-b py-2">
            <dt className="text-muted-foreground">平台店铺 ID</dt>
            <dd className="font-mono text-xs">{shop.externalShopId || '—'}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b py-2">
            <dt className="text-muted-foreground">卖家 ID</dt>
            <dd className="font-mono text-xs">{shop.sellerId || '—'}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b py-2">
            <dt className="text-muted-foreground">店铺分组</dt>
            <dd>{shop.shopGroup || '—'}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b py-2">
            <dt className="text-muted-foreground">履约模式</dt>
            <dd>{FULFILLMENT_LABELS[shop.fulfillmentMode] ?? shop.fulfillmentMode}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b py-2">
            <dt className="text-muted-foreground">币种</dt>
            <dd>{shop.currency}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b py-2">
            <dt className="text-muted-foreground">最近同步</dt>
            <dd>{formatTime(shop.lastSyncAt)}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h3 className="mb-2 font-medium">授权与同步</h3>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 border-b py-2">
            <dt className="text-muted-foreground">凭证</dt>
            <dd>
              {credential
                ? `已配置 · ${credential.kind} · 到期 ${formatTime(credential.expiresAt)}`
                : '未配置凭证'}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b py-2">
            <dt className="text-muted-foreground">授权到期</dt>
            <dd>{formatTime(shop.authExpiresAt)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b py-2">
            <dt className="text-muted-foreground">同步健康</dt>
            <dd>
              {health ?? '—'}
              {lastError ? (
                <span className="text-destructive">（{lastError}）</span>
              ) : null}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b py-2">
            <dt className="text-muted-foreground">最近订单 / 库存同步</dt>
            <dd>
              {formatTime(lastOrdersSyncAt)} / {formatTime(lastInventorySyncAt)}
            </dd>
          </div>
        </dl>
      </section>

      {typeof platformMeta.platformDisabledReason === 'string' &&
      platformMeta.platformDisabledReason ? (
        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">平台停用原因</p>
          <p className="mt-1 text-muted-foreground">
            {platformMeta.platformDisabledReason}
          </p>
        </section>
      ) : null}

      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="font-medium">平台操作</h3>
        <p className="text-sm text-muted-foreground">
          停用为风控动作：暂停同步并通知租户；恢复后店铺回到待授权状态，由租户重新发起授权。
        </p>
        <div className="flex flex-wrap gap-2">
          {shop.status === 'disabled' ? (
            <Button
              disabled={restore.isPending}
              onClick={() => {
                if (window.confirm(`确认恢复店铺「${shop.name}」？恢复后需租户重新授权。`)) {
                  restore.mutate({ shopId: shop.id })
                }
              }}
            >
              恢复店铺
            </Button>
          ) : (
            <Button
              variant="destructive"
              disabled={disable.isPending}
              onClick={() => {
                const reason = window.prompt(
                  `确认停用店铺「${shop.name}」？停用将暂停同步并通知租户。可填写停用原因（可留空）：`,
                )
                if (reason === null) return
                disable.mutate({
                  shopId: shop.id,
                  reason: reason.trim() || undefined,
                })
              }}
            >
              停用店铺
            </Button>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-medium">最近集成日志</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>动作</TableHead>
              <TableHead>方向</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>消息</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length ? (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs">
                    {formatTime(log.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.action}</TableCell>
                  <TableCell className="text-xs">{log.direction}</TableCell>
                  <TableCell>
                    <Badge
                      variant={log.status === 'success' ? 'secondary' : 'destructive'}
                    >
                      {log.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{log.message || '—'}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  暂无集成日志。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
