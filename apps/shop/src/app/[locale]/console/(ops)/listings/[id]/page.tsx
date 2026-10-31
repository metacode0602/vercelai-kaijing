'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailRelatedTables,
  DetailSection,
  parentsToFields,
} from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedDialog, UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { ListingImagesSection } from '@/components/console/listing-images-section'
import { ProductReviewsSection } from '@/components/console/product-reviews-section'
import { buildUedRelatedInfo } from '@/lib/console/related-info'
import { findProductBySku, getDemoSkuPricing } from '@/lib/crossborder/erp-ued-data'
import {
  addListingMappingLine,
  LISTING_PUBLISH_STATES,
  LISTING_STATUSES,
  listingMappingHref,
  toRelatedListingShape,
  updateListing,
  useListings,
  type ListingPublishState,
  type ListingStatus,
} from '@/lib/crossborder/listing-store'
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

function listingVariant(status: string) {
  if (status === '在售') return 'default' as const
  if (status === '失败') return 'destructive' as const
  if (status === '草稿' || status === '待审') return 'secondary' as const
  return 'outline' as const
}

export default function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const listings = useListings()
  const listing = listings.find((item) => item.id === id)
  const [mounted, setMounted] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [lineOpen, setLineOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!listing) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/listings"
          title={mounted ? '未找到刊登' : '加载刊登…'}
          description={
            mounted
              ? `刊登 ${id} 不存在，或仅存在于其他浏览器会话。`
              : '正在读取本机原型会话中的刊登…'
          }
        />
      </div>
    )
  }

  const product = findProductBySku(listing.sku)
  const pricing = getDemoSkuPricing(listing.sku)
  const related = buildUedRelatedInfo(
    'listings',
    toRelatedListingShape(listing) as Record<string, unknown>,
  )
  const parentFields = parentsToFields(related.parents)
  const siblings = listings.filter((item) => item.sku === listing.sku && item.id !== listing.id)
  const cover =
    product?.variants.find((v) => v.code === listing.sku)?.coverImage || product?.coverImage
  const images =
    product?.variants.find((v) => v.code === listing.sku)?.images || product?.images

  const editDialog = editOpen ? (
    <UedDialog
      title="编辑刊登"
      description="更新刊登头信息；映射行请在下方子表维护。不调用真实平台接口。"
      initialValues={{
        title: listing.title,
        sellPrice: String(listing.sellPrice),
        currency: listing.currency,
        status: listing.status,
        publishState: listing.publishState,
        brandName: listing.brandName,
        categoryPath: listing.categoryPath,
        warehouseCode: listing.warehouseCode,
        logisticsChannel: listing.logisticsChannel,
        note: listing.note,
      }}
      fields={[
        { key: 'title', label: '标题', required: true, fullWidth: true },
        { key: 'sellPrice', label: '售价', type: 'number', required: true },
        { key: 'currency', label: '币种', options: ['USD', 'MYR', 'THB', 'SGD'], required: true },
        { key: 'status', label: '状态', options: [...LISTING_STATUSES], required: true },
        {
          key: 'publishState',
          label: '发布状态',
          options: [...LISTING_PUBLISH_STATES],
          required: true,
        },
        { key: 'brandName', label: '品牌' },
        { key: 'categoryPath', label: '类目路径', fullWidth: true },
        { key: 'warehouseCode', label: '仓库', options: ['WH-CN-XMN-001'] },
        {
          key: 'logisticsChannel',
          label: '物流渠道',
          options: ['Daraz Logistics', 'Lazada LGS', 'TikTok FBT', '—'],
        },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setEditOpen(false)}
      onSave={(values) => {
        const result = updateListing(listing.id, {
          title: values.title,
          sellPrice: Number(values.sellPrice || '0'),
          currency: values.currency,
          status: values.status as ListingStatus,
          publishState: values.publishState as ListingPublishState,
          brandName: values.brandName,
          categoryPath: values.categoryPath,
          warehouseCode: values.warehouseCode,
          logisticsChannel: values.logisticsChannel,
          note: values.note,
        })
        if (!result.ok) {
          setNotice(result.reason)
          return
        }
        setEditOpen(false)
        setNotice('刊登已更新（原型会话）')
      }}
    />
  ) : null

  const lineDialog = lineOpen ? (
    <UedDialog
      title="添加映射行"
      description="店铺 + Seller SKU 唯一；会双向写入 mapping-store。"
      fields={[
        { key: 'sellerSku', label: 'Seller SKU', required: true },
        {
          key: 'internalSku',
          label: '内部 SKU',
          options: ['HSY000001001', 'HSY000001002', 'HSY000002001'],
          required: true,
          defaultValue: listing.sku,
        },
        { key: 'color', label: '颜色' },
        { key: 'size', label: '尺码' },
        { key: 'itemId', label: 'Item ID' },
      ]}
      onClose={() => setLineOpen(false)}
      onSave={(values) => {
        const result = addListingMappingLine(listing.id, {
          sellerSku: values.sellerSku || '',
          internalSku: values.internalSku || listing.sku,
          color: values.color,
          size: values.size,
          itemId: values.itemId,
        })
        if (!result.ok) {
          setNotice(result.reason)
          return
        }
        setLineOpen(false)
        setNotice(`映射行 ${result.line.sellerSku} 已添加，并同步到 Seller SKU 映射`)
      }}
    />
  ) : null

  return (
    <div className="space-y-4">
      {editDialog}
      {lineDialog}
      <ConsoleBreadcrumbRegistration
        items={[{ label: '刊登', href: '/console/listings' }, { label: listing.id }]}
      />
      <DetailPageHeader
        backHref="/console/listings"
        title={listing.title}
        description={`${listing.platform} · 店铺 ${listing.shopName}`}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
            <Badge variant={listingVariant(listing.status)}>{listing.status}</Badge>
            <Badge variant="outline">{listing.publishState}</Badge>
            <Badge variant="secondary">{listing.platform}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setEditOpen(true)}>
              编辑刊登
            </Button>
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={`/console/master-skus/${listing.sku}`}>查看 SKU</LocaleLink>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href="/console/sync-tasks">同步任务（原型）</LocaleLink>
            </Button>
          </div>
        }
      />

      <Alert>
        <AlertTitle>UED 示例刊登 · 非真实平台同步结果</AlertTitle>
        <AlertDescription>
          价格、库存、类目与错误信息均为演示数据。重新发布或改价不会调用平台接口，也不会改写业务库。
        </AlertDescription>
      </Alert>
      <UedPrototypeNotice>
        刊登头 + 映射行存于 listing-store；与 mapping-store 双向关联。同步任务保持原型。
      </UedPrototypeNotice>
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <DetailKpiRow
        items={[
          {
            label: '价格',
            value: `${listing.sellPrice.toFixed(2)} ${listing.currency}`,
          },
          { label: '在库库存', value: String(listing.stockOnHand) },
          { label: '仓', value: listing.warehouseCode || '—' },
          { label: '物流渠道', value: listing.logisticsChannel || '—' },
        ]}
      />

      <ListingImagesSection
        listingId={listing.id}
        cover={cover}
        images={images}
      />

      <DetailFieldGrid
        title="刊登主数据"
        fields={[
          { label: '刊登 ID', value: listing.id, mono: true },
          { label: '店铺', value: listing.shopName },
          { label: '平台 / 站点', value: `${listing.platform} · ${listing.site}` },
          { label: '平台商品 ID', value: listing.externalItemId || '—', mono: true },
          { label: 'Seller SKU', value: listing.sellerSku, mono: true },
          { label: '发布状态', value: listing.publishState },
          { label: '状态', value: listing.status },
          { label: '品牌', value: listing.brandName || '—' },
          { label: '类目', value: listing.categoryPath || '—' },
          { label: '提交时间', value: listing.submittedAt || '—' },
          { label: '上架时间', value: listing.liveAt || '—' },
          { label: '更新时间', value: listing.updatedAt },
          { label: '最近错误', value: listing.lastError || '—' },
          { label: '备注', value: listing.note || '—' },
        ]}
      />

      {parentFields.length ? <DetailFieldGrid title="关联主数据" fields={parentFields} /> : null}

      {pricing ? (
        <DetailSection title="主定价参考" description="内部 SKU 基准价（示例）">
          <div className="flex flex-wrap gap-4 text-sm">
            <p>
              成本{' '}
              <span className="font-medium tabular-nums">
                {pricing.costPrice.toFixed(2)} {pricing.currency}
              </span>
            </p>
            <p>
              基准售价{' '}
              <span className="font-medium tabular-nums">
                {pricing.basePrice.toFixed(2)} {pricing.currency}
              </span>
            </p>
            <p>
              建议售价{' '}
              <span className="font-medium tabular-nums">
                {pricing.suggestPrice.toFixed(2)} {pricing.currency}
              </span>
            </p>
            <p>目标毛利率 {pricing.targetMarginPct}%</p>
          </div>
        </DetailSection>
      ) : null}

      <DetailSection
        title="映射行"
        description="Seller SKU → 内部 SKU；与 mapping-store 双向"
        action={
          <Button size="sm" variant="outline" onClick={() => setLineOpen(true)}>
            添加映射行
          </Button>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Seller SKU</TableHead>
              <TableHead>内部 SKU</TableHead>
              <TableHead>颜色 / 尺码</TableHead>
              <TableHead>Item ID</TableHead>
              <TableHead>上架</TableHead>
              <TableHead>映射状态</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {listing.mappingLines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  暂无映射行，请添加。
                </TableCell>
              </TableRow>
            ) : (
              listing.mappingLines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="font-mono text-xs">{line.sellerSku}</TableCell>
                  <TableCell>
                    <LocaleLink
                      href={`/console/master-skus/${line.internalSku}`}
                      className="font-mono text-xs underline-offset-2 hover:underline"
                    >
                      {line.internalSku}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>
                    {line.color} / {line.size}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{line.itemId || '—'}</TableCell>
                  <TableCell>{line.listingStatus}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{line.mappingStatus}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" asChild>
                      <LocaleLink href={listingMappingHref(line)}>打开映射</LocaleLink>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DetailSection>

      {siblings.length > 0 ? (
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
              {siblings.map((item) => (
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
                    <Badge variant={listingVariant(item.status)}>{item.status}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {item.sellPrice.toFixed(2)} {item.currency}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DetailSection>
      ) : null}

      <DetailRelatedTables sections={related.sections ?? []} />
      <ProductReviewsSection sku={listing.sku} />
    </div>
  )
}
