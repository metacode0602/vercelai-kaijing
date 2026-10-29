'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ERP_DEMO_PRODUCTS } from '@/lib/crossborder/erp-ued-data'
import { activeDictionaryValues, useDictionaries } from '@/lib/crossborder/dictionary-store'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type SkuRow = {
  id: string
  sku: string
  spu: string
  name: string
  color: string
  size: string
  pack: string
  barcode: string
  weight: number
  status: string
}

export const DEMO_SKUS: SkuRow[] = ERP_DEMO_PRODUCTS.flatMap((product) =>
  product.variants.map((variant) => ({
    id: variant.code,
    sku: variant.code,
    spu: product.spu,
    name: product.name,
    color: variant.color,
    size: variant.size,
    pack: variant.pack,
    barcode: variant.barcode || '待补充',
    weight: variant.weight,
    status: variant.status,
  })),
)

export default function MasterSkusPage() {
  const [rows, setRows] = React.useState<SkuRow[]>(DEMO_SKUS)
  const dictionaries = useDictionaries()
  const packOptions = activeDictionaryValues(dictionaries, 'product_pack')
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? (
    <UedDialog
      title="生成内部 SKU"
      description="选择所属 SPU 与规格组合，编号由系统按 SPU+三位流水生成，保存为本次原型会话。"
      fields={[
        { key: 'spu', label: '所属 SPU', options: ERP_DEMO_PRODUCTS.map((product) => `${product.spu} · ${product.name}`), required: true },
        { key: 'color', label: '颜色', options: ['黑色', '白色', '深灰色', '蓝色', '红色'], required: true },
        { key: 'size', label: '尺码', options: ['M', 'L', 'XL', '2XL', '3XL', '标准'], required: true },
        { key: 'pack', label: '包装规格', options: packOptions.length ? packOptions : ['单件'], required: true },
        { key: 'barcode', label: '条码（EAN/UPC）', placeholder: '选填，后续可补录' },
        { key: 'weight', label: '重量（g）', type: 'number', required: true },
        { key: 'status', label: '状态', options: ['待确认', '启用', '停用'], required: true },
        { key: 'remark', label: '规格备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const product = ERP_DEMO_PRODUCTS.find((item) => `${item.spu} · ${item.name}` === values.spu) ?? ERP_DEMO_PRODUCTS[0]
        const spu = product?.spu ?? 'HSY000001'
        const nextNo = rows.filter((row) => row.spu === spu).length + 1
        const sku = `${spu}${String(nextNo).padStart(3, '0')}`
        setRows((current) => [
          ...current,
          {
            id: sku,
            sku,
            spu,
            name: product?.name ?? '—',
            color: values.color || '黑色',
            size: values.size || 'L',
            pack: values.pack || packOptions[0] || '单件',
            barcode: values.barcode || '待补充',
            weight: Number(values.weight) || 220,
            status: values.status || '待确认',
          },
        ])
        setOpen(false)
        setNotice(`${sku} 已生成（原型会话）；实际编号规则由后端校验去重与流水号。`)
      }}
    />
  ) : null
  return (
    <>
      {editor}
      <UedWorkspace
        title="内部 SKU"
        description="维护真实交付规格（颜色/尺码/包装/条码/重量）；编码生成后不可修改、不可复用。"
        rows={rows} detailHref={(row) => `/console/master-skus/${encodeURIComponent(row.id)}`}
        searchKeys={['sku', 'spu', 'name', 'color', 'size', 'barcode', 'status']}
        searchPlaceholder="搜索 SKU、SPU、颜色或条码"
        filters={[{ label: '状态', options: ['启用', '待确认', '停用'] }]}
        addLabel="生成内部 SKU"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'sku', label: '内部 SKU' },
          { key: 'spu', label: '所属 SPU' },
          { key: 'name', label: '商品名称' },
          { key: 'color', label: '颜色' },
          { key: 'size', label: '尺码' },
          { key: 'pack', label: '包装' },
          { key: 'barcode', label: '条码' },
          { key: 'weight', label: '重量 g', render: (row) => String(row.weight) },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '启用' ? 'secondary' : 'outline'}>{row.status}</Badge> },
        ]}
      >
        <UedPrototypeNotice>
          SKU 与 SPU 编号不可编辑、不可复用；停用保留历史。颜色与尺码从属性字典标准值选择，服装尺码不允许自造值。条码缺失的 SKU 不允许刊登。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows.filter((row) => row.status === '待确认').map((row) => (
            <Button key={row.sku} variant="outline" size="sm" onClick={() => setNotice(`${row.sku}：补全条码并确认后才可被刊登与采购引用。`)}>待确认 · {row.sku}</Button>
          ))}
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
