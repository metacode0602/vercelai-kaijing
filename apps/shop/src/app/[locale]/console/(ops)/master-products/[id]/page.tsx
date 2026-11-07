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
import { parseUedMultiValue, UedDialog } from '@/components/console/erp-ued-workspace'
import {
  buildCreateInternalSkuFields,
  parseCreateInternalSkuValues,
} from '@/components/console/create-internal-sku-fields'
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
import { Layers, Pencil, Plus, Power } from 'lucide-react'

function statusVariant(status: string) {
  if (status === '启用') return 'secondary' as const
  if (status === '停用' || status === '异常') return 'destructive' as const
  return 'outline' as const
}

type VariantRow = {
  id: string
  code: string
  color: string
  size: string
  pack: string
  barcode: string
  weight: number
  status: UiProductStatus
}

export default function MasterProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  useConsoleBreadcrumbs([
    { label: '商品 SPU / SKU', href: '/console/master-products' },
    { label: id },
  ])

  const dictionariesQuery = trpc.dictionaries.list.useQuery()
  const dictMap = Object.fromEntries((dictionariesQuery.data ?? []).map((d) => [d.key, d]))
  const activeOptions = (key: string) => {
    const d = dictMap[key]
    if (!d) return []
    const inactive = new Set(d.inactiveValues ?? [])
    return d.values
      .filter((value) => !inactive.has(value))
      .map((value) => ({ value, title: d.valueTitles?.[value] ?? value }))
  }
  const withCurrent = (currentValue: string, options: Array<{ value: string; title: string }>) => {
    if (!currentValue || options.some((option) => option.value === currentValue)) return options
    return [{ value: currentValue, title: currentValue }, ...options]
  }
  const packOptions = activeOptions('product_pack')
  const colorOptions = activeOptions('product_color')
  const sizeOptions = activeOptions('product_size')

  const [headerOpen, setHeaderOpen] = React.useState(false)
  const [variantOpen, setVariantOpen] = React.useState(false)
  const [batchOpen, setBatchOpen] = React.useState(false)
  const [editVariant, setEditVariant] = React.useState<VariantRow | null>(null)
  const [statusTarget, setStatusTarget] = React.useState<VariantRow | null>(null)
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
  const styleOptions = activeOptions('product_style')
  const materialOptions = activeOptions('product_material')
  const styleTitles = dictMap.product_style?.valueTitles ?? {}
  const materialTitles = dictMap.product_material?.valueTitles ?? {}
  const packTitles = dictMap.product_pack?.valueTitles ?? {}
  const colorTitles = dictMap.product_color?.valueTitles ?? {}
  const sizeTitles = dictMap.product_size?.valueTitles ?? {}
  const productQuery = trpc.products.bySpu.useQuery({ spu: id })

  const invalidateProduct = async () => {
    await utils.products.bySpu.invalidate({ spu: id })
    await utils.products.list.invalidate()
    await utils.products.listSkus.invalidate()
    await utils.products.stats.invalidate()
    await utils.products.listSkuCodes.invalidate()
  }

  const updateMutation = trpc.products.update.useMutation({
    onSuccess: async () => {
      await invalidateProduct()
      setHeaderOpen(false)
      setNotice('SPU 主信息已保存到数据库。')
    },
    onError: (error) => setNotice(error.message),
  })
  const createVariantMutation = trpc.products.createVariant.useMutation({
    onSuccess: async (created) => {
      await invalidateProduct()
      setVariantOpen(false)
      setNotice(`${created.code} 已写入 product_variants。`)
    },
    onError: (error) => setNotice(error.message),
  })
  const batchCreateMutation = trpc.products.batchCreateVariants.useMutation({
    onSuccess: async (result) => {
      await invalidateProduct()
      setBatchOpen(false)
      setNotice(
        `批量生成完成：新建 ${result.createdCount} 个，跳过已存在 ${result.skippedCount} 个（共请求 ${result.totalRequested} 个组合）。`,
      )
    },
    onError: (error) => setNotice(error.message),
  })
  const updateVariantMutation = trpc.products.updateVariant.useMutation({
    onSuccess: async (updated) => {
      await invalidateProduct()
      setEditVariant(null)
      setStatusTarget(null)
      setNotice(`${updated.code} 已更新。`)
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
  const colorChoices = colorOptions.length ? colorOptions : ['黑色', '白色', '深灰色', '蓝色', '红色']
  const sizeChoices = sizeOptions.length ? sizeOptions : ['M', 'L', 'XL', '2XL', '3XL', '标准']
  const packChoices = packOptions.length ? packOptions : ['单件']

  const confirmStatusLabel = statusTarget?.status === '停用' ? '启用' : '禁用'
  const nextStatus: UiProductStatus | null = statusTarget
    ? statusTarget.status === '停用'
      ? '启用'
      : '停用'
    : null

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
            <Button size="sm" variant="outline" onClick={() => setBatchOpen(true)}>
              <Layers data-icon="inline-start" />
              批量生成
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
          对齐 schema products / product_variants：主信息与规格行均经 tRPC 持久化。颜色+尺码+包装组合唯一；批量生成时已存在组合将自动跳过。
        </AlertDescription>
      </Alert>

      <DetailKpiRow
        items={[
          { label: 'SKU 数', value: String(current.skuCount) },
          { label: '启用规格', value: String(enabledSkus) },
          { label: '待确认', value: String(pendingSkus) },
          { label: '材质 / 版型', value: `${materialTitles[current.material] ?? current.material} / ${styleTitles[current.style] ?? current.style}` },
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
          { label: '材质', value: materialTitles[current.material] ?? current.material },
          { label: '款式 / 版型', value: styleTitles[current.style] ?? current.style },
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
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setBatchOpen(true)}>
              <Layers data-icon="inline-start" />
              批量生成
            </Button>
            <Button size="sm" variant="outline" onClick={() => setVariantOpen(true)}>
              <Plus data-icon="inline-start" />
              添加 SKU
            </Button>
          </div>
        }
      >
        {current.variants.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            尚无规格行。请添加或批量生成颜色 / 尺码 / 包装组合以生成内部 SKU。
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
                  <TableCell>{colorTitles[variant.color] ?? variant.color}</TableCell>
                  <TableCell>{sizeTitles[variant.size] ?? variant.size}</TableCell>
                  <TableCell>{packTitles[variant.pack] ?? variant.pack}</TableCell>
                  <TableCell className="font-mono text-xs">{variant.barcode || '—'}</TableCell>
                  <TableCell className="tabular-nums">{variant.weight}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(variant.status)}>{variant.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="ghost" asChild>
                        <LocaleLink href={`/console/master-skus/${encodeURIComponent(variant.code)}`}>
                          详情
                        </LocaleLink>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setEditVariant({
                            id: variant.id,
                            code: variant.code,
                            color: variant.color,
                            size: variant.size,
                            pack: variant.pack,
                            barcode: variant.barcode,
                            weight: variant.weight,
                            status: variant.status,
                          })
                        }
                      >
                        修改
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setStatusTarget({
                            id: variant.id,
                            code: variant.code,
                            color: variant.color,
                            size: variant.size,
                            pack: variant.pack,
                            barcode: variant.barcode,
                            weight: variant.weight,
                            status: variant.status,
                          })
                        }
                      >
                        <Power data-icon="inline-start" />
                        {variant.status === '停用' ? '启用' : '禁用'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DetailSection>

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
              options: withCurrent(current.style, styleOptions),
              defaultValue: current.style,
              required: true,
              helper: styleOptions.length === 0 ? '请到「数据字典」维护 product_style' : undefined,
            },
            {
              key: 'material',
              label: '材质',
              options: withCurrent(current.material, materialOptions),
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
          fields={buildCreateInternalSkuFields({
            colorOptions: colorChoices,
            sizeOptions: sizeChoices,
            packOptions: packChoices,
            spu: { mode: 'fixed', value: `${current.spu} · ${current.name}` },
          })}
          onClose={() => setVariantOpen(false)}
          onSave={(values) => {
            const parsed = parseCreateInternalSkuValues(values, {
              defaultPack:
                (typeof packChoices[0] === 'string' ? packChoices[0] : packChoices[0]?.value) || '单件',
            })
            createVariantMutation.mutate({
              spu: current.spu,
              ...parsed,
            })
          }}
          saveLabel={createVariantMutation.isPending ? '生成中…' : '生成 SKU'}
        />
      ) : null}

      {batchOpen ? (
        <UedDialog
          title="批量生成 SKU"
          description={`归属 ${current.spu}；将按所选颜色 × 尺码 × 包装生成笛卡尔积。已存在的组合会自动跳过，编号仍按 SPU+三位流水。`}
          fields={[
            {
              key: 'colors',
              label: '颜色（可多选）',
              options: colorChoices,
              multiple: true,
              searchable: true,
              required: true,
              fullWidth: true,
              helper: colorOptions.length === 0 ? '字典 product_color 为空时使用内置备选' : undefined,
            },
            {
              key: 'sizes',
              label: '尺码（可多选）',
              options: sizeChoices,
              multiple: true,
              searchable: true,
              required: true,
              fullWidth: true,
              helper: sizeOptions.length === 0 ? '字典 product_size 为空时使用内置备选' : undefined,
            },
            {
              key: 'packs',
              label: '包装规格（可多选）',
              options: packChoices,
              multiple: true,
              searchable: true,
              required: true,
              fullWidth: true,
              helper: packOptions.length === 0 ? '字典 product_pack 为空时使用内置备选' : undefined,
            },
            {
              key: 'weight',
              label: '默认重量（g）',
              type: 'number',
              defaultValue: '0',
              helper: '批量生成时统一写入；可在列表中再逐条修改',
            },
            {
              key: 'status',
              label: '初始状态',
              options: ['待确认', '启用', '停用'],
              defaultValue: '待确认',
              required: true,
            },
          ]}
          onClose={() => setBatchOpen(false)}
          onSave={(values) => {
            const colors = parseUedMultiValue(values.colors)
            const sizes = parseUedMultiValue(values.sizes)
            const packs = parseUedMultiValue(values.packs)
            if (!colors.length || !sizes.length || !packs.length) {
              setNotice('请至少选择一个颜色、尺码和包装规格')
              return
            }
            batchCreateMutation.mutate({
              spu: current.spu,
              colors,
              sizes,
              packs,
              weight: Number(values.weight) || 0,
              status: (values.status as UiProductStatus) || '待确认',
            })
          }}
          saveLabel={
            batchCreateMutation.isPending
              ? '生成中…'
              : '批量生成'
          }
        />
      ) : null}

      {editVariant ? (
        <UedDialog
          title={`修改 SKU ${editVariant.code}`}
          description="SKU 编码不可改；颜色/尺码/包装若与其它规格冲突将拒绝保存。"
          fields={[
            { key: 'code', label: '内部 SKU', defaultValue: editVariant.code, readOnly: true },
            {
              key: 'color',
              label: '颜色',
              options: Array.from(new Set([editVariant.color, ...colorChoices].filter(Boolean))),
              defaultValue: editVariant.color,
              required: true,
            },
            {
              key: 'size',
              label: '尺码',
              options: Array.from(new Set([editVariant.size, ...sizeChoices].filter(Boolean))),
              defaultValue: editVariant.size,
              required: true,
            },
            {
              key: 'pack',
              label: '包装规格',
              options: Array.from(new Set([editVariant.pack, ...packChoices].filter(Boolean))),
              defaultValue: editVariant.pack,
              required: true,
            },
            {
              key: 'barcode',
              label: '条码（EAN/UPC）',
              defaultValue: editVariant.barcode,
              placeholder: '选填，刊登前必补',
            },
            {
              key: 'weight',
              label: '重量（g）',
              type: 'number',
              defaultValue: String(editVariant.weight ?? 0),
              required: true,
            },
            {
              key: 'status',
              label: '状态',
              options: ['待确认', '启用', '停用'],
              defaultValue: editVariant.status,
              required: true,
            },
          ]}
          onClose={() => setEditVariant(null)}
          onSave={(values) => {
            updateVariantMutation.mutate({
              spu: current.spu,
              code: editVariant.code,
              color: values.color || editVariant.color,
              size: values.size || editVariant.size,
              pack: values.pack || editVariant.pack,
              barcode: values.barcode,
              weight: Number(values.weight) || 0,
              status: (values.status as UiProductStatus) || editVariant.status,
            })
          }}
          saveLabel={updateVariantMutation.isPending ? '保存中…' : '保存修改'}
        />
      ) : null}

      {statusTarget && nextStatus ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setStatusTarget(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setStatusTarget(null)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border bg-background p-5 shadow-lg"
          >
            <h2 className="font-semibold">
              {confirmStatusLabel === '禁用'
                ? `确认禁用该 SKU？`
                : `确认启用该 SKU？`}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {statusTarget.code} · {statusTarget.color} / {statusTarget.size} / {statusTarget.pack}
              。这是软状态变更（写入 product_variants.status），不会物理删除。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStatusTarget(null)}>
                取消
              </Button>
              <Button
                variant={confirmStatusLabel === '禁用' ? 'destructive' : 'default'}
                disabled={updateVariantMutation.isPending}
                onClick={() =>
                  updateVariantMutation.mutate({
                    spu: current.spu,
                    code: statusTarget.code,
                    status: nextStatus,
                  })
                }
              >
                {updateVariantMutation.isPending
                  ? '处理中…'
                  : confirmStatusLabel === '禁用'
                    ? '确认禁用'
                    : '确认启用'}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
