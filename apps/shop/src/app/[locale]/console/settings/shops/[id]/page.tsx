import { notFound } from 'next/navigation'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
} from '@/components/console/detail'
import { getShopById } from '@/lib/crossborder/mock-data'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { labelField, labelStatus } from '@/lib/console/labels'

interface ShopDetailPageProps {
  params: Promise<{ id: string }>
}

function statusVariant(status: string) {
  if (status === 'active') return 'default' as const
  if (status === 'error') return 'destructive' as const
  if (status === 'connecting') return 'secondary' as const
  return 'outline' as const
}

const OAUTH_PLATFORMS = new Set(['daraz', 'lazada', 'tiktok_shop'])

export default async function ShopDetailPage({ params }: ShopDetailPageProps) {
  const { id } = await params
  const shop = getShopById(id)
  if (!shop) notFound()

  const canOauth = OAUTH_PLATFORMS.has(shop.platform)
  const oauthHref = canOauth
    ? `/api/marketplace/oauth/authorize?platform=${shop.platform}&shopId=${shop.id}&locale=zh&region=${shop.region.toLowerCase()}`
    : undefined

  return (
    <div className="space-y-4">
      <DetailPageHeader
        backHref="/console/settings/shops"
        backLabel="返回店铺列表"
        title={shop.name}
        description="店铺详情 · 授权连接使用本页店铺 ID · 凭证已脱敏"
        badges={
          <>
            <Badge variant={statusVariant(shop.status)}>{labelStatus(shop.status)}</Badge>
            <Badge variant="outline">{shop.platform}</Badge>
          </>
        }
        actions={
          oauthHref ? (
            <Button variant="outline" size="sm" asChild>
              <a href={oauthHref}>重新授权</a>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              重连
            </Button>
          )
        }
      />

      <DetailKpiRow
        items={[
          { label: '健康', value: labelStatus(shop.health) },
          { label: '最近订单同步', value: shop.lastOrdersSyncAt ?? '—' },
          { label: '最近库存同步', value: shop.lastInventorySyncAt ?? '—' },
          { label: '区域 / 币种', value: `${shop.region} / ${shop.currency}` },
        ]}
      />

      <DetailFieldGrid
        title="店铺信息"
        fields={[
          { label: labelField('id'), value: shop.id, mono: true },
          { label: labelField('slug'), value: shop.slug, mono: true },
          { label: labelField('externalShopId'), value: shop.externalShopId, mono: true },
          { label: labelField('platform'), value: shop.platform },
          { label: labelField('region'), value: shop.region },
          { label: labelField('marketplaceCountry'), value: shop.marketplaceCountry },
          { label: labelField('timezone'), value: shop.timezone },
          { label: labelField('sellerName'), value: shop.sellerName },
          { label: labelField('currency'), value: shop.currency },
          { label: labelField('status'), value: labelStatus(shop.status) },
          { label: labelField('authExpiresAt'), value: shop.authExpiresAt ?? '—' },
          { label: labelField('lastSyncAt'), value: shop.lastSyncAt },
          { label: labelField('meta'), value: JSON.stringify(shop.meta) },
        ]}
      />

      <DetailSection title="接入凭证（脱敏）">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">类型</dt>
            <dd className="mt-1 text-sm font-medium">{shop.credentialKind}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">脱敏密钥</dt>
            <dd className="mt-1 font-mono text-sm">{shop.credentialMask}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">到期时间</dt>
            <dd className="mt-1 text-sm font-medium">{shop.credentialExpiresAt ?? '—'}</dd>
          </div>
        </dl>
      </DetailSection>

      {shop.lastError ? (
        <DetailSection title="最近同步错误">
          <p className="text-sm text-destructive">{shop.lastError}</p>
        </DetailSection>
      ) : null}
    </div>
  )
}
