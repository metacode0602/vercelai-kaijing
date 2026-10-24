'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
  matchesKeyword,
} from '@/components/console/list'
import { MOCK_LISTING_LIST_ROWS } from '@/lib/crossborder/mock-data'
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

function listingVariant(status: string) {
  if (status === 'live') return 'default' as const
  if (status === 'failed') return 'destructive' as const
  if (status === 'draft' || status === 'pending_review') return 'secondary' as const
  return 'outline' as const
}

const STATUSES = [...new Set(MOCK_LISTING_LIST_ROWS.map((r) => r.status))]
const PUBLISH = [...new Set(MOCK_LISTING_LIST_ROWS.map((r) => r.publishState))]
const SHOPS = [...new Set(MOCK_LISTING_LIST_ROWS.map((r) => r.shop))]
const PLATFORMS = [...new Set(MOCK_LISTING_LIST_ROWS.map((r) => r.platform))]

export default function ListingsPage() {
  const [keyword, setKeyword] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [publishState, setPublishState] = React.useState('all')
  const [shop, setShop] = React.useState('all')
  const [platform, setPlatform] = React.useState('all')

  const rows = MOCK_LISTING_LIST_ROWS.filter((row) => {
    if (
      !matchesKeyword(
        keyword,
        row.title,
        row.sku,
        row.shop,
        row.brandName,
        row.externalItemId,
        row.categoryPath,
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">刊登 Listings</h2>
        <p className="text-sm text-muted-foreground">
          平台商品刊登 · brand / category / stock / logistics / publishState · 对齐 commerce listings 列
        </p>
      </div>

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        keywordPlaceholder="标题 / SKU / 品牌 / 类目 / 店铺 / itemId"
        filters={[
          {
            id: 'status',
            label: '状态',
            value: status,
            onChange: setStatus,
            options: STATUSES.map((v) => ({ value: v, label: v })),
          },
          {
            id: 'publish',
            label: 'publishState',
            value: publishState,
            onChange: setPublishState,
            options: PUBLISH.map((v) => ({ value: v, label: v })),
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
        description={`共 ${rows.length} 条 · Daraz / Lazada / TikTok 字段示例`}
      >
        {rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>店铺</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>品牌</TableHead>
                <TableHead>类目</TableHead>
                <TableHead>库存</TableHead>
                <TableHead>仓 / 物流</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>publish</TableHead>
                <TableHead>价格</TableHead>
                <TableHead>externalItemId</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-[200px] font-medium">
                    <LocaleLink
                      href={`/console/listings/${row.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.title}
                    </LocaleLink>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.sku}</TableCell>
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
                  <TableCell className="font-mono text-xs">{row.externalItemId}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
    </div>
  )
}
