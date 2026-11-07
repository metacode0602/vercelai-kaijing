'use client'

import * as React from 'react'
import { useLocale } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'

export default function ShopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const locale = useLocale()
  const searchParams = useSearchParams()
  const query = trpc.shops.get.useQuery({ id })
  const row = query.data
  const [notice, setNotice] = React.useState('')
  const [editOpen, setEditOpen] = React.useState(false)
  const [draft, setDraft] = React.useState({
    name: '',
    region: '',
    currency: '',
    externalShopId: '',
    sellerId: '',
    shopGroup: '',
    owner: '',
  })
  const oauthNotice =
    searchParams.get('oauth') === 'success'
      ? searchParams.get('duplicate') === '1'
        ? '授权成功；该平台店铺已存在，已合并到已有店铺。'
        : '授权成功，凭证已加密保存。'
      : searchParams.get('oauth') === 'conflict'
        ? '该平台店铺已被其他租户绑定，已标记异常，请联系平台运营处理。'
        : searchParams.get('oauth') === 'error'
          ? `授权失败：${searchParams.get('message') || '请稍后重试'}`
          : ''

  const setPaused = trpc.shops.setSyncPaused.useMutation({
    onSuccess: async (res) => {
      setNotice(`同步已${res?.syncPaused ? '暂停' : '恢复'}`)
      await utils.shops.get.invalidate({ id })
      await utils.shops.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const beginAuthorization = trpc.shops.beginAuthorization.useMutation({
    onSuccess: ({ url }) => {
      window.location.assign(url)
    },
    onError: (e) => setNotice(e.message),
  })
  const disable = trpc.shops.disable.useMutation({
    onSuccess: async () => {
      setNotice('店铺已停用。')
      await utils.shops.get.invalidate({ id })
      await utils.shops.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const updateDraft = trpc.shops.updateDraft.useMutation({
    onSuccess: async () => {
      setNotice('店铺资料已更新。')
      setEditOpen(false)
      await utils.shops.get.invalidate({ id })
      await utils.shops.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const removeCredential = trpc.shops.removeCredential.useMutation({
    onSuccess: async () => {
      setNotice('已解绑授权，店铺保留为草稿，可重新授权。')
      await utils.shops.get.invalidate({ id })
      await utils.shops.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })

  if (query.isLoading) {
    return <DetailPageHeader backHref="/console/settings/shops" title="加载中…" description="读取店铺…" />
  }
  if (!row) {
    return <DetailPageHeader backHref="/console/settings/shops" title="未找到店铺" description={`店铺 ${id} 不存在。`} />
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbRegistration items={[{ label: '店铺连接', href: '/console/settings/shops' }, { label: row.name }]} />
      <DetailPageHeader
        backHref="/console/settings/shops"
        title={row.name}
        description={`${row.platformLabel} · ${row.region} · ${row.externalShopId}`}
        badges={
          <>
            <Badge variant={row.authStatus === '授权失效' ? 'destructive' : 'secondary'}>{row.authStatus}</Badge>
            <Badge variant="outline">{row.fulfillmentMode}</Badge>
            {row.syncPaused ? <Badge variant="destructive">同步暂停</Badge> : null}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setPaused.mutate({ id: row.id, paused: !row.syncPaused })}>
              {row.syncPaused ? '恢复同步' : '暂停同步'}
            </Button>
            <Button
              size="sm"
              onClick={() =>
                beginAuthorization.mutate({
                  id: row.id,
                  mode: row.authStatus === '已授权' ? 'reauth' : 'bind',
                  locale,
                })
              }
              disabled={beginAuthorization.isPending}
            >
              {row.authStatus === '已授权' ? '重新授权' : '去平台授权'}
            </Button>
            {row.dbStatus === 'draft' ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraft({
                    name: row.name,
                    region: row.region || '',
                    currency: row.currency,
                    externalShopId: row.externalShopId || '',
                    sellerId: row.sellerId || '',
                    shopGroup: row.shopGroup || '',
                    owner: row.owner || '',
                  })
                  setEditOpen(true)
                }}
              >
                编辑资料
              </Button>
            ) : null}
            {row.hasCredential ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (window.confirm('确认解绑授权？解绑后需重新授权才能同步。')) {
                    removeCredential.mutate({ id: row.id })
                  }
                }}
                disabled={removeCredential.isPending}
              >
                解绑授权
              </Button>
            ) : null}
            {row.dbStatus !== 'disabled' ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => disable.mutate({ id: row.id })}
                disabled={disable.isPending}
              >
                停用店铺
              </Button>
            ) : null}
          </div>
        }
      />
      {row.authStatus !== '已授权' ? (
        <Alert>
          <AlertTitle>待平台授权</AlertTitle>
          <AlertDescription>
            当前状态「{row.authStatus}」。点击「去平台授权」跳转平台 OAuth，回调成功后才写入凭证。
            {row.lastError ? ` ${row.lastError}` : ''}{' '}
            <LocaleLink
              href="/console/settings/marketplace-apps"
              className="font-medium underline underline-offset-2"
            >
              检查平台应用配置
            </LocaleLink>
          </AlertDescription>
        </Alert>
      ) : null}
      <UedPrototypeNotice>凭证仅脱敏展示；授权与重新授权均走真实平台 OAuth。</UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '授权', value: row.authStatus },
          { label: '健康', value: row.healthLabel },
          { label: '凭证', value: row.hasCredential ? '已配置(脱敏)' : '未配置' },
          { label: '最近同步', value: row.lastSyncAt },
        ]}
      />
      <DetailFieldGrid
        title="店铺档案"
        fields={[
          { label: '店铺 ID', value: row.id, mono: true },
          { label: '平台', value: row.platformLabel },
          { label: '站点', value: row.region || '—' },
          { label: '币种', value: row.currency },
          { label: '平台店铺 ID', value: row.externalShopId || '—', mono: true },
          { label: '卖家 ID', value: row.sellerId || '—', mono: true },
          { label: '分组', value: row.shopGroup || '—' },
          { label: '履约', value: row.fulfillmentMode },
          { label: '授权到期', value: row.authExpiresAt },
          { label: '订单同步', value: row.lastOrdersSyncAt },
          { label: '库存同步', value: row.lastInventorySyncAt },
          { label: '错误', value: row.lastError || '—' },
          { label: '负责人', value: row.owner || '—' },
        ]}
      />
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              updateDraft.mutate({ id: row.id, ...draft })
            }}
          >
            <DialogHeader>
              <DialogTitle>编辑店铺草稿</DialogTitle>
              <DialogDescription>授权前可修改店铺基础资料。</DialogDescription>
            </DialogHeader>
            {(
              [
                ['name', '店铺名称'],
                ['region', '站点'],
                ['currency', '币种'],
                ['externalShopId', '平台店铺 ID'],
                ['sellerId', '卖家 ID'],
                ['shopGroup', '分组'],
                ['owner', '负责人'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="grid gap-1.5">
                <Label htmlFor={`shop-${key}`}>{label}</Label>
                <Input
                  id={`shop-${key}`}
                  value={draft[key]}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [key]: event.target.value }))
                  }
                />
              </div>
            ))}
            <DialogFooter>
              <Button type="submit" disabled={updateDraft.isPending}>
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {notice || oauthNotice ? (
        <p className="text-sm text-muted-foreground">{notice || oauthNotice}</p>
      ) : null}
    </div>
  )
}
