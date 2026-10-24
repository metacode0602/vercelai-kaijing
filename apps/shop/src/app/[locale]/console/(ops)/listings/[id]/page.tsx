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
import { labelField, labelStatus } from '@/lib/console/labels'

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
        description={`${listing.platform} · 店铺 ${listing.shopName}`}
        badges={
          <>
            <Badge variant={listingVariant(listing.status)}>{labelStatus(listing.status)}</Badge>
            <Badge variant="outline">{labelStatus(listing.publishState)}</Badge>
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
          { label: '在库库存', value: String(listing.stockOnHand ?? 0) },
          { label: '仓', value: listing.warehouseCode ?? '—' },
          { label: '物流渠道', value: listing.logisticsChannel ?? '—' },
        ]}
      />

      <DetailFieldGrid
        title="刊登详情"
        fields={[
          { label: labelField('id'), value: listing.id, mono: true },
          { label: labelField('shopId'), value: listing.shopId, mono: true },
          { label: labelField('shopName'), value: listing.shopName },
          { label: labelField('platform'), value: listing.platform },
          { label: labelField('externalItemId'), value: listing.externalItemId ?? '—', mono: true },
          { label: labelField('platformSku'), value: listing.platformSku, mono: true },
          { label: labelField('brandExternalId'), value: listing.brandExternalId ?? '—', mono: true },
          { label: labelField('brandName'), value: listing.brandName ?? '—' },
          { label: labelField('categoryExternalId'), value: listing.categoryExternalId, mono: true },
          { label: labelField('categoryPath'), value: listing.categoryPath ?? '—' },
          { label: labelField('publishState'), value: labelStatus(listing.publishState) },
          { label: labelField('status'), value: labelStatus(listing.status) },
          { label: labelField('submittedAt'), value: listing.submittedAt ?? '—' },
          { label: labelField('liveAt'), value: listing.liveAt ?? '—' },
          { label: labelField('updatedAt'), value: listing.updatedAt },
          { label: labelField('lastError'), value: listing.lastError ?? '—' },
        ]}
      />

      <DetailSection title="关联本地商品" description="商品与变体">
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
          {' · 品牌 '}
          {listing.brand}
        </p>
      </DetailSection>

      <DetailSection title="平台原稿" description="图片 / 描述等原始字段">
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(listing.payload, null, 2)}
        </pre>
      </DetailSection>
    </div>
  )
}
