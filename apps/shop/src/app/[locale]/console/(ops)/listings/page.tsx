'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
} from '@/components/console/list'
import { DetailKpiRow } from '@/components/console/detail'
import { ProductCoverCell } from '@/components/console/product-images'
import { UedDialog, UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import {
  LISTING_PUBLISH_STATES as UI_LISTING_PUBLISH_STATES,
  LISTING_STATUSES as UI_LISTING_STATUSES,
} from '@/lib/crossborder/listing-store'
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

const PAGE_SIZE = 20

function listingVariant(status: string) {
  if (status === '在售' || status === 'live') return 'default' as const
  if (status === '失败' || status === 'failed') return 'destructive' as const
  if (status === '草稿' || status === '待审' || status === 'draft' || status === 'pending_review') {
    return 'secondary' as const
  }
  return 'outline' as const
}

export default function ListingsPage() {
  const router = useLocaleRouter()
  const [keyword, setKeyword] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [publishState, setPublishState] = React.useState('all')
  const [shopId, setShopId] = React.useState('all')
  const [platform, setPlatform] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const utils = trpc.useUtils()
  const metaQuery = trpc.listings.meta.useQuery()
  const statsQuery = trpc.listings.stats.useQuery()
  const skuCodesQuery = trpc.products.listSkuCodes.useQuery()
  const listQuery = trpc.listings.list.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: keyword || undefined,
    status: status === 'all' ? undefined : status,
    publishState: publishState === 'all' ? undefined : publishState,
    shopId: shopId === 'all' ? undefined : shopId,
    platform: platform === 'all' ? undefined : platform,
  })

  const createMutation = trpc.listings.create.useMutation({
    onSuccess: async (created) => {
      await utils.listings.list.invalidate()
      await utils.listings.stats.invalidate()
      await utils.mappings.list.invalidate()
      setOpen(false)
      setNotice(`${created.id} 已创建（${created.status}）· 已写入映射行`)
      router.push(`/console/listings/${encodeURIComponent(created.id)}`)
    },
    onError: (error) => setNotice(error.message),
  })

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const stats = statsQuery.data
  const shops = metaQuery.data?.shops ?? []
  const platforms = [...new Set(shops.map((s) => s.platform).filter(Boolean))]
  const skuOptions = skuCodesQuery.data ?? []
  const editor = open ? (
    <UedDialog
      title="新建刊登"
      description="先建刊登头信息，并自动生成一条 Seller SKU 映射行写入 PostgreSQL。刊登拉取走 apps/api 读同步；平台新建/改价/下架写接口本轮不开通。"
      fields={[
        {
          key: 'shopId',
          label: '店铺',
          options: shops.length ? shops.map((s) => `${s.id}::${s.name}`) : ['（请先 seed 店铺）'],
          required: true,
          helper: '选项值为 shopId::店铺名',
        },
        {
          key: 'sku',
          label: '内部 SKU',
          options: skuOptions.length ? skuOptions : ['HSY000001001'],
          required: true,
        },
        { key: 'sellerSku', label: 'Seller SKU', required: true, placeholder: '平台侧 SKU' },
        { key: 'title', label: '标题', required: true, fullWidth: true },
        { key: 'sellPrice', label: '售价', type: 'number', required: true, defaultValue: '12.5' },
        { key: 'currency', label: '币种', options: ['USD', 'MYR', 'THB', 'SGD', 'LKR'], required: true },
        {
          key: 'status',
          label: '状态',
          options: [...UI_LISTING_STATUSES],
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
        const rawShop = values.shopId || ''
        const shopIdValue = rawShop.includes('::') ? rawShop.split('::')[0]! : rawShop
        const shopMeta = shops.find((s) => s.id === shopIdValue)
        createMutation.mutate({
          shopId: shopIdValue || undefined,
          shopName: shopMeta?.name,
          sku: values.sku || skuOptions[0] || '',
          sellerSku: values.sellerSku || '',
          title: values.title || '',
          sellPrice: Number(values.sellPrice || '0'),
          currency: values.currency || shopMeta?.currency || 'USD',
          status: values.status || '草稿',
          brandName: values.brandName,
          categoryPath: values.categoryPath,
          warehouseCode: values.warehouseCode,
          logisticsChannel: values.logisticsChannel,
          note: values.note,
        })
      }}
      saveLabel={createMutation.isPending ? '保存中…' : '创建刊登'}
    />
  ) : null

  return (
    <div className="space-y-4">
      {editor}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">刊登</h2>
          <p className="text-sm text-muted-foreground">
            平台商品刊登 · 头信息 + 映射行 · 经 tRPC 读写 PostgreSQL；拉取可读同步，平台写入本轮不开通。
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>新建刊登</Button>
      </div>

      <UedPrototypeNotice>
        新建刊登写 listings + seller_sku_mappings。requestPlatformSync 仅更新本地 publishState，不调用 connector。
      </UedPrototypeNotice>
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <DetailKpiRow
        items={[
          { label: '刊登数', value: String(stats?.total ?? '—'), hint: '数据库' },
          { label: '在售', value: String(stats?.live ?? '—') },
          { label: '草稿 / 待审', value: String(stats?.draftish ?? '—') },
          { label: '失败', value: String(stats?.failed ?? '—') },
        ]}
      />

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={(value) => {
          setKeyword(value)
          setPage(1)
        }}
        keywordPlaceholder="标题 / Seller SKU / 品牌 / 类目 / 外部 Item"
        filters={[
          {
            id: 'status',
            label: '状态',
            value: status,
            onChange: (value) => {
              setStatus(value)
              setPage(1)
            },
            options: UI_LISTING_STATUSES.map((v) => ({ value: v, label: v })),
          },
          {
            id: 'publish',
            label: '发布状态',
            value: publishState,
            onChange: (value) => {
              setPublishState(value)
              setPage(1)
            },
            options: UI_LISTING_PUBLISH_STATES.map((v) => ({ value: v, label: v })),
          },
          {
            id: 'shop',
            label: '店铺',
            value: shopId,
            onChange: (value) => {
              setShopId(value)
              setPage(1)
            },
            options: shops.map((s) => ({ value: s.id, label: s.name })),
          },
          {
            id: 'platform',
            label: '平台',
            value: platform,
            onChange: (value) => {
              setPlatform(value)
              setPage(1)
            },
            options: platforms.map((v) => ({ value: v, label: v })),
          },
        ]}
      />

      <ConsoleListSection
        title="刊登列表"
        description={
          listQuery.isLoading
            ? '正在加载…'
            : listQuery.isError
              ? `加载失败：${listQuery.error.message}`
              : `共 ${total} 条 · PostgreSQL`
        }
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total,
          onPageChange: setPage,
        }}
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
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <ProductCoverCell
                      imageKey={`listing:${row.id}`}
                      fallback={{ cover: undefined, images: [] }}
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
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
    </div>
  )
}
