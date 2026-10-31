'use client'

import * as React from 'react'
import {
  ConsoleBreadcrumbs,
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailRelatedTables,
  parentsToFields,
} from '@/components/console/detail'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { buildUedRelatedInfo } from '@/lib/console/related-info'
import {
  markShopReauthQueued,
  setShopSyncPaused,
  toRelatedShopShape,
  useShopConnections,
} from '@/lib/crossborder/shop-connection-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function ShopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const rows = useShopConnections()
  const row = rows.find((item) => item.id === id)
  const [mounted, setMounted] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!row) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/settings/shops"
          title={mounted ? '未找到店铺' : '加载中…'}
          description={mounted ? `店铺 ${id} 不存在。` : '正在读取本机原型会话…'}
        />
      </div>
    )
  }

  const related = buildUedRelatedInfo('shops', toRelatedShopShape(row))
  const parentFields = parentsToFields(related.parents)

  return (
    <div className="flex w-full flex-col gap-4">
      <ConsoleBreadcrumbs
        items={[{ label: '店铺连接', href: '/console/settings/shops' }, { label: row.name }]}
      />
      <DetailPageHeader
        backHref="/console/settings/shops"
        title={row.name}
        description={`${row.platformLabel} · ${row.region} · ${row.externalShopId}`}
        badges={
          <>
            <Badge variant={row.authStatus === '授权失效' ? 'destructive' : 'secondary'}>
              {row.authStatus}
            </Badge>
            <Badge variant="outline">{row.fulfillmentMode}</Badge>
            {row.syncPaused ? <Badge variant="destructive">同步暂停</Badge> : null}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const result = setShopSyncPaused(row.id, !row.syncPaused)
                setNotice(
                  result.ok
                    ? `同步已${result.row.syncPaused ? '暂停' : '恢复'}（原型）`
                    : result.reason,
                )
              }}
            >
              {row.syncPaused ? '恢复同步' : '暂停同步'}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const result = markShopReauthQueued(row.id)
                setNotice(result.ok ? result.row.lastError : result.reason)
              }}
            >
              排队重授权
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <LocaleLink href="/console/sync-tasks">同步任务</LocaleLink>
            </Button>
          </div>
        }
      />
      {row.authStatus === '授权失效' ? (
        <Alert variant="destructive">
          <AlertTitle>授权失效 · 应暂停自动同步</AlertTitle>
          <AlertDescription>{row.lastError}</AlertDescription>
        </Alert>
      ) : null}
      <UedPrototypeNotice>
        {notice || '凭证已脱敏；OAuth 重授权不跳转真实平台。'}
      </UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '授权', value: row.authStatus },
          { label: '健康', value: row.healthLabel },
          { label: '履约', value: row.fulfillmentMode },
          { label: '分组', value: row.shopGroup },
        ]}
      />
      <DetailFieldGrid
        title="店铺连接详情"
        description="shops / shop_credentials 投影（脱敏）"
        fields={[
          { label: '店铺 ID', value: row.id, mono: true },
          ...parentFields,
          { label: '平台', value: row.platformLabel },
          { label: '站点', value: row.region },
          { label: '卖家 ID', value: row.sellerId, mono: true },
          { label: '店铺分组', value: row.shopGroup },
          { label: '履约模式', value: row.fulfillmentMode },
          { label: '平台店铺 ID', value: row.externalShopId, mono: true },
          { label: '凭证掩码', value: row.credentialMask, mono: true },
          { label: '授权到期', value: row.authExpiresAt },
          { label: '默认仓库', value: row.defaultWarehouse, mono: true },
          { label: '负责人', value: row.owner },
          { label: '最近同步', value: row.lastSyncAt },
          { label: '最近订单同步', value: row.lastOrdersSyncAt },
          { label: '最近库存同步', value: row.lastInventorySyncAt },
          { label: '最近错误', value: row.lastError },
        ]}
      />
      <DetailRelatedTables sections={related.sections ?? []} />
    </div>
  )
}
