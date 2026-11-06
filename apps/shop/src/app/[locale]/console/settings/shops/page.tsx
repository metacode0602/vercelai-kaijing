'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
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
  const listQuery = trpc.shops.list.useQuery({ page: 1, pageSize: 100 })
  const meta = trpc.shops.meta.useQuery()
  const rows = listQuery.data?.items ?? []
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const kpi = React.useMemo(() => {
    return {
      total: rows.length,
      authorized: rows.filter((r) => r.authStatus === '已授权').length,
      pending: rows.filter((r) => ['待授权', '连接中', '草稿'].includes(r.authStatus)).length,
      expired: rows.filter((r) => r.authStatus === '授权失效').length,
      paused: rows.filter((r) => r.syncPaused).length,
    }
  }, [rows])

  const createDraft = trpc.shops.createDraft.useMutation({
    onSuccess: async (row) => {
      setOpen(false)
      setNotice(`${row?.name ?? '店铺'} 已创建为草稿；同步已暂停。未完成真实 OAuth。`)
      await utils.shops.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const setPaused = trpc.shops.setSyncPaused.useMutation({
    onSuccess: async (row) => {
      setNotice(`${row?.name} 同步已${row?.syncPaused ? '暂停' : '恢复'}（DB meta）。`)
      await utils.shops.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })
  const queueReauth = trpc.shops.queueReauth.useMutation({
    onSuccess: async (res) => {
      setNotice(res.note)
      await utils.shops.list.invalidate()
    },
    onError: (e) => setNotice(e.message),
  })

  const editor = open ? (
    <UedDialog
      title="新增店铺连接"
      description="创建草稿店铺。授权不会伪造成功；需真实平台 OAuth。"
      fields={[
        { key: 'platform', label: '平台', options: ['lazada', 'daraz', 'tiktok_shop', 'shopee'], required: true },
        { key: 'region', label: '站点', options: ['MY', 'PH', 'LK', 'TH', 'SG', 'VN', 'ID'], required: true },
        { key: 'name', label: '店铺名称', required: true },
        { key: 'externalShopId', label: '平台店铺 ID', required: true },
        { key: 'sellerId', label: '卖家 ID（sellerId）', required: true },
        { key: 'shopGroup', label: '店铺分组', options: ['Lazada 五国', 'Daraz', 'TikTok', '其他'], required: true },
        { key: 'fulfillmentMode', label: '履约模式', options: ['自营仓发货', '平台仓', '混合'], required: true },
        { key: 'currency', label: '币种', options: ['MYR', 'PHP', 'LKR', 'THB', 'SGD', 'VND', 'USD'], required: true },
        { key: 'owner', label: '负责人' },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        createDraft.mutate({
          name: values.name || '',
          platform: values.platform || 'lazada',
          region: values.region || 'MY',
          currency: values.currency || 'MYR',
          externalShopId: values.externalShopId || '',
          sellerId: values.sellerId,
          shopGroup: values.shopGroup,
          fulfillmentMode: values.fulfillmentMode || '自营仓发货',
          owner: values.owner,
        })
      }}
    />
  ) : null

  return (
    <UedWorkspace
      title="店铺连接"
      description="shops + integration_*。授权状态如实展示；禁止假 OAuth 成功。"
      rows={rows}
      detailHref={(row) => `/console/settings/shops/${encodeURIComponent(row.id)}`}
      searchKeys={['id', 'name', 'platformLabel', 'region', 'externalShopId', 'sellerId', 'shopGroup', 'fulfillmentMode', 'authStatus', 'lastError', 'owner']}
      searchPlaceholder="搜索店铺、卖家 ID、分组或平台店铺 ID"
      filters={[{ label: '授权状态', options: [...(meta.data?.authStatuses ?? [])], key: 'authStatus' }]}
      emptyText={listQuery.isLoading ? '加载中…' : '暂无店铺。新增草稿后需真实平台授权。'}
      addLabel="新增店铺"
      onAdd={() => setOpen(true)}
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
        {meta.data?.note || '未授权如实展示。排队重授权不会跳转假 OAuth，也不会写假凭证。'}
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
            {(row.authStatus === '授权失效' || row.authStatus === '待授权' || row.authStatus === '草稿' || row.authStatus === '连接中') && (
              <Button size="sm" onClick={() => queueReauth.mutate({ id: row.id })}>
                排队重授权（待平台）
              </Button>
            )}
          </div>
        ))}
      </div>
      {editor}
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>
  )
}
