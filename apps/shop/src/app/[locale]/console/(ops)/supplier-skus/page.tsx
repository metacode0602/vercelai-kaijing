'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { DetailKpiRow } from '@/components/console/detail'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

const PAGE_SIZE = 20

export default function SupplierSkusPage() {
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('全部')

  const utils = trpc.useUtils()
  const metaQuery = trpc.suppliers.meta.useQuery()
  const statsQuery = trpc.suppliers.skuStats.useQuery()
  const skuCodesQuery = trpc.products.listSkuCodes.useQuery()
  const listQuery = trpc.suppliers.listSkus.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    status: status === '全部' ? undefined : status,
  })

  const createMutation = trpc.suppliers.createSku.useMutation({
    onSuccess: async (created) => {
      await utils.suppliers.listSkus.invalidate()
      await utils.suppliers.skuStats.invalidate()
      setOpen(false)
      setNotice(`${created.sku} ↔ ${created.supplier}（${created.factoryCode}）已写入 supplier_skus。`)
    },
    onError: (error) => setNotice(error.message),
  })

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const stats = statsQuery.data
  const supplierOptions = (metaQuery.data?.suppliers ?? []).map((s) => s.name)
  const supplierByName = new Map((metaQuery.data?.suppliers ?? []).map((s) => [s.name, s]))
  const skuOptions = skuCodesQuery.data ?? []

  const kpiItems = React.useMemo(
    () => [
      { label: '供应源', value: String(stats?.total ?? '—'), hint: '数据库' },
      { label: '启用', value: String(stats?.active ?? '—') },
      { label: '首选', value: String(stats?.preferred ?? '—') },
      { label: '停用', value: String(stats?.disabled ?? '—') },
    ],
    [stats],
  )

  const editor = open ? (
    <UedDialog
      title="新增 SKU 供应商映射"
      description="维护内部 SKU 到供应商货号的采购来源；写入 PostgreSQL，供采购申请参考价。"
      fields={[
        {
          key: 'sku',
          label: '内部 SKU',
          options: skuOptions.length ? skuOptions : ['HSY000001001'],
          required: true,
        },
        {
          key: 'supplier',
          label: '供应商',
          options: supplierOptions.length ? supplierOptions : ['（请先维护供应商）'],
          required: true,
        },
        { key: 'factoryCode', label: '厂家款号', required: true },
        { key: 'price', label: '采购价', type: 'number', required: true },
        { key: 'currency', label: '币种', options: ['CNY', 'USD'], required: true },
        { key: 'moq', label: '最小起订量 MOQ', type: 'number', required: true },
        { key: 'leadDays', label: '交期（天）', type: 'number', required: true },
        { key: 'effective', label: '生效日期', type: 'date', required: true },
        { key: 'preferred', label: '是否首选', options: ['否', '是'], required: true },
        { key: 'status', label: '状态', options: ['启用', '待确认', '停用'], required: true },
        { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const supplier = supplierByName.get(values.supplier || '')
        return createMutation.mutateAsync({
          sku: values.sku || skuOptions[0] || '',
          supplierId: supplier?.id,
          supplierName: values.supplier || undefined,
          factoryCode: values.factoryCode || '',
          price: Number(values.price || 0),
          currency: values.currency || 'CNY',
          moq: Number(values.moq || 1),
          leadDays: Number(values.leadDays || 0),
          effective: values.effective || new Date().toISOString().slice(0, 10),
          preferred: values.preferred === '是',
          status: values.status || '启用',
          remark: values.remark || '',
        })
      }}
      saveLabel={createMutation.isPending ? '保存中…' : '保存映射'}
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="供应商货号"
        description="SKU ↔ 供应商货号的采购来源与价格生效记录；采购维护，普通运营只读。已接 PostgreSQL。"
        rows={rows}
        detailHref={(row) => `/console/supplier-skus/${encodeURIComponent(row.id)}`}
        search={q}
        onSearchChange={(value) => {
          setQ(value)
          setPage(1)
        }}
        searchPlaceholder="搜索内部 SKU、供应商或厂家款号"
        filters={[{ label: '状态', options: ['启用', '待确认', '停用'] }]}
        onStatusFilterChange={(value) => {
          setStatus(value === '全部' ? '全部' : value)
          setPage(1)
        }}
        addLabel="新增映射"
        onAdd={() => setOpen(true)}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
        emptyText={
          listQuery.isError
            ? `加载失败：${listQuery.error.message}`
            : listQuery.isLoading
              ? '正在从数据库加载供应商货号…'
              : '暂无供应商货号。请先维护供应商，或跑 db:seed:commerce-suppliers。'
        }
        columns={[
          { key: 'id', label: '映射号', render: (row) => row.id.slice(0, 10) },
          { key: 'sku', label: '内部 SKU' },
          { key: 'supplier', label: '供应商' },
          { key: 'factoryCode', label: '厂家款号' },
          { key: 'price', label: '采购价', render: (row) => `${row.price} ${row.currency}` },
          { key: 'moq', label: 'MOQ', render: (row) => String(row.moq) },
          { key: 'leadDays', label: '交期', render: (row) => `${row.leadDays} 天` },
          { key: 'effective', label: '生效日期' },
          {
            key: 'preferred',
            label: '首选',
            render: (row) => (row.preferred ? <Badge variant="secondary">首选</Badge> : '—'),
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
          一个内部 SKU 可关联多个供应商；首选供应源作为采购申请参考价。供应商主档在「供应商管理」维护。价格变更新增生效记录，不覆盖历史采购单。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <LocaleLink href="/console/suppliers">供应商管理</LocaleLink>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <LocaleLink href="/console/purchase-requests">采购申请</LocaleLink>
          </Button>
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
