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

export default async function ShopDetailPage({ params }: ShopDetailPageProps) {
  const { id } = await params
  const shop = getShopById(id)
  if (!shop) notFound()

  return (
    <div className="space-y-4">
      <DetailPageHeader
        backHref="/console/settings/shops"
        backLabel="返回店铺列表"
        title={shop.name}
        description="多店上下文 · 连接健康与凭证概览（不明文密钥）"
        badges={
          <>
            <Badge variant={statusVariant(shop.status)}>{shop.status}</Badge>
            <Badge variant="outline">{shop.platform}</Badge>
          </>
        }
        actions={
          <Button variant="outline" size="sm" disabled>
            重连
          </Button>
        }
      />

      <DetailKpiRow
        items={[
          { label: '同步', value: shop.syncStatus },
          { label: '健康', value: shop.health },
          { label: '最近同步', value: shop.lastSyncAt },
          { label: '区域 / 币种', value: `${shop.region} / ${shop.currency}` },
        ]}
      />

      <DetailFieldGrid
        title="shops"
        fields={[
          { label: 'id', value: shop.id, mono: true },
          { label: 'externalShopId', value: shop.externalShopId, mono: true },
          { label: 'platform', value: shop.platform },
          { label: 'region', value: shop.region },
          { label: 'currency', value: shop.currency },
          { label: 'status', value: shop.status },
          { label: 'lastOrdersSyncAt', value: shop.lastOrdersSyncAt ?? '—' },
          { label: 'lastInventorySyncAt', value: shop.lastInventorySyncAt ?? '—' },
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
        <DetailSection title="last_error">
          <p className="text-sm text-destructive">{shop.lastError}</p>
        </DetailSection>
      ) : null}
    </div>
  )
}
