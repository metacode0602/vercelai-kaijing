'use client'

import * as React from 'react'
import { UedDialog, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { DetailKpiRow } from '@/components/console/detail'
import { ProductCoverCell } from '@/components/console/product-images'
import { Badge } from '@workspace/ui/components/badge'
import { activeDictionaryValues, useDictionaries } from '@/lib/crossborder/dictionary-store'
import { activeCategoryPaths, useCategories } from '@/lib/crossborder/category-store'
import { useMembers } from '@/lib/crossborder/member-store'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

const PAGE_SIZE = 20

export default function MasterProductsPage() {
  const router = useLocaleRouter()
  const dictionaryState = useDictionaries()
  const categories = useCategories()
  const members = useMembers()
  const brandOptions = activeDictionaryValues(dictionaryState, 'product_brand')
  const categoryOptions = activeCategoryPaths(categories)
  const ownerOptions = members.filter((member) => member.status === '启用').map((member) => member.name)

  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('全部')

  const utils = trpc.useUtils()
  const listQuery = trpc.products.list.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status === '全部' ? undefined : status,
  })
  const statsQuery = trpc.products.stats.useQuery()
  const createMutation = trpc.products.create.useMutation({
    onSuccess: async (created) => {
      await utils.products.list.invalidate()
      await utils.products.stats.invalidate()
      setOpen(false)
      setNotice(`${created.spu} 已写入数据库；请在详情页添加 SKU 规格。`)
      router.push(`/console/master-products/${encodeURIComponent(created.spu)}`)
    },
    onError: (error) => setNotice(error.message),
  })

  const products = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const stats = statsQuery.data

  const kpiItems = React.useMemo(
    () => [
      { label: 'SPU 数', value: String(stats?.spuTotal ?? '—'), hint: '数据库' },
      { label: '启用', value: String(stats?.enabled ?? '—') },
      { label: '待确认', value: String(stats?.pending ?? '—') },
      { label: 'SKU 合计', value: String(stats?.skuTotal ?? '—') },
    ],
    [stats],
  )

  const editor = open ? (
    <UedDialog
      title="新建商品 SPU"
      description="先维护主信息；系统按 HSY + 六位流水号生成编码并写入 products 表。保存后进入详情添加 SKU。"
      fields={[
        { key: 'name', label: '内部商品名称', required: true },
        {
          key: 'brand',
          label: '品牌',
          options: brandOptions.length > 0 ? brandOptions : ['HELLO COSMOS', 'LinkForge', '其他'],
          required: true,
        },
        {
          key: 'category',
          label: '多级品类',
          options: categoryOptions.length > 0 ? categoryOptions : ['服装 / 上衣 / T恤', '数码 / 电脑配件', '家居'],
          required: true,
        },
        { key: 'material', label: '材质', required: true },
        { key: 'style', label: '款式 / 版型', required: true },
        {
          key: 'owner',
          label: '商品负责人',
          options: ownerOptions.length > 0 ? ownerOptions : ['杨洁'],
          required: true,
        },
        { key: 'launchDate', label: '计划上市日期', type: 'date' },
        {
          key: 'description',
          label: '商品描述',
          type: 'textarea',
          fullWidth: true,
          placeholder: '卖点、适用场景与包装说明',
        },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        createMutation.mutate({
          name: values.name || '新商品',
          brand: values.brand || brandOptions[0] || 'HELLO COSMOS',
          category: values.category || categoryOptions[0] || '待分类',
          owner: values.owner || ownerOptions[0] || '当前用户',
          material: values.material || '待补充',
          style: values.style || '待补充',
          status: '待确认',
        })
      }}
      saveLabel={createMutation.isPending ? '保存中…' : '创建 SPU'}
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="商品 SPU / SKU"
        description="公司统一款式主档（products）；内部 SKU 在详情维护。数据经 tRPC 写入 PostgreSQL。"
        rows={products}
        detailHref={(row) => `/console/master-products/${encodeURIComponent(row.spu)}`}
        searchKeys={['spu', 'name', 'brand', 'category', 'owner', 'status']}
        search={q}
        onSearchChange={setQ}
        onStatusFilterChange={setStatus}
        filters={[{ label: '状态', key: 'status', options: ['启用', '待确认', '停用'] }]}
        addLabel="新建 SPU"
        onAdd={() => setOpen(true)}
        listTitle="商品 SPU 列表"
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        emptyText={
          listQuery.isError
            ? `加载失败：${listQuery.error.message}`
            : listQuery.isLoading
              ? '正在从数据库加载 SPU…'
              : '暂无 SPU。点击「新建 SPU」写入数据库。'
        }
        columns={[
          {
            key: 'cover',
            label: '封面',
            render: (row) => (
              <ProductCoverCell
                imageKey={`spu:${row.spu}`}
                fallback={{ cover: row.coverImage, images: row.images ?? [] }}
                alt={row.name}
              />
            ),
          },
          { key: 'spu', label: 'SPU' },
          { key: 'name', label: '商品名称' },
          { key: 'brand', label: '品牌' },
          { key: 'category', label: '品类' },
          { key: 'material', label: '材质' },
          { key: 'style', label: '款式 / 版型' },
          { key: 'owner', label: '负责人' },
          { key: 'skuCount', label: 'SKU 数' },
          {
            key: 'status',
            label: '状态',
            render: (row) => <Badge variant="secondary">{row.status}</Badge>,
          },
        ]}
      >
        <DetailKpiRow items={kpiItems} />
        <Alert>
          <AlertTitle>已接库 · 模块 1</AlertTitle>
          <AlertDescription>
            SPU / 内部 SKU 主路径走 tRPC → dataaccess → products / product_variants。Seller SKU
            映射与其它域仍可为 stub。需配置 DATABASE_URL 并执行 migrate / seed。
          </AlertDescription>
        </Alert>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
