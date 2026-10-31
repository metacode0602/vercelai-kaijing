'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  SHOP_AUTH_STATUSES,
  addShopConnection,
  countShopKpi,
  markShopReauthQueued,
  setShopSyncPaused,
  useShopConnections,
} from '@/lib/crossborder/shop-connection-store'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

function authVariant(status: string) {
  if (status === '授权失效') return 'destructive' as const
  if (status === '已授权') return 'secondary' as const
  return 'outline' as const
}

export default function ShopsSettingsPage() {
  const rows = useShopConnections()
  const kpi = React.useMemo(() => countShopKpi(rows), [rows])
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const kpiItems = React.useMemo(
    () => [
      { label: '店铺数', value: String(kpi.total) },
      { label: '已授权', value: String(kpi.authorized) },
      { label: '待授权 / 连接中', value: String(kpi.pending) },
      { label: '授权失效', value: String(kpi.expired) },
      { label: '同步暂停', value: String(kpi.paused) },
    ],
    [kpi],
  )

  const editor = open ? (
    <UedDialog
      title="新增店铺连接"
      description="创建草稿店铺；授权与同步为原型动作，不跳转真实 OAuth。"
      fields={[
        {
          key: 'platform',
          label: '平台',
          options: ['lazada', 'daraz', 'tiktok_shop', 'shopee'],
          required: true,
        },
        {
          key: 'region',
          label: '站点',
          options: ['MY', 'PH', 'LK', 'TH', 'SG', 'VN', 'ID'],
          required: true,
        },
        { key: 'name', label: '店铺名称', required: true },
        {
          key: 'externalShopId',
          label: '平台店铺 ID',
          required: true,
          helper: 'marketplace shop / store id，与卖家 ID 不同',
        },
        {
          key: 'sellerId',
          label: '卖家 ID（sellerId）',
          required: true,
          helper: '卖家侧标识，可与平台店铺 ID 不同',
        },
        {
          key: 'shopGroup',
          label: '店铺分组',
          options: ['Lazada 五国', 'Daraz', 'TikTok', '其他'],
          required: true,
        },
        {
          key: 'fulfillmentMode',
          label: '履约模式',
          options: ['自营仓发货', '平台仓', '混合'],
          required: true,
        },
        {
          key: 'currency',
          label: '币种',
          options: ['MYR', 'PHP', 'LKR', 'THB', 'SGD', 'VND', 'USD'],
          required: true,
        },
        {
          key: 'defaultWarehouse',
          label: '默认仓库',
          options: ['WH-CN-XMN-001'],
        },
        { key: 'owner', label: '负责人' },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const result = addShopConnection({
          name: values.name || '',
          platform: values.platform || 'lazada',
          region: values.region || 'MY',
          currency: values.currency || 'MYR',
          externalShopId: values.externalShopId || '',
          sellerId: values.sellerId,
          shopGroup: values.shopGroup,
          fulfillmentMode: (values.fulfillmentMode as '自营仓发货' | '平台仓' | '混合') || '自营仓发货',
          defaultWarehouse: values.defaultWarehouse,
          owner: values.owner,
        })
        if (!result.ok) {
          setNotice(result.reason)
          return
        }
        setNotice(`${result.row.name} 已加入原型会话（草稿，同步已暂停）`)
        setOpen(false)
      }}
    />
  ) : null

  return (
    <UedWorkspace
      title="店铺连接"
      description="店铺授权、凭证脱敏、同步暂停与健康状态。运营中文面；OAuth / 刷新仅为原型。"
      rows={rows}
      detailHref={(row) => `/console/settings/shops/${encodeURIComponent(row.id)}`}
      searchKeys={['id', 'name', 'platformLabel', 'region', 'externalShopId', 'sellerId', 'shopGroup', 'fulfillmentMode', 'authStatus', 'lastError', 'owner']}
      searchPlaceholder="搜索店铺、卖家 ID、分组或平台店铺 ID"
      filters={[{ label: '授权状态', options: [...SHOP_AUTH_STATUSES], key: 'authStatus' }]}
      emptyText="暂无店铺。新增草稿后可排队重授权（原型）。"
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
            row.syncPaused ? (
              <Badge variant="destructive">已暂停</Badge>
            ) : (
              <Badge variant="secondary">同步中</Badge>
            ),
        },
        { key: 'lastSyncAt', label: '最近同步' },
        { key: 'credentialMask', label: '凭证' },
      ]}
    >
      <DetailKpiRow items={kpiItems} />
      <UedPrototypeNotice>
        卖家 ID（sellerId）≠ 平台店铺 ID（externalShopId）。不展示明文 token；授权失效应暂停自动同步；重授权不跳转真实平台。
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
            <span className="text-sm font-medium">{row.name}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const result = setShopSyncPaused(row.id, !row.syncPaused)
                setNotice(
                  result.ok
                    ? `${result.row.name} 同步已${result.row.syncPaused ? '暂停' : '恢复'}（原型）`
                    : result.reason,
                )
              }}
            >
              {row.syncPaused ? '恢复同步' : '暂停同步'}
            </Button>
            {(row.authStatus === '授权失效' || row.authStatus === '待授权' || row.authStatus === '草稿') && (
              <Button
                size="sm"
                onClick={() => {
                  const result = markShopReauthQueued(row.id)
                  setNotice(result.ok ? `${result.row.name}：${result.row.lastError}` : result.reason)
                }}
              >
                排队重授权
              </Button>
            )}
          </div>
        ))}
      </div>
      {editor}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </UedWorkspace>
  )
}
