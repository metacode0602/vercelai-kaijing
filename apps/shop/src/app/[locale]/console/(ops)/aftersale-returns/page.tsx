'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'

function statusVariant(status: string) {
  if (status === '已报损') return 'destructive' as const
  if (status === '已回库' || status === '部分回库') return 'secondary' as const
  return 'outline' as const
}

export default function AftersaleReturnsPage() {
  const utils = trpc.useUtils()
  const listQuery = trpc.aftersale.listReturns.useQuery({ page: 1, pageSize: 100 })
  const statsQuery = trpc.aftersale.returnStats.useQuery()
  const metaQuery = trpc.aftersale.meta.useQuery()
  const receiveMutation = trpc.aftersale.registerReceive.useMutation({
    onSuccess: async (row) => {
      await Promise.all([
        utils.aftersale.listReturns.invalidate(),
        utils.aftersale.returnStats.invalidate(),
        utils.aftersale.list.invalidate(),
      ])
      setOpen(false)
      setNotice(`${row.id} 已收货，状态「待质检」；请在详情完成质检过账`)
    },
    onError: (e) => setNotice(e.message),
  })

  const rows = listQuery.data?.items ?? []
  const kpi = statsQuery.data ?? {
    total: 0,
    pendingReceive: 0,
    pendingQc: 0,
    restocked: 0,
    scrapped: 0,
  }
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
      description="寄回运单收货后才可质检；收货不直接增加可用库存，须质检过账经库存流水回库/报损。"
      fields={[
        {
          key: 'id',
          label: '售后单号',
          required: true,
          helper: '关联已登记的退货退款售后单（uiId / 外部逆向单号）',
        },
        { key: 'order', label: '原订单', required: true },
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
          options: ['B-02-01-01', 'A-01-01-02', 'A-01-01-01', 'A-01-01', 'A-01-02'],
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
        receiveMutation.mutate({
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
      }}
      saveLabel={receiveMutation.isPending ? '提交中…' : '登记收货'}
    />
  ) : null

  return (
    <UedWorkspace
      title="退货收货与质检"
      description="收货 → 质检 → 回库/报损。回库与报损经 inventory_movements 写流水投影余额，禁止直改库存。"
      rows={rows}
      detailHref={(row) => `/console/aftersale-returns/${encodeURIComponent(row.id)}`}
      searchKeys={[
        'id',
        'reverseOrderId',
        'externalReturnId',
        'order',
        'sku',
        'tracking',
        'returnShipmentId',
        'shop',
        'warehouse',
        'bin',
        'status',
        'qc',
        'platformStatus',
      ]}
      searchPlaceholder="搜索售后单、订单、SKU 或运单"
      filters={[{ label: '状态', options: [...(metaQuery.data?.returnStatuses ?? [])], key: 'status' }]}
      emptyText={listQuery.isLoading ? '加载中…' : '暂无退货收货单。登记寄回运单收货后进入待质检。'}
      addLabel="登记退货收货"
      onAdd={() => setOpen(true)}
      columns={[
        { key: 'id', label: '售后单号' },
        { key: 'reverseOrderId', label: '逆向单 ID' },
        { key: 'order', label: '原订单' },
        { key: 'shop', label: '店铺' },
        { key: 'sku', label: '内部 SKU' },
        { key: 'returnShipmentId', label: '退货包裹' },
        { key: 'tracking', label: '寄回运单' },
        { key: 'receivedAt', label: '收货时间' },
        {
          key: 'qty',
          label: '实收',
          render: (row) => String(row.qty),
        },
        { key: 'qc', label: '质检' },
        { key: 'qcDecision', label: '质检结论' },
        {
          key: 'restock',
          label: '回库 / 报损',
          render: (row) => `${row.restock} / ${row.scrap}`,
        },
        { key: 'refundStatus', label: '退款状态' },
        { key: 'platformStatus', label: '平台状态' },
        {
          key: 'status',
          label: '状态',
          render: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>,
        },
      ]}
    >
      <DetailKpiRow items={kpiItems} />
      <UedPrototypeNotice>
        退货收货不增加可用库存；质检合格件回库、残次件报废在质检完成后处理。
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
