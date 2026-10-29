import { notFound } from 'next/navigation'
import {
  ConsoleBreadcrumbs,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
  EditableDetailFields,
} from '@/components/console/detail'
import {
  costLandedTotal,
  getCostBySku,
  getInventoryBySku,
  getListingById,
  getProductBySku,
  MOCK_LISTINGS,
} from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { labelField, labelStatus } from '@/lib/console/labels'
import { ProductReviewsSection } from '@/components/console/product-reviews-section'

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

  const product = getProductBySku(listing.sku)
  const inventory = getInventoryBySku(listing.sku)
  const cost = getCostBySku(listing.sku)
  const siblingListings = MOCK_LISTINGS.filter(
    (item) => item.sku === listing.sku && item.id !== listing.id,
  )
  const landed = cost ? costLandedTotal(cost) : null

  return (
    <div className="space-y-4">
      <ConsoleBreadcrumbs
        items={[{ label: '刊登', href: '/console/listings' }, { label: listing.id }]}
      />
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
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={`/console/products/${listing.sku}`}>查看商品</LocaleLink>
            </Button>
            {cost ? (
              <Button size="sm" variant="outline" asChild>
                <LocaleLink href={`/console/costs/${listing.sku}`}>查看成本</LocaleLink>
              </Button>
            ) : null}
          </div>
        }
      />

      <Alert>
        <AlertTitle>UED 示例刊登 · 非真实平台同步结果</AlertTitle>
        <AlertDescription>
          价格、库存、类目与错误信息均为演示数据。重新发布或改价不会调用平台接口，也不会改写业务库。
        </AlertDescription>
      </Alert>

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

      <EditableDetailFields
        title="刊登主数据"
        fields={[
          { key: 'id', label: labelField('id'), value: listing.id, mono: true, readOnly: true, required: true },
          { key: 'shopId', label: labelField('shopId'), value: listing.shopId, mono: true },
          { key: 'shopName', label: labelField('shopName'), value: listing.shopName },
          { key: 'platform', label: labelField('platform'), value: listing.platform },
          { key: 'externalItemId', label: labelField('externalItemId'), value: listing.externalItemId ?? '—', mono: true },
          { key: 'platformSku', label: labelField('platformSku'), value: listing.platformSku, mono: true },
          { key: 'publishState', label: labelField('publishState'), value: labelStatus(listing.publishState) },
          { key: 'status', label: labelField('status'), value: labelStatus(listing.status) },
        ]}
      />

      <EditableDetailFields
        title="类目 / 品牌 / 时间"
        columns={3}
        fields={[
          { key: 'brandExternalId', label: labelField('brandExternalId'), value: listing.brandExternalId ?? '—', mono: true },
          { key: 'brandName', label: labelField('brandName'), value: listing.brandName ?? '—' },
          { key: 'categoryExternalId', label: labelField('categoryExternalId'), value: listing.categoryExternalId, mono: true },
          { key: 'categoryPath', label: labelField('categoryPath'), value: listing.categoryPath ?? '—' },
          { key: 'submittedAt', label: labelField('submittedAt'), value: listing.submittedAt ?? '—' },
          { key: 'liveAt', label: labelField('liveAt'), value: listing.liveAt ?? '—' },
          { key: 'updatedAt', label: labelField('updatedAt'), value: listing.updatedAt },
          { key: 'lastError', label: labelField('lastError'), value: listing.lastError ?? '—' },
        ]}
      />

      <DetailSection title="关联本地商品" description="商品与变体主档">
        <div className="flex flex-col gap-2 text-sm">
          <p>
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
          {product ? (
            <p className="text-muted-foreground">
              商品状态 {labelStatus(product.status)} · 来源 {labelStatus(product.source)} · 类目提示 {product.categoryHint}
            </p>
          ) : null}
        </div>
      </DetailSection>

      {inventory ? (
        <DetailSection title="库存参考" description="该 SKU 多店库存与补货信号（示例）">
          <div className="mb-3 grid gap-2 text-sm sm:grid-cols-3">
            <p>补货信号：{labelStatus(inventory.reorderSignal)}</p>
            <p>库龄：{inventory.ageDays} 天</p>
            <p>建议：{inventory.suggestion}</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>店铺</TableHead>
                <TableHead>在库</TableHead>
                <TableHead>预留</TableHead>
                <TableHead>告警</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventory.shopBalances.map((balance) => (
                <TableRow key={balance.shopId}>
                  <TableCell>{balance.shopName}</TableCell>
                  <TableCell className="tabular-nums">{balance.onHand}</TableCell>
                  <TableCell className="tabular-nums">{balance.reserved}</TableCell>
                  <TableCell>{labelStatus(balance.alertStatus)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DetailSection>
      ) : null}

      {cost && landed != null ? (
        <DetailSection title="成本参考" description="到仓成本与建议售价（示例，待核实）">
          <div className="flex flex-wrap gap-4 text-sm">
            <p>
              到仓成本{' '}
              <span className="font-medium tabular-nums">
                {landed.toFixed(2)} {cost.currency}
              </span>
            </p>
            <p>
              建议售价{' '}
              <span className="font-medium tabular-nums">
                {cost.suggestPrice.toFixed(2)} {cost.currency}
              </span>
            </p>
            <p>目标毛利率 {cost.targetMarginPct}%</p>
            <LocaleLink
              href={`/console/costs/${cost.sku}`}
              className="underline-offset-2 hover:underline"
            >
              打开成本详情
            </LocaleLink>
          </div>
        </DetailSection>
      ) : null}

      {siblingListings.length > 0 ? (
        <DetailSection title="同 SKU 其他店铺刊登" description="跨店刊登状态对照">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>刊登 ID</TableHead>
                <TableHead>店铺</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>售价</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {siblingListings.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <LocaleLink
                      href={`/console/listings/${item.id}`}
                      className="font-mono text-xs underline-offset-2 hover:underline"
                    >
                      {item.id}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>{item.shopName}</TableCell>
                  <TableCell>{item.platform}</TableCell>
                  <TableCell>
                    <Badge variant={listingVariant(item.status)}>{labelStatus(item.status)}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {item.priceAmount.toFixed(2)} {item.priceCurrency}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DetailSection>
      ) : null}

      <ProductReviewsSection sku={listing.sku} />

      <DetailSection title="平台原稿" description="图片 / 描述等原始字段">
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(listing.payload, null, 2)}
        </pre>
      </DetailSection>
    </div>
  )
}
