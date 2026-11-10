'use client'

import * as React from 'react'
import { UedDialog, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { DetailKpiRow } from '@/components/console/detail'
import { ProductCoverCell } from '@/components/console/product-images'
import { Badge } from '@workspace/ui/components/badge'
import { trpc } from '@/lib/trpc/client'
import { useLocaleRouter } from '@/lib/i18n/navigation'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

const PAGE_SIZE = 20

type Cat = { id: string; name: string; parentId: string | null; status: string }

function pathOf(rows: Cat[], node: Cat): string {
  const parts = [node.name]
  let parentId = node.parentId
  const seen = new Set<string>()
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = rows.find((r) => r.id === parentId)
    if (!parent) break
    parts.unshift(parent.name)
    parentId = parent.parentId
  }
  return parts.join(' / ')
}

type DictOption = { value: string; title: string }

function activeDictOptions(
  dicts: Array<{ key: string; values: string[]; valueTitles: Record<string, string>; inactiveValues: string[] }> | undefined,
  key: string,
): DictOption[] {
  const row = dicts?.find((d) => d.key === key)
  if (!row) return []
  const inactive = new Set(row.inactiveValues)
  return row.values
    .filter((value) => !inactive.has(value))
    .map((value) => ({ value, title: row.valueTitles?.[value] ?? value }))
}

export default function MasterProductsPage() {
  const router = useLocaleRouter()
  const brandsMetaQuery = trpc.brands.meta.useQuery()
  const categoriesQuery = trpc.categories.list.useQuery({})
  const membersQuery = trpc.members.list.useQuery({})
  const dictionariesQuery = trpc.dictionaries.list.useQuery()
  const dictMap = Object.fromEntries((dictionariesQuery.data ?? []).map((d) => [d.key, d]))
  const brandRows = brandsMetaQuery.data?.brands ?? []
  const brandOptions = brandRows.map((b) => b.name)
  const brandIdByName = Object.fromEntries(brandRows.map((b) => [b.name, b.id]))
  const categoryRows = (categoriesQuery.data ?? []) as Cat[]
  const categoryOptions = categoryRows
    .filter((c) => c.status === '启用')
    .map((c) => pathOf(categoryRows, c))
  const styleOptions = activeDictOptions(dictionariesQuery.data, 'product_style')
  const materialOptions = activeDictOptions(dictionariesQuery.data, 'product_material')
  const styleTitles = dictMap.product_style?.valueTitles ?? {}
  const materialTitles = dictMap.product_material?.valueTitles ?? {}
  const members = (membersQuery.data ?? []).filter((m) => m.source === 'member' && m.status === '启用')
  const ownerOptions = members.map((member) => member.name)

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
      description="先维护主信息；多级分类 / 款式 / 材质均为下拉（款式与材质来自数据字典）。系统按 HSY + 六位流水号生成编码并写入 products 表。"
      fields={[
        { key: 'name', label: '内部商品名称', required: true },
        {
          key: 'brand',
          label: '品牌',
          options: brandOptions.length > 0 ? brandOptions : ['（请先在品牌主档新增）'],
          required: true,
          helper: brandOptions.length === 0 ? '暂无启用品牌，请先到「品牌」菜单维护' : undefined,
        },
        {
          key: 'category',
          label: '多级分类',
          options: categoryOptions.length > 0 ? categoryOptions : ['（请先维护品类树）'],
          searchable: true,
          required: true,
          helper: categoryOptions.length === 0 ? '请先到「品类」维护多级分类' : '支持按路径关键词筛选',
        },
        {
          key: 'style',
          label: '款式 / 版型',
          options: styleOptions.length > 0 ? styleOptions : ['（请先在字典维护 product_style）'],
          required: true,
          helper: styleOptions.length === 0 ? '请到「数据字典」维护 product_style' : undefined,
        },
        {
          key: 'material',
          label: '材质',
          options: materialOptions.length > 0 ? materialOptions : ['（请先在字典维护 product_material）'],
          required: true,
          helper: materialOptions.length === 0 ? '请到「数据字典」维护 product_material' : undefined,
        },
        {
          key: 'owner',
          label: '商品负责人',
          options: ownerOptions.length > 0 ? ownerOptions : ['当前用户'],
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
        const brandName = values.brand || brandOptions[0] || ''
        const brandId = brandIdByName[brandName]
        if (!brandId) {
          setNotice('请先在「品牌」主档新增并启用品牌后再创建商品')
          return
        }
        if (!categoryOptions.includes(values.category || '')) {
          setNotice('请选择有效的多级分类')
          return
        }
        if (!styleOptions.some((option) => option.value === (values.style || ''))) {
          setNotice('请选择字典中的款式/版型（product_style）')
          return
        }
        if (!materialOptions.some((option) => option.value === (values.material || ''))) {
          setNotice('请选择字典中的材质（product_material）')
          return
        }
        createMutation.mutate({
          name: values.name || '新商品',
          brandId,
          brand: brandName,
          category: values.category,
          owner: values.owner || ownerOptions[0] || '当前用户',
          material: values.material,
          style: values.style,
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
                fallback={{ cover: row.coverImage, images: row.images ?? [] }}
                alt={row.name}
              />
            ),
          },
          { key: 'spu', label: 'SPU' },
          { key: 'name', label: '商品名称' },
          { key: 'brand', label: '品牌' },
          { key: 'category', label: '品类' },
          { key: 'material', label: '材质', render: (row) => materialTitles[row.material] ?? row.material },
          { key: 'style', label: '款式 / 版型', render: (row) => styleTitles[row.style] ?? row.style },
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
            SPU / 内部 SKU 主路径走 tRPC → dataaccess → products / product_variants。款式/材质字典键：
            product_style / product_material（/console/settings/dictionaries）。
          </AlertDescription>
        </Alert>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
