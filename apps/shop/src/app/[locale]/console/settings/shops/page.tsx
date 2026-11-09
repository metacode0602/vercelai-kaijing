'use client'

import * as React from 'react'
import { useLocale } from 'next-intl'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function authVariant(status: string) {
  if (status === '授权失效') return 'destructive' as const
  if (status === '已授权') return 'secondary' as const
  return 'outline' as const
}

export default function ShopsSettingsPage() {
  const utils = trpc.useUtils()
  const router = useLocaleRouter()
  const locale = useLocale()
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [authStatus, setAuthStatus] = React.useState<string | undefined>()
  const listQuery = trpc.shops.list.useQuery({
    page,
    pageSize: 20,
    q: q.trim() || undefined,
    authStatus,
  })
  const meta = trpc.shops.meta.useQuery()
  const rows = listQuery.data?.items ?? []
  const [notice, setNotice] = React.useState('')
  const kpi = listQuery.data?.summary ?? {
    total: 0,
    authorized: 0,
    pending: 0,
    expired: 0,
    paused: 0,
  }

  const setPaused = trpc.shops.setSyncPaused.useMutation({
    onSuccess: async (row) => {
      setNotice(`${row?.name} 同步已${row?.syncPaused ? '暂停' : '恢复'}（DB meta）。`)
      await utils.shops.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const beginAuthorization = trpc.shops.beginAuthorization.useMutation({
    onSuccess: ({ url }) => {
      window.location.assign(url)
    },
    onError: (error) => setNotice(error.message),
  })

  return (
    <UedWorkspace
      title="店铺连接"
      description="shops + integration_*。授权走真实平台 OAuth，状态来自数据库。"
      rows={rows}
      detailHref={(row) => `/console/settings/shops/${encodeURIComponent(row.id)}`}
      searchKeys={['id', 'name', 'platformLabel', 'region', 'externalShopId', 'sellerId', 'shopGroup', 'fulfillmentMode', 'authStatus', 'appCredentialLabel', 'lastError', 'owner']}
      searchPlaceholder="搜索店铺、卖家 ID、分组或平台店铺 ID"
      search={q}
      onSearchChange={setQ}
      pagination={{
        page,
        pageSize: 20,
        total: listQuery.data?.total ?? 0,
        onPageChange: setPage,
      }}
      filters={[{ label: '授权状态', options: [...(meta.data?.authStatuses ?? [])], key: 'authStatus' }]}
      onStatusFilterChange={(value) =>
        setAuthStatus(value === '全部' ? undefined : value)
      }
      emptyText={listQuery.isLoading ? '加载中…' : '暂无店铺。新增店铺后会跳转平台授权。'}
      addLabel="新增店铺"
      onAdd={() => router.push('/console/settings/shops/new')}
      columns={[
        { key: 'name', label: '店铺' },
        { key: 'platformLabel', label: '平台' },
        { key: 'region', label: '站点' },
        { key: 'sellerId', label: '卖家 ID' },
        { key: 'shopGroup', label: '店铺分组' },
        { key: 'fulfillmentMode', label: '履约模式' },
        { key: 'externalShopId', label: '平台店铺 ID' },
        {
          key: 'authStatus',
          label: '授权',
          render: (row) => <Badge variant={authVariant(row.authStatus)}>{row.authStatus}</Badge>,
        },
        {
          key: 'appCredentialLabel',
          label: '平台应用',
          render: (row) =>
            row.appCredentialId ? (
              <LocaleLink
                href="/console/settings/marketplace-apps"
                className="underline-offset-2 hover:underline"
              >
                {row.appCredentialLabel}
              </LocaleLink>
            ) : (
              <span className="text-muted-foreground">未关联</span>
            ),
        },
        { key: 'authExpiresAt', label: '授权到期' },
        { key: 'healthLabel', label: '健康' },
        {
          key: 'syncPaused',
          label: '同步',
          render: (row) =>
            row.syncPaused ? <Badge variant="destructive">已暂停</Badge> : <Badge variant="secondary">可同步</Badge>,
        },
        { key: 'lastSyncAt', label: '最近同步' },
        { key: 'credentialMask', label: '凭证' },
      ]}
    >
      <DetailKpiRow
        items={[
          { label: '店铺数', value: String(kpi.total) },
          { label: '已授权', value: String(kpi.authorized) },
          { label: '待授权 / 连接中', value: String(kpi.pending) },
          { label: '授权失效', value: String(kpi.expired) },
          { label: '同步暂停', value: String(kpi.paused) },
        ]}
      />
      <UedPrototypeNotice>
        {meta.data?.note || '授权会跳转平台 OAuth；未完成回调前不会保存凭证。'}
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
            <span className="text-sm font-medium">{row.name}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPaused.mutate({ id: row.id, paused: !row.syncPaused })}
            >
              {row.syncPaused ? '恢复同步' : '暂停同步'}
            </Button>
            {row.authStatus !== '已授权' ? (
              <Button
                size="sm"
                onClick={() =>
                  beginAuthorization.mutate({
                    id: row.id,
                    mode: row.authStatus === '授权失效' ? 'reauth' : 'bind',
                    locale,
                  })
                }
                disabled={beginAuthorization.isPending}
              >
                {row.authStatus === '授权失效' ? '重新授权' : '去授权'}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  beginAuthorization.mutate({ id: row.id, mode: 'reauth', locale })
                }
                disabled={beginAuthorization.isPending}
              >
                重新授权
              </Button>
            )}
          </div>
        ))}
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>
  )
}
