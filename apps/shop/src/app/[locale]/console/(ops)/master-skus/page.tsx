'use client'

import * as React from 'react'
import { UedDialog, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  buildCreateInternalSkuFields,
  parseCreateInternalSkuValues,
} from '@/components/console/create-internal-sku-fields'
import { DetailKpiRow } from '@/components/console/detail'
import { ProductCoverCell } from '@/components/console/product-images'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

const PAGE_SIZE = 20

export default function MasterSkusPage() {
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
  const packOptions = activeOptions('product_pack')
  const colorOptions = activeOptions('product_color')
  const sizeOptions = activeOptions('product_size')
  const packTitles = dictMap.product_pack?.valueTitles ?? {}
  const colorTitles = dictMap.product_color?.valueTitles ?? {}
  const sizeTitles = dictMap.product_size?.valueTitles ?? {}

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
      fields={buildCreateInternalSkuFields({
        colorOptions,
        sizeOptions,
        packOptions,
        spu: {
          mode: 'select',
          options: products.map((product) => `${product.spu} · ${product.name}`),
        },
      })}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const product =
          products.find((item) => `${item.spu} · ${item.name}` === values.spu) ?? products[0]
        if (!product) {
          throw new Error('请先创建 SPU 再生成 SKU。')
        }
        const parsed = parseCreateInternalSkuValues(values, {
          defaultPack:
            (typeof packOptions[0] === 'string' ? packOptions[0] : packOptions[0]?.value) || '单件',
        })
        return createMutation.mutateAsync({
          spu: product.spu,
          ...parsed,
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
                fallback={{ cover: row.coverImage, images: row.images ?? [] }}
                alt={row.name}
              />
            ),
          },
          { key: 'sku', label: '内部 SKU' },
          { key: 'spu', label: '所属 SPU' },
          { key: 'name', label: '商品名称' },
          { key: 'color', label: '颜色', render: (row) => colorTitles[row.color] ?? row.color },
          { key: 'size', label: '尺码', render: (row) => sizeTitles[row.size] ?? row.size },
          { key: 'pack', label: '包装', render: (row) => packTitles[row.pack] ?? row.pack },
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
            本页 KPI 中标注「页」的为当前页统计；总数见分页。Seller SKU 映射与刊登请分别前往对应页面维护。
          </AlertDescription>
        </Alert>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
