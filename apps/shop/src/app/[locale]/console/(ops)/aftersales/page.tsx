'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import {
  countTicketsKpi,
  createTicket,
  useAftersaleTickets,
} from '@/lib/crossborder/aftersale-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

export default function AftersalesPage() {
  const rows = useAftersaleTickets()
  const kpi = React.useMemo(() => countTicketsKpi(rows), [rows])
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')

  const kpiItems = React.useMemo(
    () => [
      { label: '售后单', value: String(kpi.total) },
      { label: '待确认', value: String(kpi.pending) },
      { label: '已处理', value: String(kpi.approved) },
      { label: '含退货', value: String(kpi.withReturn) },
    ],
    [kpi],
  )

  const editor = open ? (
    <UedDialog
      title="登记售后"
      description="关联原订单与订单行；未收到实物时不可登记质检入库。退货实物请走「退货收货与质检」。"
      fields={[
        { key: 'order', label: '平台订单号', required: true, placeholder: '如 DZ-10021' },
        {
          key: 'sku',
          label: '订单行 / 内部 SKU',
          options: ['HSY000001001', 'HSY000001002', 'HSY000002001'],
          required: true,
        },
        { key: 'shop', label: '店铺', options: ['Daraz LK', 'Lazada MY', 'Lazada PH'] },
        {
          key: 'type',
          label: '售后类型',
          options: ['取消', '仅退款', '退货退款', '换货'],
          required: true,
        },
        { key: 'reason', label: '售后原因', type: 'textarea', required: true, fullWidth: true },
        { key: 'refund', label: '退款金额', type: 'number', required: true },
        { key: 'currency', label: '币种', options: ['USD', 'MYR', 'LKR', 'THB'], required: true },
        { key: 'returned', label: '退货数量', type: 'number', helper: '仅退款填 0' },
        {
          key: 'qc',
          label: '质检 / 回库状态',
          options: ['不适用', '待质检', '质检完成：可售', '质检完成：残次'],
          required: true,
        },
        {
          key: 'status',
          label: '售后状态',
          options: ['待确认', '已审核', '已驳回', '已入库'],
          required: true,
        },
      ]}
      onClose={() => setOpen(false)}
      onSave={(values) => {
        const result = createTicket({
          order: values.order || '',
          sku: values.sku || '',
          shop: values.shop,
          type: values.type || '退货退款',
          reason: values.reason || '',
          refund: Number(values.refund),
          currency: values.currency || 'USD',
          returned: Number(values.returned || 0),
          qc: values.qc,
          status: values.status,
        })
        if (!result.ok) {
          setNotice(result.reason)
          return
        }
        setNotice(
          `${result.row.id} 已登记。${
            result.row.returned > 0 ? '请前往退货收货与质检登记实物。' : '仅退款不新增库存。'
          }`,
        )
        setOpen(false)
      }}
    />
  ) : null

  return (
    <UedWorkspace
      title="售后管理"
      description="退款与实物退货分开记录；只有质检可售数量经退货收货面进入可用库存。"
      rows={rows}
      detailHref={(row) => `/console/aftersales/${encodeURIComponent(row.id)}`}
      searchKeys={['id', 'order', 'sku', 'type', 'reason', 'status', 'shop']}
      searchPlaceholder="搜索售后单、订单或 SKU"
      filters={[
        { label: '状态', options: ['待确认', '已审核', '已驳回', '已入库'], key: 'status' },
        { label: '类型', options: ['取消', '仅退款', '退货退款', '换货'], key: 'type' },
      ]}
      emptyText="暂无售后单。"
      addLabel="登记售后"
      onAdd={() => setOpen(true)}
      columns={[
        { key: 'id', label: '售后单号' },
        { key: 'order', label: '原订单' },
        { key: 'shop', label: '店铺' },
        { key: 'sku', label: '内部 SKU' },
        { key: 'type', label: '售后类型' },
        { key: 'reason', label: '原因' },
        {
          key: 'refund',
          label: '退款金额',
          render: (row) => `${row.refund} ${row.currency}`,
        },
        {
          key: 'returned',
          label: '退货数量',
          render: (row) => String(row.returned),
        },
        { key: 'qc', label: '质检 / 回库' },
        {
          key: 'status',
          label: '状态',
          render: (row) => (
            <Badge variant={row.status === '待确认' ? 'outline' : 'secondary'}>{row.status}</Badge>
          ),
        },
      ]}
    >
      <DetailKpiRow items={kpiItems} />
      <UedPrototypeNotice>
        取消订单释放库存的精确平台节点待确认。仅退款不虚增库存；退货实物必须先收货、质检（见退货收货与质检）。
      </UedPrototypeNotice>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <LocaleLink href="/console/aftersale-returns">退货收货与质检</LocaleLink>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <LocaleLink href="/console/aftersale-cancels">取消与退款</LocaleLink>
        </Button>
      </div>
      {editor}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </UedWorkspace>
  )
}
