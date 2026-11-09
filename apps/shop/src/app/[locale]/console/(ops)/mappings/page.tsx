'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { DetailKpiRow } from '@/components/console/detail'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

const PAGE_SIZE = 20

export default function MappingsPage() {
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('全部')

  const utils = trpc.useUtils()
  const listQuery = trpc.mappings.list.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status === '全部' ? undefined : status,
  })
  const statsQuery = trpc.mappings.stats.useQuery()
  const exStatsQuery = trpc.mappings.exceptionStats.useQuery()
  const shopsQuery = trpc.mappings.listShops.useQuery()
  const skuCodesQuery = trpc.products.listSkuCodes.useQuery()

  const createMutation = trpc.mappings.create.useMutation({
    onSuccess: async (created) => {
      await utils.mappings.list.invalidate()
      await utils.mappings.stats.invalidate()
      setOpen(false)
      setNotice(`${created.shop} · ${created.sellerSku} 已写入 seller_sku_mappings。`)
    },
    onError: (error) => setNotice(error.message),
  })

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const stats = statsQuery.data
  const exKpi = exStatsQuery.data
  const shopOptions = (shopsQuery.data ?? []).map((s) => s.name)
  const shopByName = new Map((shopsQuery.data ?? []).map((s) => [s.name, s]))
  const skuOptions = skuCodesQuery.data ?? []

  const kpiItems = React.useMemo(
    () => [
      { label: '映射数', value: String(stats?.total ?? '—'), hint: '数据库' },
      { label: '启用', value: String(stats?.enabled ?? '—') },
      { label: '待确认', value: String(stats?.pending ?? '—') },
      {
        label: '异常 / 未映射',
        value: String((stats?.abnormal ?? 0) + (stats?.unmapped ?? 0)),
        hint: '异常订单不占库',
      },
      {
        label: '阻断占库异常',
        value: String(exKpi?.open ?? '—'),
        hint: 'mapping_exceptions',
      },
    ],
    [stats, exKpi?.open],
  )

  const editor = open ? (
    <UedDialog
      title="新增 Seller SKU 映射"
      description="每条平台变体只映射一个内部 SKU；店铺 + Seller SKU 必须唯一。写入 PostgreSQL。"
      fields={[
        {
          key: 'shop',
          label: '店铺',
          options: shopOptions,
          required: true,
          helper: '店铺 + Seller SKU 必须唯一；无可用店铺时先到「店铺」页连接',
        },
        { key: 'itemId', label: 'Item ID', required: true, helper: '平台商品 / Item ID' },
        {
          key: 'platformSkuId',
          label: '平台 SKU ID',
          required: true,
          helper: '独立于 Item ID、Seller SKU、内部 SKU',
        },
        { key: 'sellerSku', label: 'Seller SKU', required: true },
        {
          key: 'internalSku',
          label: '内部 SKU',
          options: skuOptions,
          required: true,
          helper: '无可用内部 SKU 时先导入商品',
        },
        { key: 'color', label: '平台颜色', required: true },
        { key: 'size', label: '平台尺码', required: true },
        {
          key: 'listingStatus',
          label: '上架状态',
          options: ['在线', '下架', '草稿', '待同步'],
          required: true,
        },
        {
          key: 'mappingStatus',
          label: '映射状态',
          options: ['待确认', '启用', '异常'],
          required: true,
        },
        { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const shopName = values.shop ?? ''
        const shop = shopByName.get(shopName)
        if (!shopName.trim() || !values.sellerSku?.trim() || !values.internalSku?.trim()) return
        createMutation.mutate({
          shopId: shop?.id,
          shop: shopName,
          itemId: values.itemId ?? '',
          platformSkuId: values.platformSkuId ?? '',
          sellerSku: values.sellerSku,
          internalSku: values.internalSku,
          color: values.color ?? '',
          size: values.size ?? '',
          listingStatus: values.listingStatus || '待同步',
          mappingStatus: values.mappingStatus || '待确认',
        })
      }}
      saveLabel={createMutation.isPending ? '保存中…' : '创建映射'}
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="Seller SKU 映射"
        description="逐变体将店铺 Seller SKU 绑定到唯一内部 SKU。数据经 tRPC 写入 seller_sku_mappings；未映射 / 冲突 / 停用 SKU 的订单进异常队列且不占库存。"
        rows={rows}
        detailHref={(row) => `/console/mappings/${encodeURIComponent(row.id)}`}
        searchKeys={['shop', 'platform', 'site', 'sellerSku', 'internalSku', 'itemId', 'platformSkuId']}
        search={q}
        onSearchChange={setQ}
        onStatusFilterChange={setStatus}
        searchPlaceholder="搜索店铺、Seller SKU、平台 SKU ID 或内部 SKU"
        filters={[{ label: '映射状态', options: ['启用', '待确认', '异常'], key: 'mappingStatus' }]}
        addLabel="新增映射"
        onAdd={() => setOpen(true)}
        listTitle="映射列表"
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        emptyText={
          listQuery.isError
            ? `加载失败：${listQuery.error.message}`
            : listQuery.isLoading
              ? '正在从数据库加载映射…'
              : '暂无映射。点击「新增映射」写入数据库，或先跑 db:seed:commerce-listings。'
        }
        columns={[
          { key: 'shop', label: '店铺' },
          {
            key: 'platform',
            label: '平台 / 站点',
            render: (row) => `${row.platform} / ${row.site}`,
          },
          { key: 'itemId', label: 'Item ID' },
          { key: 'platformSkuId', label: '平台 SKU ID' },
          { key: 'sellerSku', label: 'Seller SKU' },
          { key: 'internalSku', label: '内部 SKU' },
          { key: 'color', label: '平台颜色' },
          { key: 'size', label: '平台尺码' },
          { key: 'listingStatus', label: '上架状态' },
          {
            key: 'mappingStatus',
            label: '映射状态',
            render: (row) => (
              <Badge variant={row.mappingStatus === '异常' ? 'destructive' : 'secondary'}>
                {row.mappingStatus}
              </Badge>
            ),
          },
        ]}
      >
        <DetailKpiRow items={kpiItems} />
        <Alert>
          <AlertTitle>映射异常阻断自动占库</AlertTitle>
          <AlertDescription>
            对齐 schema mapping_exceptions：未映射 / 冲突 / 停用 SKU 的订单行必须进异常队列，且禁止自动库存预留。开放阻断{' '}
            {exKpi?.open ?? '—'} 条。
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <LocaleLink href="/console/order-exceptions">履约异常（超时/占库/拣货/同步）</LocaleLink>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Seller SKU 映射异常请在本页 / mappings 异常 API 处理；订单履约异常已迁至 order-exceptions（规则扫描真实订单）。
        </p>
        <UedPrototypeNotice>
          四码并列：Item ID · 平台 SKU ID · Seller SKU · 内部 SKU。刊登 / 订单同步可回填映射草稿；平台写接口暂未开通。
        </UedPrototypeNotice>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
