'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
} from '@/components/console/list'
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
import { labelStatus } from '@/lib/console/labels'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { trpc } from '@/lib/trpc/client'

function listingVariant(status: string) {
  if (status === 'live') return 'default' as const
  if (status === 'failed') return 'destructive' as const
  if (status === 'draft' || status === 'pending_review') return 'secondary' as const
  return 'outline' as const
}

/** 刊登状态筛选：值为 DB 状态（SQL EXISTS 过滤），标签为中文。 */
const LISTING_FILTER_OPTIONS = [
  { value: 'draft', label: '草稿' },
  { value: 'pending_review', label: '待审' },
  { value: 'live', label: '在售' },
  { value: 'failed', label: '失败' },
  { value: 'offline', label: '下架' },
]

const PAGE_SIZE = 20

export default function ProductsPage() {
  const [keyword, setKeyword] = React.useState('')
  const [listing, setListing] = React.useState('all')
  const [platform, setPlatform] = React.useState('all')
  const [page, setPage] = React.useState(1)

  const metaQuery = trpc.listings.meta.useQuery()
  const listQuery = trpc.products.listCatalog.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: keyword || undefined,
    listing: listing === 'all' ? undefined : listing,
    platform: platform === 'all' ? undefined : platform,
  })
  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const platformOptions = [
    ...new Set((metaQuery.data?.shops ?? []).map((s) => s.platform).filter(Boolean)),
  ].map((v) => ({ value: v, label: v }))

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">商品与刊登</h2>
        <p className="text-sm text-muted-foreground">SKU / 标题 / 状态 / 价格 · 点击行进入详情</p>
      </div>
      <Alert>
        <AlertTitle>主路径已接库</AlertTitle>
        <AlertDescription>
          列表读 products / product_variants / listings（`products.listCatalog`），刊登状态 / 平台筛选为
          SQL 级 EXISTS 过滤（分页与 total 准确）。
        </AlertDescription>
      </Alert>
      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={(v) => { setKeyword(v); setPage(1) }}
        keywordPlaceholder="SKU / 标题 / SPU"
        filters={[
          { id: 'listing', label: '刊登状态', value: listing, onChange: (v) => { setListing(v); setPage(1) }, options: LISTING_FILTER_OPTIONS },
          { id: 'platform', label: '平台', value: platform, onChange: (v) => { setPlatform(v); setPage(1) }, options: platformOptions },
        ]}
      />
      <ConsoleListSection title="商品列表" description={`共 ${total} 条`} pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}>
        {listQuery.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">加载商品…</p>
        ) : rows.length === 0 ? (
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
              {rows.map((row) => (
                <TableRow key={row.sku}>
                  <TableCell>
                    <ProductCoverCell fallback={{ cover: row.coverImage, images: row.images ?? [] }} alt={row.title} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <LocaleLink href={`/console/products/${row.sku}`} className="underline-offset-2 hover:underline">{row.sku}</LocaleLink>
                  </TableCell>
                  <TableCell className="font-medium">
                    <LocaleLink href={`/console/products/${row.sku}`} className="underline-offset-2 hover:underline">{row.title}</LocaleLink>
                  </TableCell>
                  <TableCell>{row.shop}</TableCell>
                  <TableCell>{row.platform}</TableCell>
                  <TableCell className="tabular-nums">{row.shopCount}</TableCell>
                  <TableCell><Badge variant={listingVariant(row.listing)}>{labelStatus(row.listing)}</Badge></TableCell>
                  <TableCell className="tabular-nums">{row.priceAmount.toFixed(2)} {row.priceCurrency}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.updatedAt}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-sm text-destructive">{row.lastError ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
    </div>
  )
}
