'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { DetailKpiRow } from '@/components/console/detail'
import { supplierNames, useSuppliers } from '@/lib/crossborder/supplier-store'
import { addSupplierSku, useSupplierSkus } from '@/lib/crossborder/supplier-sku-store'
import { Badge } from '@workspace/ui/components/badge'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@workspace/ui/components/button'

export default function SupplierSkusPage() {
  const suppliers = useSuppliers()
  const rows = useSupplierSkus()
  const skuCodesQuery = trpc.products.listSkuCodes.useQuery()
  const skuOptions = skuCodesQuery.data ?? []
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const supplierOptions = supplierNames(suppliers.filter((supplier) => supplier.status === '启用'))

  const kpiItems = React.useMemo(() => {
    const enabled = rows.filter((item) => item.status === '启用').length
    const preferred = rows.filter((item) => item.preferred).length
    const disabled = rows.filter((item) => item.status === '停用').length
    return [
      { label: '供应源', value: String(rows.length), hint: '当前原型会话' },
      { label: '启用', value: String(enabled) },
      { label: '首选', value: String(preferred) },
      { label: '停用', value: String(disabled) },
    ]
  }, [rows])

  const editor = open ? (
    <UedDialog
      title="新增 SKU 供应商映射"
      description="维护内部 SKU 到供应商货号的采购来源；保存为本次原型会话。"
      fields={[
        {
          key: 'sku',
          label: '内部 SKU',
          options: skuOptions.length ? skuOptions : ['HSY000001001'],
          required: true,
        },
        { key: 'supplier', label: '供应商', options: supplierOptions, required: true },
        { key: 'factoryCode', label: '厂家款号', required: true },
        { key: 'price', label: '采购价', type: 'number', required: true },
        { key: 'currency', label: '币种', options: ['CNY', 'USD'], required: true },
        { key: 'moq', label: '最小起订量 MOQ', type: 'number', required: true },
        { key: 'leadDays', label: '交期（天）', type: 'number', required: true },
        { key: 'effective', label: '生效日期', type: 'date', required: true },
        { key: 'preferred', label: '是否首选', options: ['否', '是'], required: true },
        { key: 'status', label: '状态', options: ['启用', '停用'], required: true },
        { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        addSupplierSku(rows, {
          sku: values.sku || skuOptions[0] || 'HSY000001001',
          supplier: values.supplier || supplierOptions[0] || '待补充',
          factoryCode: values.factoryCode || '待补充',
          price: Number(values.price || 0),
          currency: values.currency || 'CNY',
          moq: Number(values.moq || 0),
          leadDays: Number(values.leadDays || 0),
          effective: values.effective || '2026-10-29',
          preferred: values.preferred === '是',
          status: values.status || '启用',
          remark: values.remark || '',
        })
        setOpen(false)
        setNotice('供应商货号映射已加入本次原型会话；生效前需采购负责人确认。')
      }}
    />
  ) : null

  return (
    <>
      {editor}
      <UedWorkspace
        title="供应商货号"
        description="SKU ↔ 供应商货号的采购来源与价格生效记录；采购维护，普通运营只读。"
        rows={rows}
        detailHref={(row) => `/console/supplier-skus/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'sku', 'supplier', 'factoryCode', 'status']}
        searchPlaceholder="搜索内部 SKU、供应商或厂家款号"
        filters={[{ label: '状态', options: ['启用', '待确认', '停用'] }]}
        addLabel="新增映射"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '映射号' },
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
          一个内部 SKU 可关联多个供应商，采购下单时选首选供应商之外的备选需说明原因；价格变更新增生效记录，不覆盖历史采购单价格。供应商主档（联系人/结算）在「供应商管理」维护。详情自动带出 SKU / 供应商 / 库存。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setNotice(
                '已选 HSY000001001：2 个在用供应源（首选 厦门优品 28 CNY，备选停用）。进入详情查看关联库存与采购单。',
              )
            }
          >
            查看 SKU 供应源
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setNotice('调价将生成新的生效记录；已生成采购单价格不受影响（原型规则）。')
            }
          >
            发起调价
          </Button>
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
