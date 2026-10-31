'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { DetailKpiRow } from '@/components/console/detail'
import { ProductCoverCell } from '@/components/console/product-images'
import {
  createVariant,
  listSkuRows,
  useProducts,
} from '@/lib/crossborder/product-store'
import { activeDictionaryValues, useDictionaries } from '@/lib/crossborder/dictionary-store'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function MasterSkusPage() {
  const products = useProducts()
  const rows = React.useMemo(() => listSkuRows(products), [products])
  const dictionaries = useDictionaries()
  const packOptions = activeDictionaryValues(dictionaries, 'product_pack')
  const colorOptions = activeDictionaryValues(dictionaries, 'product_color')
  const sizeOptions = activeDictionaryValues(dictionaries, 'product_size')
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const kpiItems = React.useMemo(() => {
    const enabled = rows.filter((item) => item.status === '启用').length
    const pending = rows.filter((item) => item.status === '待确认').length
    const disabled = rows.filter((item) => item.status === '停用').length
    const hasBarcode = (item: { barcode?: string }) =>
      Boolean(item.barcode) && item.barcode !== '待补充'
    const missingBarcode = rows.filter((item) => !hasBarcode(item)).length
    const listable = rows.filter((item) => item.status === '启用' && hasBarcode(item)).length
    const spuCount = new Set(rows.map((item) => item.spu)).size
    const totalWeight = rows.reduce((sum, item) => sum + (Number(item.weight) || 0), 0)
    return [
      { label: 'SKU 数', value: String(rows.length), hint: '当前原型会话' },
      { label: '启用', value: String(enabled) },
      { label: '待确认', value: String(pending) },
      { label: '停用', value: String(disabled) },
      { label: '可刊登', value: String(listable), hint: '启用且条码齐全' },
      { label: '缺条码', value: String(missingBarcode), hint: '缺条码不可刊登' },
      { label: '覆盖 SPU', value: String(spuCount) },
      { label: '总重量', value: `${(totalWeight / 1000).toFixed(1)} kg` },
    ]
  }, [rows])

  const filters = React.useMemo(() => {
    const unique = (values: string[]) => [...new Set(values)]
    return [
      { label: '状态', key: 'status', options: ['启用', '待确认', '停用'] },
      { label: '所属 SPU', key: 'spu', options: unique(rows.map((row) => row.spu)) },
      { label: '颜色', key: 'color', options: unique(rows.map((row) => row.color)) },
      { label: '尺码', key: 'size', options: unique(rows.map((row) => row.size)) },
    ]
  }, [rows])

  const editor = open ? (
    <UedDialog
      title="生成内部 SKU"
      description="选择所属 SPU 与规格组合，编号由系统按 SPU+三位流水生成；创建后可在详情页补充图片与关联信息。"
      fields={[
        {
          key: 'spu',
          label: '所属 SPU',
          options: products.map((product) => `${product.spu} · ${product.name}`),
          required: true,
        },
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
        { key: 'barcode', label: '条码（EAN/UPC）', placeholder: '选填，后续可补录' },
        { key: 'weight', label: '重量（g）', type: 'number', required: true },
        { key: 'lengthMm', label: '长（mm）', type: 'number', helper: '外箱/件尺寸，对齐 length_mm' },
        { key: 'widthMm', label: '宽（mm）', type: 'number' },
        { key: 'heightMm', label: '高（mm）', type: 'number' },
        { key: 'status', label: '状态', options: ['待确认', '启用', '停用'], required: true },
        { key: 'remark', label: '规格备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const product =
          products.find((item) => `${item.spu} · ${item.name}` === values.spu) ?? products[0]
        if (!product) {
          setOpen(false)
          setNotice('请先创建 SPU 再生成 SKU。')
          return
        }
        const created = createVariant({
          spu: product.spu,
          color: values.color || '黑色',
          size: values.size || 'L',
          pack: values.pack || packOptions[0] || '单件',
          barcode: values.barcode,
          weight: Number(values.weight) || 220,
          lengthMm: Number(values.lengthMm) || 0,
          widthMm: Number(values.widthMm) || 0,
          heightMm: Number(values.heightMm) || 0,
          status: (values.status as '待确认' | '启用' | '停用') || '待确认',
        })
        if (created) {
          setNotice(`${created.code} 已生成（原型会话）；实际编号规则由后端校验去重与流水号。`)
        }
        setOpen(false)
      }}
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="内部 SKU"
        description="维护真实交付规格（颜色/尺码/包装/条码/重量/长宽高 mm）；编码生成后不可修改、不可复用。"
        rows={rows}
        detailHref={(row) => `/console/master-skus/${encodeURIComponent(row.id)}`}
        searchKeys={['sku', 'spu', 'name', 'color', 'size', 'barcode', 'status']}
        searchPlaceholder="搜索 SKU、SPU、颜色或条码"
        filters={filters}
        addLabel="生成内部 SKU"
        onAdd={() => setOpen(true)}
        columns={[
          {
            key: 'cover',
            label: '封面',
            render: (row) => (
              <ProductCoverCell
                imageKey={`sku:${row.sku}`}
                fallback={{ cover: row.coverImage, images: row.images ?? [] }}
                alt={row.name}
              />
            ),
          },
          { key: 'sku', label: '内部 SKU' },
          { key: 'spu', label: '所属 SPU' },
          { key: 'name', label: '商品名称' },
          { key: 'color', label: '颜色' },
          { key: 'size', label: '尺码' },
          { key: 'pack', label: '包装' },
          { key: 'barcode', label: '条码' },
          { key: 'weight', label: '重量 g', render: (row) => String(row.weight) },
          {
            key: 'dims',
            label: '尺寸 mm',
            render: (row) => `${row.lengthMm || 0}×${row.widthMm || 0}×${row.heightMm || 0}`,
          },
          {
            key: 'status',
            label: '状态',
            render: (row) => (
              <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge>
            ),
          },
        ]}
      >
        <DetailKpiRow items={kpiItems} />
        <UedPrototypeNotice>
          SKU 与 SPU 编号不可编辑、不可复用；停用保留历史。颜色与尺码从属性字典标准值选择，服装尺码不允许自造值。条码缺失的 SKU 不允许刊登。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows
            .filter((row) => row.status === '待确认')
            .map((row) => (
              <Button
                key={row.sku}
                variant="outline"
                size="sm"
                onClick={() =>
                  setNotice(`${row.sku}：补全条码并确认后才可被刊登与采购引用。`)
                }
              >
                待确认 · {row.sku}
              </Button>
            ))}
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
