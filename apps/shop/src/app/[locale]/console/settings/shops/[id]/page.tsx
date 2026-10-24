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
        description="shops enriched · OAuth Connect 使用本页 shop.id（cuid）· credentials 脱敏"
        badges={
          <>
            <Badge variant={statusVariant(shop.status)}>{shop.status}</Badge>
            <Badge variant="outline">{shop.platform}</Badge>
          </>
        }
        actions={
          oauthHref ? (
            <Button variant="outline" size="sm" asChild>
              <a href={oauthHref}>重连 OAuth</a>
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
          { label: '健康', value: shop.health },
          { label: '最近订单同步', value: shop.lastOrdersSyncAt ?? '—' },
          { label: '最近库存同步', value: shop.lastInventorySyncAt ?? '—' },
          { label: '区域 / 币种', value: `${shop.region} / ${shop.currency}` },
        ]}
      />

      <DetailFieldGrid
        title="shops（enriched）"
        fields={[
          { label: 'id', value: shop.id, mono: true },
          { label: 'slug', value: shop.slug, mono: true },
          { label: 'externalShopId', value: shop.externalShopId, mono: true },
          { label: 'platform', value: shop.platform },
          { label: 'region', value: shop.region },
          { label: 'marketplaceCountry', value: shop.marketplaceCountry },
          { label: 'timezone', value: shop.timezone },
          { label: 'sellerName', value: shop.sellerName },
          { label: 'currency', value: shop.currency },
          { label: 'status', value: shop.status },
          { label: 'authExpiresAt', value: shop.authExpiresAt ?? '—' },
          { label: 'lastSyncAt', value: shop.lastSyncAt },
          { label: 'meta', value: JSON.stringify(shop.meta) },
        ]}
      />

      <DetailSection title="integration_credentials（脱敏）">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">kind</dt>
            <dd className="mt-1 text-sm font-medium">{shop.credentialKind}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">mask</dt>
            <dd className="mt-1 font-mono text-sm">{shop.credentialMask}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">expiresAt</dt>
            <dd className="mt-1 text-sm font-medium">{shop.credentialExpiresAt ?? '—'}</dd>
          </div>
        </dl>
      </DetailSection>

      {shop.lastError ? (
        <DetailSection title="integration_states.last_error">
          <p className="text-sm text-destructive">{shop.lastError}</p>
        </DetailSection>
      ) : null}
    </div>
  )
}
