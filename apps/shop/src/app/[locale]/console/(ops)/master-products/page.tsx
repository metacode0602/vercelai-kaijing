'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ERP_DEMO_PRODUCTS, type DemoProduct } from '@/lib/crossborder/erp-ued-data'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function MasterProductsPage() {
  const [products, setProducts] = React.useState<DemoProduct[]>(ERP_DEMO_PRODUCTS)
  const [open, setOpen] = React.useState(false)
  const [selectedSpu, setSelectedSpu] = React.useState(ERP_DEMO_PRODUCTS[0]?.spu ?? '')
  const [notice, setNotice] = React.useState('')
  const selected = products.find((item) => item.spu === selectedSpu)
  const editor = open ? <UedDialog title="新建商品 SPU" description="系统按 HSY + 六位流水号生成编码。" fields={[{ label: '内部商品名称' }, { label: '品牌', options: ['HELLO COSMOS', 'LinkForge', '其他'] }, { label: '多级品类', options: ['服装 / 上衣 / T恤', '数码 / 电脑配件', '家居'] }, { label: '材质' }, { label: '款式 / 版型' }, { label: '商品负责人', options: ['杨洁', '李萍', '张鑫德', '蔡利达'] }]} onClose={() => setOpen(false)} onSave={() => { const number = products.length + 1; const spu = `HSY${String(number).padStart(6, '0')}`; setProducts((current) => [...current, { spu, name: '新商品（示例）', brand: 'HELLO COSMOS', category: '待分类', owner: '当前用户', status: '待确认', skuCount: 0, material: '待补充', style: '待补充', variants: [] }]); setSelectedSpu(spu); setOpen(false); setNotice(`${spu} 已加入本次原型会话。`) }} /> : null
  return <>{editor}<UedWorkspace title="商品 SPU / SKU" description="公司统一款式主档下维护真实交付规格；平台 Seller SKU 独立映射。" rows={products} searchKeys={['spu', 'name', 'brand', 'category', 'owner', 'status']} addLabel="新建 SPU" onAdd={() => setOpen(true)} columns={[
    { key: 'spu', label: 'SPU' }, { key: 'name', label: '商品名称' }, { key: 'brand', label: '品牌' }, { key: 'category', label: '品类' }, { key: 'material', label: '材质' }, { key: 'style', label: '款式 / 版型' }, { key: 'owner', label: '负责人' }, { key: 'skuCount', label: 'SKU 数' }, { key: 'status', label: '状态', render: (row) => <Badge variant="secondary">{row.status}</Badge> },
  ]}>
    <UedPrototypeNotice>SPU/SKU 编号不可编辑、不可复用；停用保留历史。服装颜色和尺码从标准字典选择。此页示例值不是生产商品资料。</UedPrototypeNotice>
    <div className="flex flex-wrap gap-2">{products.map((product) => <Button key={product.spu} variant={selectedSpu === product.spu ? 'secondary' : 'outline'} size="sm" onClick={() => setSelectedSpu(product.spu)}>{product.spu} · SKU {product.skuCount}</Button>)}{selected ? <Button variant="outline" size="sm" onClick={() => setNotice(`${selected.spu} 详情：${selected.name} · ${selected.variants.length} 个规格，供应商与 Listing 可在此继续维护。`)}>查看 SPU 详情</Button> : null}</div>
    {selected ? <div className="overflow-hidden rounded-lg border"><div className="border-b px-4 py-3"><h2 className="font-medium">{selected.spu} · 规格</h2><p className="mt-1 text-sm text-muted-foreground">规格序号自动生成；不存在组合不创建 SKU。</p></div><div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr] gap-3 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground"><span>内部 SKU</span><span>颜色</span><span>尺码</span><span>包装</span><span>重量 g</span><span>状态</span></div>{selected.variants.map((variant) => <div key={variant.code} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr] gap-3 border-b px-4 py-3 text-sm last:border-0"><span className="font-mono">{variant.code}</span><span>{variant.color}</span><span>{variant.size}</span><span>{variant.pack}</span><span>{variant.weight}</span><span>{variant.status}</span></div>)}<div className="border-t p-3"><Button variant="outline" size="sm" onClick={() => setNotice('新增规格矩阵打开：按颜色 × 尺码选择组合，再确认批量创建。')}>新增规格组合</Button></div></div> : null}
    {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
  </UedWorkspace></>
}
