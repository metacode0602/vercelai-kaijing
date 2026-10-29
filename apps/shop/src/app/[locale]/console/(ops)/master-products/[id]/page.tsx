'use client'

import * as React from 'react'
import {
  ConsoleBreadcrumbs,
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailRelatedTables,
  DetailSection,
} from '@/components/console/detail'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { UedDialog, UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { ProductImageEditor } from '@/components/console/product-images'
import { buildUedRelatedInfo } from '@/lib/console/related-info'
import {
  createVariant,
  updateProduct,
  useProducts,
  type ProductRecord,
} from '@/lib/crossborder/product-store'
import { activeDictionaryValues, useDictionaries } from '@/lib/crossborder/dictionary-store'
import { LocaleLink } from '@/lib/i18n/navigation'
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
  const products = useProducts()
  const product = products.find((item) => item.spu === id)
  const dictionaries = useDictionaries()
  const packOptions = activeDictionaryValues(dictionaries, 'product_pack')
  const colorOptions = activeDictionaryValues(dictionaries, 'product_color')
  const sizeOptions = activeDictionaryValues(dictionaries, 'product_size')

  const [headerOpen, setHeaderOpen] = React.useState(false)
  const [variantOpen, setVariantOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!product) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <DetailPageHeader
          backHref="/console/master-products"
          title={mounted ? '未找到商品 SPU' : '加载商品…'}
          description={
            mounted
              ? `SPU ${id} 不存在，或仅存在于其他浏览器会话。`
              : '正在读取本机原型会话中的商品主档…'
          }
        />
        <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          请返回列表重新选择，或新建 SPU 主信息后再添加 SKU。
        </p>
      </div>
    )
  }

  const current: ProductRecord = product
  const related = buildUedRelatedInfo('master-products', current as unknown as Record<string, unknown>)
  const relatedSections = (related?.sections ?? []).filter((section) => section.title !== 'SKU 列表')
  const enabledSkus = current.variants.filter((item) => item.status === '启用').length
  const pendingSkus = current.variants.filter((item) => item.status === '待确认').length

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <ConsoleBreadcrumbs
        items={[
          { label: '商品 SPU / SKU', href: '/console/master-products' },
          { label: current.spu },
        ]}
      />

      <DetailPageHeader
        backHref="/console/master-products"
        title={`${current.spu} · ${current.name}`}
        description={`${current.brand} · ${current.category} · 负责人 ${current.owner}`}
        badges={
          <>
            <Badge variant="outline">示例数据</Badge>
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
          对齐 schema products / product_variants：先维护款式主档，再按颜色 / 尺码 / 包装生成内部 SKU（SPU+三位流水）。平台 Seller SKU 在「映射」独立绑定。
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
        description="维护款式封面与多角度截图；封面会出现在 SPU 列表。SKU 也可单独维护规格图。"
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

      {relatedSections.length > 0 ? (
        <DetailRelatedTables sections={relatedSections} />
      ) : null}

      <UedPrototypeNotice>
        关联映射 / 刊登 / 库存由系统按内部 SKU 自动带出，便于运营决策。正式环境写入 products / product_variants 表。
      </UedPrototypeNotice>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}

      {headerOpen ? (
        <UedDialog
          title="编辑 SPU 主信息"
          description="SPU 编码只读；修改后仅作用于本次原型会话。"
          fields={[
            { key: 'spu', label: 'SPU', defaultValue: current.spu, readOnly: true },
            { key: 'name', label: '商品名称', defaultValue: current.name, required: true },
            { key: 'brand', label: '品牌', defaultValue: current.brand, required: true },
            { key: 'category', label: '品类', defaultValue: current.category, required: true },
            { key: 'material', label: '材质', defaultValue: current.material, required: true },
            { key: 'style', label: '款式 / 版型', defaultValue: current.style, required: true },
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
            updateProduct(current.spu, {
              name: values.name || current.name,
              brand: values.brand || current.brand,
              category: values.category || current.category,
              material: values.material || current.material,
              style: values.style || current.style,
              owner: values.owner || current.owner,
              status: (values.status as ProductRecord['status']) || current.status,
            })
            setHeaderOpen(false)
            setNotice('SPU 主信息已更新（原型会话）。')
          }}
          saveLabel="保存主信息"
        />
      ) : null}

      {variantOpen ? (
        <UedDialog
          title="添加内部 SKU"
          description={`归属 ${current.spu}；编号按 SPU+三位流水自动生成。`}
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
            const created = createVariant({
              spu: current.spu,
              color: values.color || '黑色',
              size: values.size || 'L',
              pack: values.pack || packOptions[0] || '单件',
              barcode: values.barcode,
              weight: Number(values.weight) || 0,
              status: (values.status as ProductRecord['status']) || '待确认',
            })
            setVariantOpen(false)
            setNotice(created ? `${created.code} 已生成（原型会话）。` : '添加失败：未找到 SPU。')
          }}
          saveLabel="生成 SKU"
        />
      ) : null}
    </div>
  )
}
