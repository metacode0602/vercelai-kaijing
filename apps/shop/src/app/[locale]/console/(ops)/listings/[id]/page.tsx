import { notFound } from 'next/navigation'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
} from '@/components/console/detail'
import { getListingById } from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'

interface ListingDetailPageProps {
  params: Promise<{ id: string }>
}

function listingVariant(status: string) {
  if (status === 'live') return 'default' as const
  if (status === 'failed') return 'destructive' as const
  if (status === 'draft' || status === 'pending_review') return 'secondary' as const
  return 'outline' as const
}

export default async function ListingDetailPage({ params }: ListingDetailPageProps) {
  const { id } = await params
  const listing = getListingById(id)
  if (!listing) notFound()

  return (
    <div className="space-y-6">
      <DetailPageHeader
        backHref="/console/listings"
        title={listing.title}
        description={`listings · ${listing.platform} · shopId=${listing.shopId}`}
        badges={
          <>
            <Badge variant={listingVariant(listing.status)}>{listing.status}</Badge>
            <Badge variant="outline">{listing.publishState}</Badge>
            <Badge variant="secondary">{listing.platform}</Badge>
          </>
        }
      />

      <DetailKpiRow
        items={[
          {
            label: '价格',
            value: `${listing.priceAmount.toFixed(2)} ${listing.priceCurrency}`,
          },
          { label: '库存 stockOnHand', value: String(listing.stockOnHand ?? 0) },
          { label: '仓', value: listing.warehouseCode ?? '—' },
          { label: '物流渠道', value: listing.logisticsChannel ?? '—' },
        ]}
      />

      <DetailFieldGrid
        title="listings（enriched）"
        fields={[
          { label: 'id', value: listing.id, mono: true },
          { label: 'shopId', value: listing.shopId, mono: true },
          { label: 'shopName', value: listing.shopName },
          { label: 'platform', value: listing.platform },
          { label: 'externalItemId', value: listing.externalItemId ?? '—', mono: true },
          { label: 'platformSku', value: listing.platformSku, mono: true },
          { label: 'brandExternalId', value: listing.brandExternalId ?? '—', mono: true },
          { label: 'brandName', value: listing.brandName ?? '—' },
          { label: 'categoryExternalId', value: listing.categoryExternalId, mono: true },
          { label: 'categoryPath', value: listing.categoryPath ?? '—' },
          { label: 'publishState', value: listing.publishState },
          { label: 'status', value: listing.status },
          { label: 'submittedAt', value: listing.submittedAt ?? '—' },
          { label: 'liveAt', value: listing.liveAt ?? '—' },
          { label: 'updatedAt', value: listing.updatedAt },
          { label: 'lastError', value: listing.lastError ?? '—' },
        ]}
      />

      <DetailSection title="关联本地商品" description="products / product_variants">
        <p className="text-sm">
          SKU{' '}
          <LocaleLink
            href={`/console/products/${listing.sku}`}
            className="font-mono underline-offset-2 hover:underline"
          >
            {listing.sku}
          </LocaleLink>
          {' · '}
          {listing.productTitle}
          {' · brand '}
          {listing.brand}
        </p>
      </DetailSection>

      <DetailSection title="payload jsonb" description="平台原稿 / 图片 / 描述">
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(listing.payload, null, 2)}
        </pre>
      </DetailSection>
    </div>
  )
}
