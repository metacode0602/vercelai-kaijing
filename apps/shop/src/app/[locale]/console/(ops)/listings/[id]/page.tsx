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
import {
  LISTING_PUBLISH_STATES,
  LISTING_STATUSES,
  listingMappingHref,
  toRelatedListingShape,
} from '@/lib/crossborder/listing-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
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
import { SyncConfirmDialog } from '@/components/console/sync-confirm-dialog'

function listingVariant(status: string) {
  if (status === '在售') return 'default' as const
  if (status === '失败') return 'destructive' as const
  if (status === '草稿' || status === '待审') return 'secondary' as const
  return 'outline' as const
}

export default function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const query = trpc.listings.get.useQuery({ id })
  const skuCodesQuery = trpc.products.listSkuCodes.useQuery()
  const siblingsQuery = trpc.listings.list.useQuery(
    { page: 1, pageSize: 20, sku: query.data?.sku },
    { enabled: !!query.data?.sku },
  )
  const [editOpen, setEditOpen] = React.useState(false)
  const [lineOpen, setLineOpen] = React.useState(false)
  const [syncConfirmOpen, setSyncConfirmOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const updateMutation = trpc.listings.update.useMutation({
    onSuccess: async () => {
      await utils.listings.get.invalidate({ id })
      await utils.listings.list.invalidate()
      setEditOpen(false)
      setNotice('刊登已更新（数据库）')
    },
    onError: (error) => setNotice(error.message),
  })
  const shelfMutation = trpc.listings.setShelf.useMutation({
    onSuccess: async (row) => {
      await utils.listings.get.invalidate({ id })
      await utils.listings.list.invalidate()
      setNotice(`本地状态已改为「${row.status}」（未调用平台 OpenAPI）`)
    },
    onError: (error) => setNotice(error.message),
  })
  const syncMutation = trpc.listings.requestPlatformSync.useMutation({
    onSuccess: async (result) => {
      await utils.listings.get.invalidate({ id })
      setNotice(result.message)
    },
    onError: (error) => setNotice(error.message),
  })
  const addLineMutation = trpc.listings.addMappingLine.useMutation({
    onSuccess: async (listing) => {
      await utils.listings.get.invalidate({ id })
      await utils.mappings.list.invalidate()
      setLineOpen(false)
      setNotice(`映射行已添加（共 ${listing.mappingLineCount} 行）`)
    },
    onError: (error) => setNotice(error.message),
  })

  if (query.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/listings"
          title="加载刊登…"
          description={`正在从数据库读取 ${id}…`}
        />
      </div>
    )
  }

  if (query.isError || !query.data) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/listings"
          title="未找到刊登"
          description={query.error?.message ?? `刊登 ${id} 不存在于当前组织。`}
        />
      </div>
    )
  }

  const listing = query.data
  const related = buildUedRelatedInfo(
    'listings',
    toRelatedListingShape(listing) as Record<string, unknown>,
    {
      mappings: listing.mappingLines.map((line) => ({
        ...line,
        href: listingMappingHref(line),
      })),
      listings: (siblingsQuery.data?.items ?? [])
        .filter((item) => item.id !== listing.id)
        .map((item) => ({
          id: item.id,
          title: item.title,
          sku: item.sku,
          shop: item.shop,
          platform: item.platform,
          status: item.status,
          sellPrice: item.priceAmount,
          currency: item.priceCurrency,
          href: `/console/listings/${encodeURIComponent(item.id)}`,
        })),
    },
  )
  const parentFields = parentsToFields(related.parents)
  const siblings = (siblingsQuery.data?.items ?? []).filter((item) => item.id !== listing.id)
  const skuOptions = skuCodesQuery.data ?? []

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
        { key: 'currency', label: '币种', options: ['USD', 'MYR', 'THB', 'SGD', 'LKR'], required: true },
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
        updateMutation.mutate({
          id: listing.id,
          title: values.title,
          sellPrice: Number(values.sellPrice || '0'),
          currency: values.currency,
          status: values.status,
          publishState: values.publishState,
          brandName: values.brandName,
          categoryPath: values.categoryPath,
          warehouseCode: values.warehouseCode,
          logisticsChannel: values.logisticsChannel,
          note: values.note,
        })
      }}
      saveLabel={updateMutation.isPending ? '保存中…' : '保存'}
    />
  ) : null

  const lineDialog = lineOpen ? (
    <UedDialog
      title="添加映射行"
      description="店铺 + Seller SKU 唯一；写入 seller_sku_mappings 并关联本刊登。"
      fields={[
        { key: 'sellerSku', label: 'Seller SKU', required: true },
        {
          key: 'internalSku',
          label: '内部 SKU',
          options: skuOptions.length ? skuOptions : [listing.sku],
          required: true,
          defaultValue: listing.sku,
        },
        { key: 'color', label: '颜色' },
        { key: 'size', label: '尺码' },
        { key: 'itemId', label: 'Item ID' },
      ]}
      onClose={() => setLineOpen(false)}
      onSave={(values) => {
        addLineMutation.mutate({
          listingId: listing.id,
          sellerSku: values.sellerSku || '',
          internalSku: values.internalSku || listing.sku,
          color: values.color,
          size: values.size,
          itemId: values.itemId,
        })
      }}
      saveLabel={addLineMutation.isPending ? '保存中…' : '添加'}
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
            <Badge variant="outline">PostgreSQL</Badge>
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
            <Button
              size="sm"
              variant="outline"
              disabled={shelfMutation.isPending}
              onClick={() =>
                shelfMutation.mutate({
                  id: listing.id,
                  onShelf: listing.status !== '在售',
                })
              }
            >
              {listing.status === '在售' ? '本地下架' : '本地上架'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={syncMutation.isPending}
              onClick={() => setSyncConfirmOpen(true)}
            >
              请求刊登读同步
            </Button>
            <Button size="sm" variant="outline" asChild>
              <LocaleLink href={`/console/master-skus/${listing.sku}`}>查看 SKU</LocaleLink>
            </Button>
          </div>
        }
      />

      <Alert>
        <AlertTitle>平台刊登写入未开通（本轮只读拉取）</AlertTitle>
        <AlertDescription>
          头信息 / 售价 / 上下架状态已写入 listings 表；「请求平台同步」只更新本地 publishState，不会调用
          Daraz / Lazada / TikTok connector。
        </AlertDescription>
      </Alert>
      <UedPrototypeNotice>
        刊登头 + 映射行经 tRPC 读写 PostgreSQL；与 mappings router 双向关联。
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

      <ListingImagesSection listingId={listing.id} cover={undefined} images={undefined} />

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

      <DetailSection
        title="映射行"
        description="Seller SKU → 内部 SKU；seller_sku_mappings"
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
                  <TableCell>{item.shop}</TableCell>
                  <TableCell>{item.platform}</TableCell>
                  <TableCell>
                    <Badge variant={listingVariant(item.status)}>{item.status}</Badge>
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

      <DetailRelatedTables sections={related.sections ?? []} />
      <ProductReviewsSection sku={listing.sku} />
      <SyncConfirmDialog
        open={syncConfirmOpen}
        onOpenChange={setSyncConfirmOpen}
        title="请求刊登读同步"
        description="从平台拉取该刊登的最新头信息与状态。"
        scope={{
          label: '作用刊登',
          value: `刊登 ${listing.externalItemId || '—'} · ${listing.shopName}`,
        }}
        impacts={[
          '仅读取平台刊登头信息，不会推送任何修改到平台',
          '本地 publishState / 售价 / 上下架状态会按平台返回更新',
        ]}
        platformCall={{
          label: '将调用平台 OpenAPI',
          detail: 'Lazop /products/get',
        }}
        confirmLabel="开始同步"
        pending={syncMutation.isPending}
        onConfirm={() => {
          setSyncConfirmOpen(false)
          syncMutation.mutate({ id: listing.id })
        }}
      />
    </div>
  )
}
