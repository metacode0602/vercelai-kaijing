'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
  matchesKeyword,
  useConsolePagination,
} from '@/components/console/list'
import { DetailKpiRow } from '@/components/console/detail'
import { ProductCoverCell } from '@/components/console/product-images'
import { UedDialog, UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { findProductBySku } from '@/lib/crossborder/erp-ued-data'
import {
  createListing,
  LISTING_PUBLISH_STATES,
  LISTING_STATUSES,
  toListingListRow,
  useListings,
  type ListingStatus,
} from '@/lib/crossborder/listing-store'
import { LocaleLink } from '@/lib/i18n/navigation'
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
  if (status === '在售' || status === 'live') return 'default' as const
  if (status === '失败' || status === 'failed') return 'destructive' as const
  if (
    status === '草稿' ||
    status === '待审' ||
    status === 'draft' ||
    status === 'pending_review'
  ) {
    return 'secondary' as const
  }
  return 'outline' as const
}

export default function ListingsPage() {
  const listings = useListings()
  const listRows = React.useMemo(() => listings.map(toListingListRow), [listings])
  const [keyword, setKeyword] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [publishState, setPublishState] = React.useState('all')
  const [shop, setShop] = React.useState('all')
  const [platform, setPlatform] = React.useState('all')
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const SHOPS = [...new Set(listRows.map((r) => r.shop))]
  const PLATFORMS = [...new Set(listRows.map((r) => r.platform))]

  const rows = listRows.filter((row) => {
    if (
      !matchesKeyword(
        keyword,
        row.title,
        row.sku,
        row.shop,
        row.brandName,
        row.externalItemId,
        row.categoryPath,
        row.sellerSku,
      )
    ) {
      return false
    }
    if (status !== 'all' && row.status !== status) return false
    if (publishState !== 'all' && row.publishState !== publishState) return false
    if (shop !== 'all' && row.shop !== shop) return false
    if (platform !== 'all' && row.platform !== platform) return false
    return true
  })
  const { pagedRows, pagination } = useConsolePagination(rows)

  const editor = open ? (
    <UedDialog
      title="新建刊登"
      description="先建刊登头信息，并自动生成一条 Seller SKU 映射行；同步任务仍为原型，不调用真实平台。"
      fields={[
        {
          key: 'shopName',
          label: '店铺',
          options: ['Daraz LK · Demo', 'Lazada MY · Sandbox', 'TikTok Shop · Demo'],
          required: true,
        },
        { key: 'platform', label: '平台', options: ['Daraz', 'Lazada', 'TikTok'], required: true },
        { key: 'site', label: '站点', options: ['LK', 'MY', 'PH', 'TH', 'SG', 'US'], required: true },
        {
          key: 'sku',
          label: '内部 SKU',
          options: ['HSY000001001', 'HSY000001002', 'HSY000002001'],
          required: true,
        },
        { key: 'sellerSku', label: 'Seller SKU', required: true, placeholder: '平台侧 SKU' },
        { key: 'title', label: '标题', required: true, fullWidth: true },
        { key: 'sellPrice', label: '售价', type: 'number', required: true, defaultValue: '12.5' },
        { key: 'currency', label: '币种', options: ['USD', 'MYR', 'THB', 'SGD'], required: true },
        {
          key: 'status',
          label: '状态',
          options: [...LISTING_STATUSES],
          required: true,
          defaultValue: '草稿',
        },
        { key: 'brandName', label: '品牌' },
        { key: 'categoryPath', label: '类目路径', fullWidth: true },
        { key: 'warehouseCode', label: '仓库', options: ['WH-CN-XMN-001'], defaultValue: 'WH-CN-XMN-001' },
        {
          key: 'logisticsChannel',
          label: '物流渠道',
          options: ['Daraz Logistics', 'Lazada LGS', 'TikTok FBT', '—'],
        },
        { key: 'note', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const result = createListing({
          shopName: values.shopName || '',
          platform: values.platform || '',
          site: values.site || '',
          sku: values.sku || '',
          sellerSku: values.sellerSku || '',
          title: values.title || '',
          sellPrice: Number(values.sellPrice || '0'),
          currency: values.currency || 'USD',
          status: (values.status as ListingStatus) || '草稿',
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
        setOpen(false)
        setNotice(`${result.listing.id} 已创建（草稿）· 已同步映射行到 Seller SKU 映射`)
      }}
    />
  ) : null

  return (
    <div className="space-y-4">
      {editor}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">刊登</h2>
          <p className="text-sm text-muted-foreground">
            平台商品刊登 · 头信息 + 映射行 · 封面来自关联 SKU；详情可维护刊登截图。同步任务仍为原型。
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>新建刊登</Button>
      </div>

      <UedPrototypeNotice>
        新建刊登写入 listing-store，并双向创建/关联 mapping-store 行。不调用真实平台 connector。
      </UedPrototypeNotice>
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <DetailKpiRow
        items={[
          { label: '刊登数', value: String(listRows.length) },
          {
            label: '在售',
            value: String(listRows.filter((r) => r.status === '在售').length),
          },
          {
            label: '草稿 / 待审',
            value: String(
              listRows.filter((r) => r.status === '草稿' || r.status === '待审').length,
            ),
          },
          {
            label: '失败',
            value: String(listRows.filter((r) => r.status === '失败').length),
          },
        ]}
      />

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        keywordPlaceholder="标题 / SKU / Seller SKU / 品牌 / 类目 / 店铺"
        filters={[
          {
            id: 'status',
            label: '状态',
            value: status,
            onChange: setStatus,
            options: LISTING_STATUSES.map((v) => ({ value: v, label: v })),
          },
          {
            id: 'publish',
            label: '发布状态',
            value: publishState,
            onChange: setPublishState,
            options: LISTING_PUBLISH_STATES.map((v) => ({ value: v, label: v })),
          },
          {
            id: 'shop',
            label: '店铺',
            value: shop,
            onChange: setShop,
            options: SHOPS.map((v) => ({ value: v, label: v })),
          },
          {
            id: 'platform',
            label: '平台',
            value: platform,
            onChange: setPlatform,
            options: PLATFORMS.map((v) => ({ value: v, label: v })),
          },
        ]}
      />

      <ConsoleListSection
        title="刊登列表"
        description={`共 ${rows.length} 条 · 原型会话（头 + 映射行）`}
        pagination={pagination}
      >
        {rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>封面</TableHead>
                <TableHead>标题</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Seller SKU</TableHead>
                <TableHead>店铺</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>品牌</TableHead>
                <TableHead>类目</TableHead>
                <TableHead>库存</TableHead>
                <TableHead>仓 / 物流</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>发布</TableHead>
                <TableHead>价格</TableHead>
                <TableHead>映射行</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((row) => {
                const product = findProductBySku(row.sku)
                const cover = product?.variants.find((v) => v.code === row.sku)?.coverImage
                  || product?.coverImage
                const images =
                  product?.variants.find((v) => v.code === row.sku)?.images
                  || product?.images
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <ProductCoverCell
                        imageKey={`listing:${row.id}`}
                        fallback={{
                          cover,
                          images: images ?? [],
                        }}
                        alt={row.title}
                      />
                    </TableCell>
                    <TableCell className="max-w-[200px] font-medium">
                      <LocaleLink
                        href={`/console/listings/${row.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {row.title}
                      </LocaleLink>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                    <TableCell className="font-mono text-xs">{row.sellerSku}</TableCell>
                    <TableCell>{row.shop}</TableCell>
                    <TableCell>{row.platform}</TableCell>
                    <TableCell>{row.brandName}</TableCell>
                    <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">
                      {row.categoryPath}
                    </TableCell>
                    <TableCell className="tabular-nums">{row.stockOnHand}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.warehouseCode}
                      <br />
                      {row.logisticsChannel}
                    </TableCell>
                    <TableCell>
                      <Badge variant={listingVariant(row.status)}>{row.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.publishState}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.priceAmount.toFixed(2)} {row.priceCurrency}
                    </TableCell>
                    <TableCell className="tabular-nums">{row.mappingLineCount}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
    </div>
  )
}
