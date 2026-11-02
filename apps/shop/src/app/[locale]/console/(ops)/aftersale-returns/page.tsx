'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  RETURN_STATUSES,
  countReturnsByStatus,
  registerReturnReceive,
  useAftersaleReturns,
} from '@/lib/crossborder/aftersale-store'
import { Badge } from '@workspace/ui/components/badge'

function statusVariant(status: string) {
  if (status === '已报损') return 'destructive' as const
  if (status === '已回库' || status === '部分回库') return 'secondary' as const
  return 'outline' as const
}

export default function AftersaleReturnsPage() {
  const rows = useAftersaleReturns()
  const kpi = React.useMemo(() => countReturnsByStatus(rows), [rows])
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const kpiItems = React.useMemo(
    () => [
      { label: '退货单', value: String(kpi.total) },
      { label: '待收货', value: String(kpi.pendingReceive) },
      { label: '待质检', value: String(kpi.pendingQc) },
      { label: '已回库', value: String(kpi.restocked) },
      { label: '已报损', value: String(kpi.scrapped) },
    ],
    [kpi],
  )

  const editor = open ? (
    <UedDialog
      title="登记退货收货"
      description="寄回运单收货后才可质检；收货不直接增加可用库存，须质检过账经 WMS 流水回库/报损。"
      fields={[
        {
          key: 'id',
          label: '售后单号',
          options: ['AS-2026-0081', 'AS-2026-0079', 'AS-2026-0088'],
          required: true,
          helper: '关联已登记的退货退款售后单',
        },
        { key: 'order', label: '原订单', options: ['DZ-10018', 'DZ-10012', 'LZ-2180'], required: true },
        {
          key: 'sku',
          label: '内部 SKU',
          options: ['HSY000002001', 'HSY000001001', 'HSY000001002'],
          required: true,
        },
        { key: 'shop', label: '店铺', options: ['Daraz LK', 'Lazada MY', 'Lazada PH'] },
        { key: 'tracking', label: '寄回运单号', required: true, placeholder: '平台退货物流单号' },
        { key: 'qty', label: '实收数量', type: 'number', required: true, helper: '以实际清点数量为准' },
        {
          key: 'warehouse',
          label: '收货仓库',
          options: ['WH-CN-XMN-001'],
          required: true,
        },
        {
          key: 'bin',
          label: '收货库位',
          options: ['B-02-01-01', 'A-01-01-02', 'A-01-01-01'],
          required: true,
        },
        {
          key: 'packageCondition',
          label: '外包装状况',
          options: ['完好', '轻微破损', '破损'],
          required: true,
        },
        { key: 'remark', label: '收货备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const result = registerReturnReceive({
          id: values.id || '',
          order: values.order || '',
          shop: values.shop,
          sku: values.sku || '',
          warehouse: values.warehouse,
          bin: values.bin || '',
          tracking: values.tracking || '',
          qty: Number(values.qty),
          packageCondition: values.packageCondition,
          remark: values.remark,
        })
        if (!result.ok) {
          setNotice(result.reason)
          return
        }
        setNotice(`${result.row.id} 已收货，状态「待质检」；请在详情完成质检过账`)
        setOpen(false)
      }}
    />
  ) : null

  return (
    <UedWorkspace
      title="退货收货与质检"
      description="收货 → 质检 → 回库/报损。回库与报损经 wms-store 写流水投影余额，禁止直改库存。"
      rows={rows}
      detailHref={(row) => `/console/aftersale-returns/${encodeURIComponent(row.id)}`}
      searchKeys={['id', 'order', 'sku', 'tracking', 'shop', 'warehouse', 'bin', 'status', 'qc']}
      searchPlaceholder="搜索售后单、订单、SKU 或运单"
      filters={[{ label: '状态', options: [...RETURN_STATUSES], key: 'status' }]}
      emptyText="暂无退货收货单。登记寄回运单收货后进入待质检。"
      addLabel="登记退货收货"
      onAdd={() => setOpen(true)}
      columns={[
        { key: 'id', label: '售后单号' },
        { key: 'order', label: '原订单' },
        { key: 'shop', label: '店铺', className: 'hidden md:table-cell' },
        { key: 'sku', label: '内部 SKU' },
        { key: 'tracking', label: '寄回运单', className: 'hidden md:table-cell' },
        { key: 'receivedAt', label: '收货时间', className: 'hidden md:table-cell' },
        {
          key: 'qty',
          label: '实收',
          render: (row) => String(row.qty),
        },
        { key: 'qc', label: '质检', className: 'hidden lg:table-cell' },
        {
          key: 'restock',
          label: '回库 / 报损',
          className: 'hidden lg:table-cell',
          render: (row) => `${row.restock} / ${row.scrap}`,
        },
        {
          key: 'status',
          label: '状态',
          render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
        },
      ]}
    >
      <DetailKpiRow items={kpiItems} />
      <UedPrototypeNotice>
        收货不增加可用库存。质检过账：合格件写「售后回库」流水，残次写「质检报损」流水；幂等键绑定售后单号。
      </UedPrototypeNotice>
      {editor}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </UedWorkspace>
  )
}
