import { notFound } from 'next/navigation'
import { PageDemoBanner } from '@/components/console/page-demo-banner'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
} from '@/components/console/detail'
import { getProductBySku } from '@/lib/crossborder/mock-data'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs'

interface ProductDetailPageProps {
  params: Promise<{ sku: string }>
}

function listingVariant(status: string) {
  if (status === 'live') return 'default' as const
  if (status === 'failed') return 'destructive' as const
  if (status === 'draft' || status === 'pending_review') return 'secondary' as const
  return 'outline' as const
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { sku } = await params
  const product = getProductBySku(sku)
  if (!product) notFound()

  const liveCount = product.listings.filter((l) => l.status === 'live').length
  const failedCount = product.listings.filter((l) => l.status === 'failed').length

  return (
    <div className="space-y-4">
      <PageDemoBanner />
      <DetailPageHeader
        backHref="/console/products"
        title={product.title}
        description={`SKU ${product.sku} · source=${product.source}`}
        badges={
          <>
            <Badge variant="outline">{product.status}</Badge>
            <Badge variant="secondary">{product.categoryHint}</Badge>
          </>
        }
      />

      <DetailKpiRow
        items={[
          { label: '刊登店铺数', value: String(product.listings.length) },
          { label: '在售 listing', value: String(liveCount) },
          { label: '失败 listing', value: String(failedCount), hint: failedCount ? '需处理' : undefined },
          { label: '主价（首店）', value: `${product.listings[0]?.priceAmount.toFixed(2)} ${product.listings[0]?.priceCurrency}` },
        ]}
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">基础信息</TabsTrigger>
          <TabsTrigger value="listings">多店刊登</TabsTrigger>
          <TabsTrigger value="signals">AI 信号</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <DetailFieldGrid
            title="商品 / 变体"
            fields={[
              { label: 'product.id', value: product.id, mono: true },
              { label: 'variant.sku', value: product.sku, mono: true },
              { label: 'variantId', value: product.variantId, mono: true },
              { label: 'barcode', value: product.barcode ?? '—', mono: true },
              { label: 'status', value: product.status },
              { label: 'source', value: product.source },
              { label: 'updatedAt', value: product.updatedAt },
              {
                label: 'attrs',
                value: Object.entries(product.attrs)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(', '),
              },
            ]}
          />
          <DetailSection title="描述">
            <p className="text-sm text-muted-foreground">{product.description}</p>
          </DetailSection>
        </TabsContent>

        <TabsContent value="listings" className="mt-4">
          <DetailSection
            title="listings（按店铺）"
            description="对齐 commerce.listings：status / price / platform SKU / liveAt"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>店铺</TableHead>
                  <TableHead>平台</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>价格</TableHead>
                  <TableHead>平台 SKU</TableHead>
                  <TableHead>liveAt</TableHead>
                  <TableHead>错误</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.listings.map((listing) => (
                  <TableRow key={listing.id}>
                    <TableCell className="font-medium">{listing.shopName}</TableCell>
                    <TableCell>{listing.platform}</TableCell>
                    <TableCell>
                      <Badge variant={listingVariant(listing.status)}>{listing.status}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {listing.priceAmount.toFixed(2)} {listing.priceCurrency}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{listing.platformSku}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {listing.liveAt ?? '—'}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm text-destructive">
                      {listing.lastError ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DetailSection>
        </TabsContent>

        <TabsContent value="signals" className="mt-4">
          <DetailSection title="AI 信号（示例 · C 级）" description="决策辅助，不直接写生产">
            <div className="flex flex-wrap gap-2">
              {product.aiSignals.map((signal) => (
                <Badge key={signal} variant="secondary">
                  {signal}
                </Badge>
              ))}
            </div>
          </DetailSection>
        </TabsContent>
      </Tabs>
    </div>
  )
}
