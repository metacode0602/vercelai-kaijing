'use client'

import * as React from 'react'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
} from '@/components/console/detail'
import { useConsoleBreadcrumbs } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedDialog } from '@/components/console/erp-ued-workspace'
import { ProductImageEditor } from '@/components/console/product-images'
import { trpc } from '@/lib/trpc/client'
import { LocaleLink } from '@/lib/i18n/navigation'
import type { UiProductStatus } from '@/lib/server/mappers/products'
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
import { Pencil, Plus } from 'lucide-react'

function statusVariant(status: string) {
  if (status === '启用') return 'secondary' as const
  if (status === '停用' || status === '异常') return 'destructive' as const
  return 'outline' as const
}

export default function MasterProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  useConsoleBreadcrumbs([
    { label: '商品 SPU / SKU', href: '/console/master-products' },
    { label: id },
  ])

  const dictionariesQuery = trpc.dictionaries.list.useQuery()
  const dictMap = Object.fromEntries((dictionariesQuery.data ?? []).map((d) => [d.key, d]))
  const activeVals = (key: string) => {
    const d = dictMap[key]
    if (!d) return [] as string[]
    const inactive = new Set(d.inactiveValues ?? [])
    return d.values.filter((v) => !inactive.has(v))
  }
  const packOptions = activeVals('product_pack')
  const colorOptions = activeVals('product_color')
  const sizeOptions = activeVals('product_size')

  const [headerOpen, setHeaderOpen] = React.useState(false)
  const [variantOpen, setVariantOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const utils = trpc.useUtils()
  const brandsMetaQuery = trpc.brands.meta.useQuery()
  const brandRows = brandsMetaQuery.data?.brands ?? []
  const brandOptions = brandRows.map((b) => b.name)
  const brandIdByName = Object.fromEntries(brandRows.map((b) => [b.name, b.id]))
  const categoriesQuery = trpc.categories.list.useQuery({})
  type Cat = { id: string; name: string; parentId: string | null; status: string }
  const categoryRows = (categoriesQuery.data ?? []) as Cat[]
  const categoryPathOf = (node: Cat) => {
    const parts = [node.name]
    let parentId = node.parentId
    const seen = new Set<string>()
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)
      const parent = categoryRows.find((r) => r.id === parentId)
      if (!parent) break
      parts.unshift(parent.name)
      parentId = parent.parentId
    }
    return parts.join(' / ')
  }
  const categoryOptions = categoryRows.filter((c) => c.status === '启用').map((c) => categoryPathOf(c))
  const styleOptions = activeVals('product_style')
  const materialOptions = activeVals('product_material')
  const productQuery = trpc.products.bySpu.useQuery({ spu: id })
  const updateMutation = trpc.products.update.useMutation({
    onSuccess: async () => {
      await utils.products.bySpu.invalidate({ spu: id })
      await utils.products.list.invalidate()
      await utils.products.stats.invalidate()
      setHeaderOpen(false)
      setNotice('SPU 主信息已保存到数据库。')
    },
    onError: (error) => setNotice(error.message),
  })
  const createVariantMutation = trpc.products.createVariant.useMutation({
    onSuccess: async (created) => {
      await utils.products.bySpu.invalidate({ spu: id })
      await utils.products.listSkus.invalidate()
      await utils.products.stats.invalidate()
      await utils.products.listSkuCodes.invalidate()
      setVariantOpen(false)
      setNotice(`${created.code} 已写入 product_variants。`)
    },
    onError: (error) => setNotice(error.message),
  })

  if (productQuery.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/master-products"
          title="加载商品…"
          description={`正在从数据库读取 SPU ${id}…`}
        />
      </div>
    )
  }

  if (productQuery.isError || !productQuery.data) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/master-products"
          title="未找到商品 SPU"
          description={
            productQuery.error?.message ??
            `SPU ${id} 不存在于当前组织，或尚未 migrate / seed。`
          }
        />
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          请返回列表重新选择，或新建 SPU。确认 DATABASE_URL 与 SHOP_DEV_ORGANIZATION_ID。
        </p>
      </div>
    )
  }

  const current = productQuery.data
  const enabledSkus = current.variants.filter((item) => item.status === '启用').length
  const pendingSkus = current.variants.filter((item) => item.status === '待确认').length

  return (
    <div className="flex w-full flex-col gap-4">
      <DetailPageHeader
        backHref="/console/master-products"
        title={`${current.spu} · ${current.name}`}
        description={`${current.brand} · ${current.category} · 负责人 ${current.owner}`}
        badges={
          <>
            <Badge variant="outline">数据库</Badge>
            <Badge variant={statusVariant(current.status)}>{current.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setHeaderOpen(true)}>
              <Pencil data-icon="inline-start" />
              编辑主信息
            </Button>
            <Button size="sm" onClick={() => setVariantOpen(true)}>
              <Plus data-icon="inline-start" />
              添加 SKU
            </Button>
          </div>
        }
      />

      <Alert>
        <AlertTitle>头行分离 · SPU 主信息 + SKU 规格行</AlertTitle>
        <AlertDescription>
          对齐 schema products / product_variants：主信息与规格行均经 tRPC 持久化。平台 Seller SKU 在「映射」独立绑定（本模块仍可 stub）。
        </AlertDescription>
      </Alert>

      <DetailKpiRow
        items={[
          { label: 'SKU 数', value: String(current.skuCount) },
          { label: '启用规格', value: String(enabledSkus) },
          { label: '待确认', value: String(pendingSkus) },
          { label: '材质 / 版型', value: `${current.material} / ${current.style}` },
        ]}
      />

      <DetailFieldGrid
        title="SPU 主信息"
        description="编码不可改；名称 / 品牌 / 品类 / 负责人可维护"
        fields={[
          { label: 'SPU', value: current.spu, mono: true },
          { label: '商品名称', value: current.name },
          { label: '品牌', value: current.brand },
          { label: '品类', value: current.category },
          { label: '材质', value: current.material },
          { label: '款式 / 版型', value: current.style },
          { label: '负责人', value: current.owner },
          {
            label: '状态',
            value: <Badge variant={statusVariant(current.status)}>{current.status}</Badge>,
          },
        ]}
        columns={4}
        action={
          <Button size="sm" variant="ghost" onClick={() => setHeaderOpen(true)}>
            <Pencil data-icon="inline-start" />
            编辑
          </Button>
        }
      />

      <ProductImageEditor
        imageKey={`spu:${current.spu}`}
        fallback={{ cover: current.coverImage, images: current.images ?? [] }}
        title="SPU 商品图片"
        description="图片编辑器暂仍用本机会话缓存；封面 URL 可在后续版本随 update 写入 products.images。"
      />

      <DetailSection
        title="内部 SKU 规格行"
        description="真实交付规格；编码生成后不可修改、不可复用。无条码的 SKU 不允许刊登。"
        action={
          <Button size="sm" variant="outline" onClick={() => setVariantOpen(true)}>
            <Plus data-icon="inline-start" />
            添加 SKU
          </Button>
        }
      >
        {current.variants.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            尚无规格行。请添加颜色 / 尺码 / 包装组合以生成内部 SKU。
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>内部 SKU</TableHead>
                <TableHead>颜色</TableHead>
                <TableHead>尺码</TableHead>
                <TableHead>包装</TableHead>
                <TableHead>条码</TableHead>
                <TableHead>重量 g</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {current.variants.map((variant) => (
                <TableRow key={variant.code}>
                  <TableCell className="font-mono text-xs">{variant.code}</TableCell>
                  <TableCell>{variant.color}</TableCell>
                  <TableCell>{variant.size}</TableCell>
                  <TableCell>{variant.pack}</TableCell>
                  <TableCell className="font-mono text-xs">{variant.barcode || '—'}</TableCell>
                  <TableCell className="tabular-nums">{variant.weight}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(variant.status)}>{variant.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" asChild>
                      <LocaleLink href={`/console/master-skus/${encodeURIComponent(variant.code)}`}>
                        详情
                      </LocaleLink>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DetailSection>

      {/* 关联刊登/采购等子表：待列表域接库后由 related-info 注入真实行；SKU 列表已在上方展示 */}

      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}

      {headerOpen ? (
        <UedDialog
          title="编辑 SPU 主信息"
          description="SPU 编码只读；变更写入 products 表。"
          fields={[
            { key: 'spu', label: 'SPU', defaultValue: current.spu, readOnly: true },
            { key: 'name', label: '商品名称', defaultValue: current.name, required: true },
            {
              key: 'brand',
              label: '品牌',
              options: brandOptions.length > 0
                ? Array.from(new Set([current.brand, ...brandOptions].filter(Boolean)))
                : [current.brand || '（请先维护品牌）'],
              defaultValue: current.brand,
              required: true,
              helper: brandOptions.length === 0 ? '暂无启用品牌，请先到「品牌」菜单维护' : undefined,
            },
            {
              key: 'category',
              label: '多级分类',
              options: Array.from(
                new Set(
                  [
                    current.category,
                    ...categoryOptions,
                  ].filter(Boolean),
                ),
              ),
              defaultValue: current.category,
              searchable: true,
              required: true,
            },
            {
              key: 'style',
              label: '款式 / 版型',
              options: Array.from(new Set([current.style, ...styleOptions].filter(Boolean))),
              defaultValue: current.style,
              required: true,
              helper: styleOptions.length === 0 ? '请到「数据字典」维护 product_style' : undefined,
            },
            {
              key: 'material',
              label: '材质',
              options: Array.from(new Set([current.material, ...materialOptions].filter(Boolean))),
              defaultValue: current.material,
              required: true,
              helper: materialOptions.length === 0 ? '请到「数据字典」维护 product_material' : undefined,
            },
            { key: 'owner', label: '负责人', defaultValue: current.owner, required: true },
            {
              key: 'status',
              label: '状态',
              options: ['待确认', '启用', '停用'],
              defaultValue: current.status,
              required: true,
            },
          ]}
          onClose={() => setHeaderOpen(false)}
          onSave={(values) => {
            const brandName = values.brand || current.brand
            const brandId = brandIdByName[brandName] || (current as { brandId?: string }).brandId
            if (!brandId) {
              setNotice('请选择已启用的品牌（或先到「品牌」主档新增）')
              return
            }
            updateMutation.mutate({
              spu: current.spu,
              name: values.name || current.name,
              brandId,
              brand: brandName,
              category: values.category || current.category,
              material: values.material || current.material,
              style: values.style || current.style,
              owner: values.owner || current.owner,
              status: (values.status as UiProductStatus) || current.status,
            })
          }}
          saveLabel={updateMutation.isPending ? '保存中…' : '保存主信息'}
        />
      ) : null}

      {variantOpen ? (
        <UedDialog
          title="添加内部 SKU"
          description={`归属 ${current.spu}；编号按 SPU+三位流水自动生成并写入 product_variants。`}
          fields={[
            {
              key: 'color',
              label: '颜色',
              options: colorOptions.length ? colorOptions : ['黑色', '白色', '深灰色', '蓝色', '红色'],
              required: true,
            },
            {
              key: 'size',
              label: '尺码',
              options: sizeOptions.length ? sizeOptions : ['M', 'L', 'XL', '2XL', '3XL', '标准'],
              required: true,
            },
            {
              key: 'pack',
              label: '包装规格',
              options: packOptions.length ? packOptions : ['单件'],
              required: true,
            },
            { key: 'barcode', label: '条码（EAN/UPC）', placeholder: '选填，刊登前必补' },
            { key: 'weight', label: '重量（g）', type: 'number', required: true },
            {
              key: 'status',
              label: '状态',
              options: ['待确认', '启用', '停用'],
              defaultValue: '待确认',
              required: true,
            },
          ]}
          onClose={() => setVariantOpen(false)}
          onSave={(values) => {
            createVariantMutation.mutate({
              spu: current.spu,
              color: values.color || '黑色',
              size: values.size || 'L',
              pack: values.pack || packOptions[0] || '单件',
              barcode: values.barcode,
              weight: Number(values.weight) || 0,
              status: (values.status as UiProductStatus) || '待确认',
            })
          }}
          saveLabel={createVariantMutation.isPending ? '生成中…' : '生成 SKU'}
        />
      ) : null}
    </div>
  )
}
