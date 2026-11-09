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
import { trpc } from '@/lib/trpc/client'
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
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react'

const PAGE_SIZE = 20

function statusVariant(status: string) {
  if (status === '启用') return 'secondary' as const
  if (status === '停用') return 'outline' as const
  return 'outline' as const
}

type SkuRow = {
  id: string
  sku: string
  factoryCode: string
  price: number
  currency: string
  moq: number
  leadDays: number
  effective: string
  preferred: boolean
  status: string
  remark: string
  updatedAt: string
  supplierId: string
  supplier: string
  supplierCode: string
  variantId: string
}

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  useConsoleBreadcrumbs([
    { label: '供应商管理', href: '/console/suppliers' },
    { label: id },
  ])

  const [editOpen, setEditOpen] = React.useState(false)
  const [addSkuOpen, setAddSkuOpen] = React.useState(false)
  const [editSku, setEditSku] = React.useState<SkuRow | null>(null)
  const [detailSkuId, setDetailSkuId] = React.useState<string | null>(null)
  const [hideConfirmId, setHideConfirmId] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState('')
  const [skuPage, setSkuPage] = React.useState(1)
  const [skuQ, setSkuQ] = React.useState('')

  const utils = trpc.useUtils()
  const supplierQuery = trpc.suppliers.get.useQuery({ id })
  const supplier = supplierQuery.data

  const skuCodesQuery = trpc.products.listSkuCodes.useQuery(undefined, {
    enabled: Boolean(supplier),
  })

  const skusQuery = trpc.suppliers.listSkus.useQuery(
    {
      page: skuPage,
      pageSize: PAGE_SIZE,
      supplierId: supplier?.id,
      q: skuQ || undefined,
      excludeDisabled: true,
    },
    { enabled: Boolean(supplier?.id) },
  )

  const detailSkuQuery = trpc.suppliers.getSku.useQuery(
    { id: detailSkuId ?? '' },
    { enabled: Boolean(detailSkuId) },
  )
  const batchesQuery = trpc.suppliers.skuPurchaseBatches.useQuery(
    { supplierSkuId: detailSkuId ?? '' },
    { enabled: Boolean(detailSkuId) },
  )

  const invalidateAll = React.useCallback(async () => {
    await Promise.all([
      utils.suppliers.get.invalidate({ id }),
      utils.suppliers.list.invalidate(),
      utils.suppliers.stats.invalidate(),
      utils.suppliers.listSkus.invalidate(),
      utils.suppliers.skuStats.invalidate(),
      utils.suppliers.meta.invalidate(),
    ])
  }, [utils, id])

  const updateMutation = trpc.suppliers.update.useMutation({
    onSuccess: async () => {
      await invalidateAll()
      setEditOpen(false)
      setNotice('供应商主档已保存到数据库。')
    },
    onError: (error) => setNotice(error.message),
  })

  const createSkuMutation = trpc.suppliers.createSku.useMutation({
    onSuccess: async (created) => {
      await invalidateAll()
      setAddSkuOpen(false)
      setNotice(`${created.sku} ↔ ${created.factoryCode} 已写入 supplier_skus。`)
    },
    onError: (error) => setNotice(error.message),
  })

  const updateSkuMutation = trpc.suppliers.updateSku.useMutation({
    onSuccess: async (updated) => {
      await invalidateAll()
      if (detailSkuId) {
        await utils.suppliers.getSku.invalidate({ id: detailSkuId })
        await utils.suppliers.skuPurchaseBatches.invalidate({ supplierSkuId: detailSkuId })
      }
      setEditSku(null)
      setNotice(`${updated.sku}（${updated.factoryCode}）已更新。`)
    },
    onError: (error) => setNotice(error.message),
  })

  const hideSkuMutation = trpc.suppliers.hideSku.useMutation({
    onSuccess: async (hidden) => {
      await invalidateAll()
      setHideConfirmId(null)
      if (detailSkuId === hidden.id) setDetailSkuId(null)
      setNotice(`${hidden.sku}（${hidden.factoryCode}）已逻辑删除（停用并隐藏）。`)
    },
    onError: (error) => setNotice(error.message),
  })

  if (supplierQuery.isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/suppliers"
          title="加载中…"
          description="正在读取供应商…"
        />
      </div>
    )
  }

  if (!supplier) {
    return (
      <div className="flex w-full flex-col gap-4">
        <DetailPageHeader
          backHref="/console/suppliers"
          title="未找到供应商"
          description={`编码 ${id} 不存在。${supplierQuery.error?.message ?? ''}`}
        />
      </div>
    )
  }

  const skuRows = skusQuery.data?.items ?? []
  const skuTotal = skusQuery.data?.total ?? 0
  const skuOptions = skuCodesQuery.data ?? []
  const detailSku = detailSkuQuery.data
  const batches = batchesQuery.data ?? []

  return (
    <div className="flex w-full flex-col gap-4">
      <DetailPageHeader
        backHref="/console/suppliers"
        title={`${supplier.code} · ${supplier.name}`}
        description={`联系人 ${supplier.contact || '—'} · ${supplier.phone || '—'} · 结算 ${supplier.settlement || '—'}`}
        badges={
          <>
            <Badge variant="outline">数据库</Badge>
            <Badge variant={statusVariant(supplier.status)}>{supplier.status}</Badge>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil data-icon="inline-start" />
              编辑供应商
            </Button>
            <Button size="sm" onClick={() => setAddSkuOpen(true)}>
              <Plus data-icon="inline-start" />
              添加货号
            </Button>
          </div>
        }
      />

      <Alert>
        <AlertTitle>供应商主档 · 绑定货号</AlertTitle>
        <AlertDescription>
          编辑写入 commerce_suppliers；货号维护写入 supplier_skus。删除为逻辑删除（status=停用），默认列表隐藏；采购批次按本供应商 + 内部 SKU 匹配真实采购单行。
        </AlertDescription>
      </Alert>

      {notice ? (
        <p role="status" className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      <DetailKpiRow
        items={[
          { label: '货号数', value: String(supplier.skuCount), hint: '未停用' },
          { label: '状态', value: supplier.status },
          { label: '结算方式', value: supplier.settlement || '—' },
          { label: '更新时间', value: supplier.updatedAt },
        ]}
      />

      <DetailFieldGrid
        title="供应商主信息"
        description="编码只读；名称 / 联系人 / 电话 / 邮箱 / 状态 / 备注可编辑。结算方式仅在此只读展示。"
        fields={[
          { label: '供应商编码', value: supplier.code, mono: true },
          { label: '供应商名称', value: supplier.name },
          { label: '联系人', value: supplier.contact || '—' },
          { label: '电话', value: supplier.phone || '—' },
          { label: '邮箱', value: supplier.email || '—' },
          { label: '结算方式', value: supplier.settlement || '—' },
          {
            label: '状态',
            value: <Badge variant={statusVariant(supplier.status)}>{supplier.status}</Badge>,
          },
          { label: '备注', value: supplier.note || '—' },
        ]}
        columns={4}
        action={
          <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
            <Pencil data-icon="inline-start" />
            编辑
          </Button>
        }
      />

      <DetailSection
        title="供应商货号"
        description="默认隐藏已逻辑删除（停用）的行；待确认与启用仍可见。删除不会物理删库。"
        action={
          <Button size="sm" variant="outline" onClick={() => setAddSkuOpen(true)}>
            <Plus data-icon="inline-start" />
            添加货号
          </Button>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            className="h-9 w-full max-w-sm rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            placeholder="搜索内部 SKU / 厂家款号"
            value={skuQ}
            onChange={(event) => {
              setSkuQ(event.target.value)
              setSkuPage(1)
            }}
          />
          <span className="text-xs text-muted-foreground">
            共 {skuTotal} 条 · 第 {skuPage} 页
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={skuPage <= 1}
              onClick={() => setSkuPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={skuPage * PAGE_SIZE >= skuTotal}
              onClick={() => setSkuPage((p) => p + 1)}
            >
              下一页
            </Button>
          </div>
        </div>

        {skusQuery.isLoading ? (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            正在加载货号…
          </p>
        ) : skusQuery.isError ? (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-destructive">
            加载失败：{skusQuery.error.message}
          </p>
        ) : skuRows.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            暂无货号。点击「添加货号」绑定内部 SKU。
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>内部 SKU</TableHead>
                <TableHead>厂家款号</TableHead>
                <TableHead>采购价</TableHead>
                <TableHead>MOQ</TableHead>
                <TableHead>交期</TableHead>
                <TableHead>生效日</TableHead>
                <TableHead>首选</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skuRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                  <TableCell className="font-mono text-xs">{row.factoryCode}</TableCell>
                  <TableCell className="tabular-nums">
                    {row.price} {row.currency}
                  </TableCell>
                  <TableCell className="tabular-nums">{row.moq}</TableCell>
                  <TableCell className="tabular-nums">{row.leadDays} 天</TableCell>
                  <TableCell>{row.effective}</TableCell>
                  <TableCell>
                    {row.preferred ? <Badge variant="secondary">首选</Badge> : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDetailSkuId(row.id)}>
                        <Eye data-icon="inline-start" />
                        详情
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditSku(row as SkuRow)}>
                        <Pencil data-icon="inline-start" />
                        修改
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setHideConfirmId(row.id)}
                      >
                        <Trash2 data-icon="inline-start" />
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <LocaleLink href="/console/supplier-skus">全部供应商货号</LocaleLink>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <LocaleLink href="/console/purchase-orders">采购订单</LocaleLink>
          </Button>
        </div>
      </DetailSection>

      {editOpen ? (
        <UedDialog
          title="编辑 · 供应商管理"
          description="编码只读；不展示货号数、更新时间与结算方式。保存写入 commerce_suppliers。"
          fields={[
            { key: 'code', label: '供应商编码', defaultValue: supplier.code, readOnly: true },
            { key: 'name', label: '供应商名称', defaultValue: supplier.name, required: true },
            { key: 'contact', label: '联系人', defaultValue: supplier.contact, required: true },
            { key: 'phone', label: '联系电话', defaultValue: supplier.phone, required: true },
            { key: 'email', label: '邮箱', defaultValue: supplier.email },
            {
              key: 'status',
              label: '状态',
              options: ['启用', '停用'],
              defaultValue: supplier.status,
              required: true,
            },
            {
              key: 'note',
              label: '备注',
              type: 'textarea',
              fullWidth: true,
              defaultValue: supplier.note,
            },
          ]}
          onClose={() => setEditOpen(false)}
          onSave={(values) => {
            updateMutation.mutate({
              id: supplier.id,
              name: values.name || supplier.name,
              contact: values.contact ?? '',
              phone: values.phone ?? '',
              email: values.email ?? '',
              status: values.status === '停用' ? '停用' : '启用',
              note: values.note ?? '',
            })
          }}
          saveLabel={updateMutation.isPending ? '保存中…' : '保存供应商'}
        />
      ) : null}

      {addSkuOpen ? (
        <UedDialog
          title="添加供应商货号"
          description={`归属 ${supplier.code} ${supplier.name}；供应商固定，不可改绑。`}
          fields={[
            {
              key: 'sku',
              label: '内部 SKU',
              options: skuOptions.length ? skuOptions : ['（请先维护内部 SKU）'],
              required: true,
            },
            { key: 'factoryCode', label: '厂家款号', required: true },
            { key: 'price', label: '采购价', type: 'number', required: true },
            { key: 'currency', label: '币种', options: ['CNY', 'USD'], required: true },
            { key: 'moq', label: '最小起订量 MOQ', type: 'number', required: true, defaultValue: '1' },
            { key: 'leadDays', label: '交期（天）', type: 'number', required: true, defaultValue: '7' },
            {
              key: 'effective',
              label: '生效日期',
              type: 'date',
              required: true,
              defaultValue: new Date().toISOString().slice(0, 10),
            },
            { key: 'preferred', label: '是否首选', options: ['否', '是'], required: true },
            {
              key: 'status',
              label: '状态',
              options: ['启用', '待确认', '停用'],
              defaultValue: '启用',
              required: true,
            },
            { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
          ]}
          onClose={() => setAddSkuOpen(false)}
          onSave={(values) => {
            createSkuMutation.mutate({
              sku: values.sku || '',
              supplierId: supplier.id,
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
          saveLabel={createSkuMutation.isPending ? '保存中…' : '保存货号'}
        />
      ) : null}

      {editSku ? (
        <UedDialog
          title="修改供应商货号"
          description={`内部 SKU ${editSku.sku} 只读；供应商固定为 ${supplier.name}。`}
          fields={[
            { key: 'sku', label: '内部 SKU', defaultValue: editSku.sku, readOnly: true },
            {
              key: 'factoryCode',
              label: '厂家款号',
              defaultValue: editSku.factoryCode,
              required: true,
            },
            {
              key: 'price',
              label: '采购价',
              type: 'number',
              defaultValue: String(editSku.price),
              required: true,
            },
            {
              key: 'currency',
              label: '币种',
              options: ['CNY', 'USD'],
              defaultValue: editSku.currency,
              required: true,
            },
            {
              key: 'moq',
              label: '最小起订量 MOQ',
              type: 'number',
              defaultValue: String(editSku.moq),
              required: true,
            },
            {
              key: 'leadDays',
              label: '交期（天）',
              type: 'number',
              defaultValue: String(editSku.leadDays),
              required: true,
            },
            {
              key: 'effective',
              label: '生效日期',
              type: 'date',
              defaultValue: editSku.effective,
              required: true,
            },
            {
              key: 'preferred',
              label: '是否首选',
              options: ['否', '是'],
              defaultValue: editSku.preferred ? '是' : '否',
              required: true,
            },
            {
              key: 'status',
              label: '状态',
              options: ['启用', '待确认', '停用'],
              defaultValue: editSku.status,
              required: true,
            },
            {
              key: 'remark',
              label: '备注',
              type: 'textarea',
              fullWidth: true,
              defaultValue: editSku.remark,
            },
          ]}
          onClose={() => setEditSku(null)}
          onSave={(values) => {
            updateSkuMutation.mutate({
              id: editSku.id,
              factoryCode: values.factoryCode || editSku.factoryCode,
              price: Number(values.price || 0),
              currency: values.currency || editSku.currency,
              moq: Number(values.moq || 1),
              leadDays: Number(values.leadDays || 0),
              effective: values.effective || editSku.effective,
              preferred: values.preferred === '是',
              status: values.status || editSku.status,
              remark: values.remark ?? '',
            })
          }}
          saveLabel={updateSkuMutation.isPending ? '保存中…' : '保存修改'}
        />
      ) : null}

      {hideConfirmId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHideConfirmId(null)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border bg-background p-5 shadow-lg"
          >
            <h2 className="font-semibold">确认逻辑删除？</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              将把该货号状态设为「停用」并从默认列表隐藏，不会物理删除数据库行，历史采购单不受影响。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setHideConfirmId(null)}>
                取消
              </Button>
              <Button
                variant="destructive"
                disabled={hideSkuMutation.isPending}
                onClick={() => hideSkuMutation.mutate({ id: hideConfirmId })}
              >
                {hideSkuMutation.isPending ? '处理中…' : '确认删除'}
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {detailSkuId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailSkuId(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setDetailSkuId(null)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="sku-detail-title"
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-background shadow-lg"
          >
            <header className="border-b p-5">
              <h2 id="sku-detail-title" className="font-semibold">
                货号详情
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                供应商货号字段 + 关联采购批次（真实采购单行）。
              </p>
            </header>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              {detailSkuQuery.isLoading || !detailSku ? (
                <p className="text-sm text-muted-foreground">正在加载货号…</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['内部 SKU', detailSku.sku],
                    ['厂家款号', detailSku.factoryCode],
                    ['供应商', `${detailSku.supplier}（${detailSku.supplierCode}）`],
                    ['采购价', `${detailSku.price} ${detailSku.currency}`],
                    ['MOQ', String(detailSku.moq)],
                    ['交期', `${detailSku.leadDays} 天`],
                    ['生效日', detailSku.effective],
                    ['首选', detailSku.preferred ? '是' : '否'],
                    ['状态', detailSku.status],
                    ['更新时间', detailSku.updatedAt],
                    ['备注', detailSku.remark || '—'],
                    ['映射 ID', detailSku.id],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-md border px-3 py-2">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-0.5 break-all text-sm font-medium">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold">采购批次</h3>
                {batchesQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">正在查询采购单行…</p>
                ) : batchesQuery.isError ? (
                  <p className="text-sm text-destructive">查询失败：{batchesQuery.error.message}</p>
                ) : batches.length === 0 ? (
                  <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                    暂无采购批次
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>采购单号</TableHead>
                        <TableHead>行号</TableHead>
                        <TableHead>数量</TableHead>
                        <TableHead>已收</TableHead>
                        <TableHead>单价</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>下单时间</TableHead>
                        <TableHead>预计到货</TableHead>
                        <TableHead>收货单</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batches.map((batch) => (
                        <TableRow key={`${batch.poNo}-${batch.lineNo}`}>
                          <TableCell>
                            <LocaleLink
                              className="font-mono text-xs underline-offset-2 hover:underline"
                              href={`/console/purchase-orders/${encodeURIComponent(batch.poNo)}`}
                            >
                              {batch.poNo}
                            </LocaleLink>
                          </TableCell>
                          <TableCell className="tabular-nums">{batch.lineNo}</TableCell>
                          <TableCell className="tabular-nums">{batch.qtyOrdered}</TableCell>
                          <TableCell className="tabular-nums">{batch.qtyReceived}</TableCell>
                          <TableCell className="tabular-nums">
                            {batch.unitPrice} {batch.currency}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{batch.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{batch.orderedAt}</TableCell>
                          <TableCell className="text-xs">{batch.expectedArrivalAt}</TableCell>
                          <TableCell className="text-xs">{batch.receiptNos}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
            <footer className="flex items-center justify-between gap-2 border-t p-4">
              <div className="flex gap-2">
                {detailSku ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditSku(detailSku as SkuRow)
                        setDetailSkuId(null)
                      }}
                    >
                      修改
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setHideConfirmId(detailSku.id)
                        setDetailSkuId(null)
                      }}
                    >
                      删除
                    </Button>
                  </>
                ) : null}
              </div>
              <Button variant="outline" onClick={() => setDetailSkuId(null)}>
                关闭
              </Button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  )
}
