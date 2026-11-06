'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

export default function ShopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const query = trpc.shops.get.useQuery({ id })
  const row = query.data
  const [notice, setNotice] = React.useState('')

  const setPaused = trpc.shops.setSyncPaused.useMutation({
    onSuccess: async (res) => {
      setNotice(`同步已${res?.syncPaused ? '暂停' : '恢复'}`)
      await utils.shops.get.invalidate({ id })
      await utils.shops.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const queueReauth = trpc.shops.queueReauth.useMutation({
    onSuccess: async (res) => {
      setNotice(res.note)
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
            <Button size="sm" onClick={() => queueReauth.mutate({ id: row.id })}>
              排队重授权（待平台）
            </Button>
          </div>
        }
      />
      {row.authStatus !== '已授权' ? (
        <Alert>
          <AlertTitle>待平台授权</AlertTitle>
          <AlertDescription>
            当前状态「{row.authStatus}」。OAuth / connector 未完成真实授权前不会显示已连接成功。
            {row.lastError ? ` ${row.lastError}` : ''}
          </AlertDescription>
        </Alert>
      ) : null}
      <UedPrototypeNotice>凭证脱敏展示；重授权不会伪造 OAuth 成功或写入假 token。</UedPrototypeNotice>
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
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
