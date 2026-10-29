'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ERP_DEMO_PRODUCTS, type DemoProduct } from '@/lib/crossborder/erp-ued-data'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { NativeSelect, NativeSelectOption } from '@workspace/ui/components/native-select'
import { LocaleLink } from '@/lib/i18n/navigation'
import { activeDictionaryValues, useDictionaries } from '@/lib/crossborder/dictionary-store'
import { activeCategoryPaths, useCategories } from '@/lib/crossborder/category-store'
import { useMembers } from '@/lib/crossborder/member-store'

export default function MasterProductsPage() {
  const [products, setProducts] = React.useState<DemoProduct[]>(ERP_DEMO_PRODUCTS)
  const dictionaryState = useDictionaries()
  const categories = useCategories()
  const members = useMembers()
  const brandOptions = activeDictionaryValues(dictionaryState, 'product_brand')
  const packOptions = activeDictionaryValues(dictionaryState, 'product_pack')
  const categoryOptions = activeCategoryPaths(categories)
  const ownerOptions = members.filter((member) => member.status === '启用').map((member) => member.name)
  const [open, setOpen] = React.useState(false)
  const [variantsOpen, setVariantsOpen] = React.useState(false)
  const [variantColor, setVariantColor] = React.useState('黑色')
  const [variantSize, setVariantSize] = React.useState('L')
  const [variantPack, setVariantPack] = React.useState('单件')
  const [variantWeight, setVariantWeight] = React.useState('220')
  const [selectedSpu, setSelectedSpu] = React.useState(ERP_DEMO_PRODUCTS[0]?.spu ?? '')
  const [notice, setNotice] = React.useState('')
  const selected = products.find((item) => item.spu === selectedSpu)
  const editor = open ? <UedDialog title="新建商品 SPU" description="系统按 HSY + 六位流水号生成编码。" fields={[
        { key: 'name', label: '内部商品名称', required: true },
        { key: 'brand', label: '品牌', options: brandOptions.length > 0 ? brandOptions : ['HELLO COSMOS', 'LinkForge', '其他'], required: true },
        { key: 'category', label: '多级品类', options: categoryOptions.length > 0 ? categoryOptions : ['服装 / 上衣 / T恤', '数码 / 电脑配件', '家居'], required: true },
        { key: 'material', label: '材质', required: true },
        { key: 'style', label: '款式 / 版型', required: true },
        { key: 'owner', label: '商品负责人', options: ownerOptions.length > 0 ? ownerOptions : ['杨洁'], required: true },
        { key: 'launchDate', label: '计划上市日期', type: 'date' },
        { key: 'description', label: '商品描述', type: 'textarea', fullWidth: true, placeholder: '卖点、适用场景与包装说明' },
      ]} onClose={() => setOpen(false)} onSave={(values) => { const number = products.length + 1; const spu = `HSY${String(number).padStart(6, '0')}`; setProducts((current) => [...current, { spu, name: values.name || '新商品（示例）', brand: values.brand || brandOptions[0] || 'HELLO COSMOS', category: values.category || categoryOptions[0] || '待分类', owner: values.owner || ownerOptions[0] || '当前用户', status: '待确认', skuCount: 0, material: values.material || '待补充', style: values.style || '待补充', variants: [] }]); setSelectedSpu(spu); setOpen(false); setNotice(`${spu} 已加入本次原型会话。`) }} /> : null
  return <>{editor}<UedWorkspace title="商品 SPU / SKU" description="公司统一款式主档下维护真实交付规格；平台 Seller SKU 独立映射。" rows={products} detailHref={(row) => `/console/master-products/${encodeURIComponent(row.spu)}`} searchKeys={['spu', 'name', 'brand', 'category', 'owner', 'status']} addLabel="新建 SPU" onAdd={() => setOpen(true)} columns={[
    { key: 'spu', label: 'SPU' }, { key: 'name', label: '商品名称' }, { key: 'brand', label: '品牌' }, { key: 'category', label: '品类' }, { key: 'material', label: '材质' }, { key: 'style', label: '款式 / 版型' }, { key: 'owner', label: '负责人' }, { key: 'skuCount', label: 'SKU 数' }, { key: 'status', label: '状态', render: (row) => <Badge variant="secondary">{row.status}</Badge> },
  ]}>
    <UedPrototypeNotice>SPU/SKU 编号不可编辑、不可复用；停用保留历史。服装颜色和尺码从标准字典选择。此页示例值不是生产商品资料。</UedPrototypeNotice>
    <div className="flex flex-wrap gap-2">{products.map((product) => <Button key={product.spu} variant={selectedSpu === product.spu ? 'secondary' : 'outline'} size="sm" onClick={() => setSelectedSpu(product.spu)}>{product.spu} · SKU {product.skuCount}</Button>)}{selected ? <Button variant="outline" size="sm" onClick={() => setNotice(`${selected.spu} 详情：${selected.name} · ${selected.variants.length} 个规格，供应商与 Listing 可在此继续维护。`)}>查看 SPU 详情</Button> : null}<Button variant="outline" size="sm" asChild><LocaleLink href="/console/categories">维护品类</LocaleLink></Button><Button variant="outline" size="sm" asChild><LocaleLink href="/console/dictionaries">维护品牌</LocaleLink></Button></div>
    {selected ? <div className="overflow-hidden rounded-lg border"><div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"><div><h2 className="font-medium">{selected.spu} · 规格</h2><p className="mt-1 text-sm text-muted-foreground">规格序号自动生成；不存在组合不创建 SKU。</p></div><Button variant="outline" size="sm" onClick={() => setVariantsOpen(true)}>新增规格组合</Button></div><div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr] gap-3 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground"><span>内部 SKU</span><span>颜色</span><span>尺码</span><span>包装</span><span>重量 g</span><span>状态</span></div>{selected.variants.map((variant) => <div key={variant.code} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr] gap-3 border-b px-4 py-3 text-sm last:border-0"><span className="font-mono">{variant.code}</span><span>{variant.color}</span><span>{variant.size}</span><span>{variant.pack}</span><span>{variant.weight}</span><span>{variant.status}</span></div>)}</div> : null}
    {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
  </UedWorkspace>{variantsOpen ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setVariantsOpen(false) }} onKeyDown={(event) => { if (event.key === 'Escape') setVariantsOpen(false) }}><section role="dialog" aria-modal="true" aria-labelledby="variant-dialog-title" className="w-full max-w-lg rounded-xl border bg-background p-5 shadow-lg"><h2 id="variant-dialog-title" className="font-semibold">新增 SKU 规格</h2><p className="mt-1 text-sm text-muted-foreground">按实际交付规格增加一个变体；编号由系统生成。</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><div className="flex flex-col gap-2"><Label>颜色</Label><NativeSelect value={variantColor} onChange={(event) => setVariantColor(event.target.value)}>{['黑色', '白色', '深灰色', '蓝色', '红色'].map((item) => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></div><div className="flex flex-col gap-2"><Label>尺码</Label><NativeSelect value={variantSize} onChange={(event) => setVariantSize(event.target.value)}>{['M', 'L', 'XL', '2XL', '3XL', '4XL', '标准'].map((item) => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></div><div className="flex flex-col gap-2"><Label>包装规格</Label><NativeSelect value={packOptions.includes(variantPack) ? variantPack : (packOptions[0] ?? '单件')} onChange={(event) => setVariantPack(event.target.value)}>{(packOptions.length ? packOptions : ['单件']).map((item) => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect></div><div className="flex flex-col gap-2"><Label>重量（g）</Label><Input type="number" value={variantWeight} onChange={(event) => setVariantWeight(event.target.value)} /></div></div><div className="mt-6 flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={() => setVariantsOpen(false)}>取消</Button><Button onClick={() => { if (!selected) return; const nextNo = selected.variants.length + 1; const code = `${selected.spu}${String(nextNo).padStart(3, '0')}`; setProducts((current) => current.map((product) => product.spu === selected.spu ? { ...product, variants: [...product.variants, { code, color: variantColor, size: variantSize, pack: packOptions.includes(variantPack) ? variantPack : (packOptions[0] ?? '单件'), barcode: '', weight: Number(variantWeight) || 220, status: '待确认' }], skuCount: product.skuCount + 1 } : product)); setVariantsOpen(false); setNotice(`${code} 已加入本次原型会话；实际规则须由后端校验去重和流水号。`) }}>新增规格</Button></div></section></div> : null}</>
}
