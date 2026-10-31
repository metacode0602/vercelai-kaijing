'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { DetailKpiRow } from '@/components/console/detail'
import { ProductCoverCell } from '@/components/console/product-images'
import { createProduct, useProducts } from '@/lib/crossborder/product-store'
import { Badge } from '@workspace/ui/components/badge'
import { activeDictionaryValues, useDictionaries } from '@/lib/crossborder/dictionary-store'
import { activeCategoryPaths, useCategories } from '@/lib/crossborder/category-store'
import { useMembers } from '@/lib/crossborder/member-store'
import { useLocaleRouter } from '@/lib/i18n/navigation'

const PAGE_SIZE = 5

export default function MasterProductsPage() {
  const products = useProducts()
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

  const kpiItems = React.useMemo(() => {
    const enabled = products.filter((item) => item.status === '启用').length
    const pending = products.filter((item) => item.status === '待确认').length
    const skuTotal = products.reduce((sum, item) => sum + item.skuCount, 0)
    return [
      { label: 'SPU 数', value: String(products.length), hint: '当前原型会话' },
      { label: '启用', value: String(enabled) },
      { label: '待确认', value: String(pending) },
      { label: 'SKU 合计', value: String(skuTotal) },
    ]
  }, [products])

  const editor = open ? (
    <UedDialog
      title="新建商品 SPU"
      description="先维护主信息；系统按 HSY + 六位流水号生成编码。创建后进入详情添加 SKU 规格行并上传图片。"
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
        const created = createProduct({
          name: values.name || '新商品',
          brand: values.brand || brandOptions[0] || 'HELLO COSMOS',
          category: values.category || categoryOptions[0] || '待分类',
          owner: values.owner || ownerOptions[0] || '当前用户',
          material: values.material || '待补充',
          style: values.style || '待补充',
          status: '待确认',
        })
        setOpen(false)
        setNotice(`${created.spu} 已创建；请在详情页添加 SKU 规格并上传封面图。`)
        router.push(`/console/master-products/${encodeURIComponent(created.spu)}`)
      }}
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="商品 SPU / SKU"
        description="公司统一款式主档下维护真实交付规格；平台 Seller SKU 独立映射。先建 SPU，再在详情加 SKU 行。"
        rows={products}
        detailHref={(row) => `/console/master-products/${encodeURIComponent(row.spu)}`}
        searchKeys={['spu', 'name', 'brand', 'category', 'owner', 'status']}
        filters={[{ label: '状态', options: ['启用', '待确认', '停用'] }]}
        addLabel="新建 SPU"
        onAdd={() => setOpen(true)}
        listTitle="商品 SPU 列表"
        pagination={{ page, pageSize: PAGE_SIZE, onPageChange: setPage }}
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
        <UedPrototypeNotice>
          SPU 编码生成后不可修改、不可复用。详情页维护 SKU 规格行、图片与关联映射 / 刊登；停用保留历史单据引用。
        </UedPrototypeNotice>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
