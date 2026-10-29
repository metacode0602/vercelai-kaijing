import { notFound } from 'next/navigation'
import {
  ConsoleBreadcrumbs,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
  EditableDetailFields,
} from '@/components/console/detail'
import { costLandedTotal, getCostBySku, getInventoryBySku, getProductBySku } from '@/lib/crossborder/mock-data'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
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
import { ProductImageEditor } from '@/components/console/product-images'
import { Button } from '@workspace/ui/components/button'
import { LocaleLink } from '@/lib/i18n/navigation'
import { ERP_DEMO_SUPPLIERS } from '@/lib/crossborder/erp-ued-data'

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
  const inventory = getInventoryBySku(sku)
  const cost = getCostBySku(sku)
  const landed = cost ? costLandedTotal(cost) : null
  const inventoryOnHand = inventory
    ? inventory.shopBalances.reduce((sum, balance) => sum + balance.onHand, 0)
    : null

  return (
    <div className="space-y-6">
      <ConsoleBreadcrumbs
        items={[{ label: '商品', href: '/console/products' }, { label: product.sku }]}
      />
      <DetailPageHeader
        backHref="/console/products"
        title={product.title}
        description={`SKU ${product.sku} · 来源 ${labelStatus(product.source)}`}
        badges={
          <>
            <Badge variant="outline">{labelStatus(product.status)}</Badge>
            <Badge variant="secondary">{product.categoryHint}</Badge>
          </>
        }
      />

      <Alert>
        <AlertTitle>UED 示例商品 · 非生产主档</AlertTitle>
        <AlertDescription>
          刊登状态、价格与 AI 信号均为演示数据。编辑字段仅保存在当前原型会话，不会写入业务数据库或触发平台同步。
        </AlertDescription>
      </Alert>

      <DetailKpiRow
        items={[
          { label: '刊登店铺数', value: String(product.listings.length) },
          { label: '在售刊登', value: String(liveCount) },
          { label: '失败刊登', value: String(failedCount), hint: failedCount ? '需处理' : undefined },
          { label: '主价（首店）', value: `${product.listings[0]?.priceAmount.toFixed(2)} ${product.listings[0]?.priceCurrency}` },
        ]}
      />

      <ProductImageEditor
        imageKey={`product:${product.sku}`}
        fallback={{ cover: product.coverImage, images: product.images.map((image) => image.url) }}
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild><LocaleLink href="/console/suppliers">供应商来源</LocaleLink></Button>
        <Button variant="outline" asChild><LocaleLink href="/console/mappings">Seller SKU 映射</LocaleLink></Button>
        <Button variant="outline" asChild><LocaleLink href="/console/inventory-ledger">库存流水</LocaleLink></Button>
        <Button variant="outline" asChild><LocaleLink href="/console/purchases">采购申请</LocaleLink></Button>
      </div>

      <EditableDetailFields
        title="商品与变体"
        fields={[
          { key: 'productId', label: labelField('product.id'), value: product.id, mono: true, readOnly: true, required: true },
          { key: 'sku', label: labelField('variant.sku'), value: product.sku, mono: true, readOnly: true },
          { key: 'variantId', label: labelField('variantId'), value: product.variantId, mono: true },
          { key: 'barcode', label: labelField('barcode'), value: product.barcode ?? '—', mono: true },
          { key: 'status', label: labelField('status'), value: labelStatus(product.status) },
          { key: 'source', label: labelField('source'), value: labelStatus(product.source) },
          { key: 'updatedAt', label: labelField('updatedAt'), value: product.updatedAt },
          {
            key: 'attrs',
            label: labelField('attrs'),
            value: Object.entries(product.attrs)
              .map(([k, v]) => `${k}=${v}`)
              .join(', '),
          },
          { key: 'description', label: labelField('payload.description'), value: product.description },
        ]}
      />

      <DetailSection
        title="刊登列表"
        description="状态 / 价格 / 类目 / 最近错误"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>店铺</TableHead>
              <TableHead>平台</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>价格</TableHead>
              <TableHead>类目外部 ID</TableHead>
              <TableHead>平台 SKU</TableHead>
              <TableHead>上架时间</TableHead>
              <TableHead>最近错误</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {product.listings.map((listing) => (
              <TableRow key={listing.id}>
                <TableCell className="font-medium">{listing.shopName}</TableCell>
                <TableCell>{listing.platform}</TableCell>
                <TableCell>
                  <Badge variant={listingVariant(listing.status)}>{labelStatus(listing.status)}</Badge>
                </TableCell>
                <TableCell className="tabular-nums">
                  {listing.priceAmount.toFixed(2)} {listing.priceCurrency}
                </TableCell>
                <TableCell className="font-mono text-xs">{listing.categoryExternalId}</TableCell>
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

      <DetailSection title="供应商来源" description="报价为示例，新增采购申请时需复核生效价">
        <Table>
          <TableHeader><TableRow><TableHead>供应商</TableHead><TableHead>厂家款号</TableHead><TableHead>报价</TableHead><TableHead>交期</TableHead><TableHead>首选</TableHead></TableRow></TableHeader>
          <TableBody>{ERP_DEMO_SUPPLIERS.filter((supplier) => supplier.sku === sku).map((supplier) => <TableRow key={supplier.code}><TableCell>{supplier.name}</TableCell><TableCell className="font-mono text-xs">{supplier.factoryCode}</TableCell><TableCell>{supplier.price} {supplier.currency}</TableCell><TableCell>{supplier.leadDays} 天</TableCell><TableCell>{supplier.preferred ? '是' : '否'}</TableCell></TableRow>)}</TableBody>
        </Table>
      </DetailSection>

      <DetailSection title="AI 信号（示例 · C 级）" description="决策辅助，不直接写生产">
        <div className="flex flex-wrap gap-2">
          {product.aiSignals.map((signal) => (
            <Badge key={signal} variant="secondary">
              {signal}
            </Badge>
          ))}
        </div>
      </DetailSection>

      <DetailSection title="库存与成本参考" description="同 SKU 的库存信号与到仓成本（示例）">
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-md border p-3">
            <p className="font-medium">库存</p>
            {inventory && inventoryOnHand != null ? (
              <div className="mt-2 space-y-1 text-muted-foreground">
                <p>
                  多店在库合计 {inventoryOnHand} · 信号 {labelStatus(inventory.reorderSignal)}
                </p>
                <p>{inventory.suggestion}</p>
                <LocaleLink
                  href={`/console/inventory/${sku}`}
                  className="underline-offset-2 hover:underline"
                >
                  打开库存详情
                </LocaleLink>
              </div>
            ) : (
              <p className="mt-1 text-muted-foreground">暂无库存示例</p>
            )}
          </div>
          <div className="rounded-md border p-3">
            <p className="font-medium">成本</p>
            {cost && landed != null ? (
              <div className="mt-2 space-y-1 text-muted-foreground">
                <p>
                  到仓 {landed.toFixed(2)} {cost.currency} · 建议售价 {cost.suggestPrice.toFixed(2)}{' '}
                  {cost.currency}
                </p>
                <p>目标毛利率 {cost.targetMarginPct}%</p>
                <LocaleLink
                  href={`/console/costs/${sku}`}
                  className="underline-offset-2 hover:underline"
                >
                  打开成本详情
                </LocaleLink>
              </div>
            ) : (
              <p className="mt-1 text-muted-foreground">暂无成本示例</p>
            )}
          </div>
        </div>
      </DetailSection>

      <ProductReviewsSection sku={sku} />
    </div>
  )
}
