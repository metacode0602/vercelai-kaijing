'use client'

import * as React from 'react'
import {
  DetailKpiRow, DetailPageHeader, DetailSection, EditableDetailFields,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@workspace/ui/components/table'
import { labelField, labelStatus } from '@/lib/console/labels'
import { ProductReviewsSection } from '@/components/console/product-reviews-section'
import { ProductImageEditor } from '@/components/console/product-images'
import { Button } from '@workspace/ui/components/button'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'

function listingVariant(status: string) {
  if (status === 'live' || status === '在售') return 'default' as const
  if (status === 'failed' || status === '失败') return 'destructive' as const
  if (status === 'draft' || status === 'pending_review' || status === '草稿') return 'secondary' as const
  return 'outline' as const
}

export default function ProductDetailPage({ params }: { params: Promise<{ sku: string }> }) {
  const sku = decodeRouteParam(React.use(params).sku)
  const skuQuery = trpc.products.skuByCode.useQuery({ code: sku })
  const listingsQuery = trpc.listings.list.useQuery({ page: 1, pageSize: 50, q: sku })
  const suppliersQuery = trpc.suppliers.listSkus.useQuery({ page: 1, pageSize: 50, sku })
  const inventoryQuery = trpc.wms.getInventoryAlertBySku.useQuery({ sku }, { retry: false })
  const costQuery = trpc.finance.getSkuCostBySku.useQuery({ sku }, { retry: false })

  if (skuQuery.isLoading) return <p className="text-sm text-muted-foreground">加载商品…</p>
  if (!skuQuery.data) {
    return <div className="space-y-4"><DetailPageHeader backHref="/console/products" title="未找到商品" description={`SKU ${sku}`} /></div>
  }

  const product = skuQuery.data
  const listings = (listingsQuery.data?.items ?? []).filter(
    (l) => l.sku === product.sku || l.sku === product.code || l.primaryVariantId === product.id,
  )
  const liveCount = listings.filter((l) => l.status === '在售' || String(l.status) === 'live').length
  const failedCount = listings.filter((l) => l.status === '失败' || String(l.status) === 'failed').length
  const suppliers = suppliersQuery.data?.items ?? []
  const inventory = inventoryQuery.data
  const cost = costQuery.data?.latest
  const landed = cost?.landedUnitCost ?? null

  return (
    <div className="space-y-6">
      <ConsoleBreadcrumbRegistration items={[{ label: '商品', href: '/console/products' }, { label: product.sku }]} />
      <DetailPageHeader
        backHref="/console/products"
        title={product.name || product.sku}
        description={`SKU ${product.sku} · SPU ${product.spu || '—'}`}
        badges={<><Badge variant="outline">{labelStatus(product.status)}</Badge><Badge variant="secondary">{product.category || '—'}</Badge></>}
      />
      <Alert>
        <AlertTitle>主档已接库</AlertTitle>
        <AlertDescription>
          商品 / 变体读 product_variants；刊登读 listings；供应商价目读 supplier_skus；库存与成本读 balances / sku_costs。平台同步仍待 OpenAPI。
        </AlertDescription>
      </Alert>
      <DetailKpiRow items={[
        { label: '刊登店铺数', value: String(listings.length) },
        { label: '在售刊登', value: String(liveCount) },
        { label: '失败刊登', value: String(failedCount), hint: failedCount ? '需处理' : undefined },
        { label: '主价（首店）', value: listings[0] != null ? `${Number(listings[0].sellPrice).toFixed(2)} ${listings[0].currency}` : '—' },
      ]} />
      <ProductImageEditor imageKey={`product:${product.sku}`} fallback={{ cover: product.coverImage, images: product.images }} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild><LocaleLink href="/console/suppliers">供应商来源</LocaleLink></Button>
        <Button variant="outline" asChild><LocaleLink href="/console/mappings">Seller SKU 映射</LocaleLink></Button>
        <Button variant="outline" asChild><LocaleLink href="/console/inventory-ledger">库存流水</LocaleLink></Button>
        <Button variant="outline" asChild><LocaleLink href="/console/purchases">采购申请</LocaleLink></Button>
      </div>
      <EditableDetailFields title="商品与变体" fields={[
        { key: 'productId', label: labelField('product.id'), value: product.productId, mono: true, readOnly: true, required: true },
        { key: 'sku', label: labelField('variant.sku'), value: product.sku, mono: true, readOnly: true },
        { key: 'spu', label: 'SPU', value: product.spu || '—', mono: true },
        { key: 'barcode', label: labelField('barcode'), value: product.barcode || '—', mono: true },
        { key: 'status', label: labelField('status'), value: labelStatus(product.status) },
        { key: 'brand', label: '品牌', value: product.brand || '—' },
        { key: 'owner', label: '负责人', value: product.owner || '—' },
        { key: 'attrs', label: labelField('attrs'), value: [product.color, product.size, product.pack].filter(Boolean).join(' / ') || '—' },
      ]} />
      <DetailSection title="刊登列表" description="状态 / 价格 / 类目 / 最近错误">
        {listings.length === 0 ? <p className="text-sm text-muted-foreground">暂无刊登记录</p> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>店铺</TableHead><TableHead>平台</TableHead><TableHead>状态</TableHead><TableHead>价格</TableHead>
              <TableHead>类目外部 ID</TableHead><TableHead>平台 SKU</TableHead><TableHead>上架时间</TableHead><TableHead>最近错误</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {listings.map((listing) => (
                <TableRow key={listing.id}>
                  <TableCell className="font-medium">{listing.shopName}</TableCell>
                  <TableCell>{listing.platform}</TableCell>
                  <TableCell><Badge variant={listingVariant(String(listing.status))}>{listing.status}</Badge></TableCell>
                  <TableCell className="tabular-nums">{Number(listing.sellPrice).toFixed(2)} {listing.currency}</TableCell>
                  <TableCell className="font-mono text-xs">{listing.categoryPath || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{listing.externalItemId || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{listing.updatedAt || '—'}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-sm text-destructive">{listing.lastError || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DetailSection>
      <DetailSection title="供应商来源" description="supplier_skus 真实价目；采购前请复核生效价">
        {suppliers.length === 0 ? <p className="text-sm text-muted-foreground">暂无供应商价目</p> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>供应商</TableHead><TableHead>厂家款号</TableHead><TableHead>报价</TableHead><TableHead>交期</TableHead><TableHead>首选</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell>{supplier.supplier}</TableCell>
                  <TableCell className="font-mono text-xs">{supplier.factoryCode}</TableCell>
                  <TableCell>{supplier.price} {supplier.currency}</TableCell>
                  <TableCell>{supplier.leadDays} 天</TableCell>
                  <TableCell>{supplier.preferred ? '是' : '否'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DetailSection>
      <DetailSection title="库存与成本参考" description="同 SKU 的库存信号与到仓成本">
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-md border p-3">
            <p className="font-medium">库存</p>
            {inventory ? (
              <div className="mt-2 space-y-1 text-muted-foreground">
                <p>可用 {inventory.available} · 在库 {inventory.onHand} · 预留 {inventory.reserved}</p>
                <p>{inventory.suggestion}</p>
                <LocaleLink href={`/console/inventory/${sku}`} className="underline-offset-2 hover:underline">打开库存详情</LocaleLink>
              </div>
            ) : <p className="mt-1 text-muted-foreground">暂无库存余额</p>}
          </div>
          <div className="rounded-md border p-3">
            <p className="font-medium">成本</p>
            {cost && landed != null ? (
              <div className="mt-2 space-y-1 text-muted-foreground">
                <p>到仓 {landed.toFixed(2)} {cost.currency}{cost.suggestPrice != null ? ` · 建议售价 ${cost.suggestPrice.toFixed(2)} ${cost.currency}` : ''}</p>
                {cost.targetMarginPct != null ? <p>目标毛利率 {cost.targetMarginPct}%</p> : null}
                <LocaleLink href={`/console/costs/${sku}`} className="underline-offset-2 hover:underline">打开成本详情</LocaleLink>
              </div>
            ) : <p className="mt-1 text-muted-foreground">暂无 sku_costs</p>}
          </div>
        </div>
      </DetailSection>
      <ProductReviewsSection sku={sku} />
    </div>
  )
}
