'use client'

import * as React from 'react'
import { UedDialog, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { DetailKpiRow } from '@/components/console/detail'
import { ProductCoverCell } from '@/components/console/product-images'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import type { UiProductStatus } from '@/lib/server/mappers/products'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

const PAGE_SIZE = 20

export default function MasterSkusPage() {
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

  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('全部')

  const utils = trpc.useUtils()
  const listQuery = trpc.products.listSkus.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status === '全部' ? undefined : status,
  })
  const productsQuery = trpc.products.list.useQuery({ page: 1, pageSize: 100 })
  const createMutation = trpc.products.createVariant.useMutation({
    onSuccess: async (created) => {
      await utils.products.listSkus.invalidate()
      await utils.products.stats.invalidate()
      await utils.products.listSkuCodes.invalidate()
      setOpen(false)
      setNotice(`${created.code} 已写入数据库。`)
    },
    onError: (error) => setNotice(error.message),
  })

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const products = productsQuery.data?.items ?? []

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
      { label: '本页 SKU', value: String(rows.length), hint: `库内共 ${total}` },
      { label: '启用(页)', value: String(enabled) },
      { label: '待确认(页)', value: String(pending) },
      { label: '停用(页)', value: String(disabled) },
      { label: '可刊登(页)', value: String(listable), hint: '启用且条码齐全' },
      { label: '缺条码(页)', value: String(missingBarcode) },
      { label: '覆盖 SPU(页)', value: String(spuCount) },
      { label: '总重量(页)', value: `${(totalWeight / 1000).toFixed(1)} kg` },
    ]
  }, [rows, total])

  const editor = open ? (
    <UedDialog
      title="生成内部 SKU"
      description="选择所属 SPU 与规格组合，编号由系统按 SPU+三位流水生成并写入 product_variants。"
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
        createMutation.mutate({
          spu: product.spu,
          color: values.color || '黑色',
          size: values.size || 'L',
          pack: values.pack || packOptions[0] || '单件',
          barcode: values.barcode,
          weight: Number(values.weight) || 220,
          lengthMm: Number(values.lengthMm) || 0,
          widthMm: Number(values.widthMm) || 0,
          heightMm: Number(values.heightMm) || 0,
          status: (values.status as UiProductStatus) || '待确认',
        })
      }}
      saveLabel={createMutation.isPending ? '生成中…' : '生成 SKU'}
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="内部 SKU"
        description="product_variants 真实交付规格；列表经 tRPC 数据库分页。"
        rows={rows}
        detailHref={(row) => `/console/master-skus/${encodeURIComponent(row.sku)}`}
        searchKeys={['sku', 'spu', 'name', 'color', 'size', 'barcode', 'status']}
        search={q}
        onSearchChange={setQ}
        onStatusFilterChange={setStatus}
        filters={[
          { label: '状态', key: 'status', options: ['启用', '待确认', '停用'] },
        ]}
        addLabel="生成 SKU"
        onAdd={() => setOpen(true)}
        listTitle="内部 SKU 列表"
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        emptyText={
          listQuery.isError
            ? `加载失败：${listQuery.error.message}`
            : listQuery.isLoading
              ? '正在从数据库加载 SKU…'
              : '暂无内部 SKU。请先建 SPU 再生成规格行。'
        }
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
          { key: 'weight', label: '重量 g' },
          {
            key: 'status',
            label: '状态',
            render: (row) => <Badge variant="secondary">{row.status}</Badge>,
          },
        ]}
      >
        <DetailKpiRow items={kpiItems} />
        <Alert>
          <AlertTitle>已接库 · 内部 SKU</AlertTitle>
          <AlertDescription>
            本页 KPI 中标注「页」的为当前页统计；总数见分页。Seller SKU / 刊登映射仍为 stub。
          </AlertDescription>
        </Alert>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
