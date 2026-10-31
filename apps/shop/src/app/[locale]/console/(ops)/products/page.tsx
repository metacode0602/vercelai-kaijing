'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
  matchesKeyword,
  useConsolePagination,
} from '@/components/console/list'
import { MOCK_PRODUCT_LIST_ROWS } from '@/lib/crossborder/mock-data'
import { ProductCoverCell } from '@/components/console/product-images'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { labelStatus, labeledOptions } from '@/lib/console/labels'

function listingVariant(status: string) {
  if (status === 'live') return 'default' as const
  if (status === 'failed') return 'destructive' as const
  if (status === 'draft' || status === 'pending_review') return 'secondary' as const
  return 'outline' as const
}

const SHOPS = [...new Set(MOCK_PRODUCT_LIST_ROWS.map((r) => r.shop))]
const LISTINGS = [...new Set(MOCK_PRODUCT_LIST_ROWS.map((r) => r.listing))]
const PLATFORMS = [...new Set(MOCK_PRODUCT_LIST_ROWS.map((r) => r.platform))]

export default function ProductsPage() {
  const [keyword, setKeyword] = React.useState('')
  const [listing, setListing] = React.useState('all')
  const [shop, setShop] = React.useState('all')
  const [platform, setPlatform] = React.useState('all')

  const rows = MOCK_PRODUCT_LIST_ROWS.filter((row) => {
    if (!matchesKeyword(keyword, row.sku, row.title, row.shop)) return false
    if (listing !== 'all' && row.listing !== listing) return false
    if (shop !== 'all' && row.shop !== shop) return false
    if (platform !== 'all' && row.platform !== platform) return false
    return true
  })
  const { pagedRows, pagination } = useConsolePagination(rows)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">商品与刊登</h2>
        <p className="text-sm text-muted-foreground">SKU / 标题 / 状态 / 价格 · 点击行进入详情</p>
      </div>

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        keywordPlaceholder="SKU / 标题 / 店铺"
        filters={[
          {
            id: 'listing',
            label: '刊登状态',
            value: listing,
            onChange: setListing,
            options: labeledOptions(LISTINGS),
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
        title="商品列表"
        description={`共 ${rows.length} 条`}
        pagination={pagination}
      >
        {rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">封面</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>标题</TableHead>
                <TableHead>主店</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>店铺数</TableHead>
                <TableHead>刊登状态</TableHead>
                <TableHead>价格</TableHead>
                <TableHead>更新</TableHead>
                <TableHead>最近错误</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((row) => (
                <TableRow key={row.sku}>
                  <TableCell>
                    <ProductCoverCell imageKey={`product:${row.sku}`} fallback={{ cover: row.coverImage, images: row.images }} alt={row.title} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <LocaleLink
                      href={`/console/products/${row.sku}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.sku}
                    </LocaleLink>
                  </TableCell>
                  <TableCell className="font-medium">
                    <LocaleLink
                      href={`/console/products/${row.sku}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.title}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>{row.shop}</TableCell>
                  <TableCell>{row.platform}</TableCell>
                  <TableCell className="tabular-nums">{row.shopCount}</TableCell>
                  <TableCell>
                    <Badge variant={listingVariant(row.listing)}>{labelStatus(row.listing)}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.priceAmount.toFixed(2)} {row.priceCurrency}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.updatedAt}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-sm text-destructive">
                    {row.lastError ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
    </div>
  )
}
