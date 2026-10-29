'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type CancelRow = {
  id: string
  order: string
  shop: string
  sku: string
  type: string
  platformSync: string
  refund: number
  currency: string
  releaseReserved: number
  status: string
}

export const DEMO_CANCELS: CancelRow[] = [
  { id: 'AS-2026-0079', order: 'DZ-10012', shop: 'Daraz LK', sku: 'HSY000001001', type: '仅退款', platformSync: '平台已同步', refund: 3, currency: 'USD', releaseReserved: 0, status: '已审核' },
  { id: 'AS-2026-0082', order: 'LZ-2233', shop: 'Lazada MY', sku: 'HSY000001002', type: '取消订单', platformSync: '等待平台确认', refund: 6.8, currency: 'MYR', releaseReserved: 1, status: '待确认' },
  { id: 'AS-2026-0075', order: 'DZ-10004', shop: 'Daraz LK', sku: 'HSY000002001', type: '取消订单', platformSync: '平台已同步', refund: 24, currency: 'USD', releaseReserved: 0, status: '已审核' },
]

export default function AftersaleCancelsPage() {
  const [rows, setRows] = React.useState<CancelRow[]>(DEMO_CANCELS)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? (
    <UedDialog
      title="登记取消 / 仅退款"
      description="关联原订单与订单行；取消释放锁定库存的平台节点待 Q07/Q08 确认。"
      fields={[
        { key: 'order', label: '平台订单号', options: ['DZ-10012', 'LZ-2233', 'DZ-10004'], required: true, helper: '仅可选择本组织已同步订单' },
        { key: 'shop', label: '店铺', options: ['Daraz LK', 'Lazada MY', 'Lazada TH'], required: true },
        { key: 'sku', label: '订单行 SKU', options: ['HSY000001001', 'HSY000001002', 'HSY000002001'], required: true },
        { key: 'type', label: '类型', options: ['取消订单', '仅退款'], required: true },
        { key: 'reason', label: '原因', type: 'textarea', required: true, fullWidth: true, placeholder: '填写平台取消原因或客服沟通结论' },
        { key: 'refund', label: '退款金额', type: 'number', required: true },
        { key: 'currency', label: '币种', options: ['USD', 'MYR', 'LKR', 'THB'], required: true },
        { key: 'releaseReserved', label: '释放锁定库存', type: 'number', helper: '默认 0；取消订单且未发货时填写释放数量' },
        { key: 'platformSync', label: '平台同步状态', options: ['等待平台确认', '平台已同步', '同步失败'], required: true },
        { key: 'remark', label: '内部备注', type: 'textarea', fullWidth: true, placeholder: '选填：关联工单、补偿方案等' },
      ]}
      onClose={() => setOpen(false)}
      onSave={() => {
        setRows((current) => [
          {
            id: `AS-2026-${String(current.length + 83).padStart(4, '0')}`,
            order: 'LZ-2233',
            shop: 'Lazada MY',
            sku: 'HSY000001001',
            type: '仅退款',
            platformSync: '待同步平台',
            refund: 5,
            currency: 'MYR',
            releaseReserved: 0,
            status: '待确认',
          },
          ...current,
        ])
        setOpen(false)
        setNotice('取消/退款记录已登记（原型）；退款与库存释放分开记账。')
      }}
    />
  ) : null
  function approve(id: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, status: '已审核', platformSync: '平台已同步（示例）' } : row,
      ),
    )
    setNotice(`${id} 审核通过：退款记账；${rows.find((row) => row.id === id)?.releaseReserved ?? 0} 件锁定库存已释放（原型）。`)
  }
  return (
    <>
      {editor}
      <UedWorkspace
        title="取消与退款"
        description="取消订单与仅退款类售后：平台同步、审核、退款，取消时释放对应锁定库存。"
        rows={rows} detailHref={(row) => `/console/aftersale-cancels/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'order', 'shop', 'sku', 'type', 'status']}
        searchPlaceholder="搜索售后单号、订单或店铺"
        filters={[{ label: '状态', options: ['待确认', '已审核', '已驳回'] }]}
        addLabel="登记取消 / 退款"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '售后单号' },
          { key: 'order', label: '原订单' },
          { key: 'shop', label: '店铺' },
          { key: 'sku', label: '内部 SKU' },
          { key: 'type', label: '类型' },
          { key: 'platformSync', label: '平台同步' },
          { key: 'refund', label: '退款金额', render: (row) => `${row.refund} ${row.currency}` },
          { key: 'releaseReserved', label: '释放锁定', render: (row) => String(row.releaseReserved) },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '待确认' ? 'outline' : 'secondary'}>{row.status}</Badge> },
        ]}
      >
        <UedPrototypeNotice>
          仅退款不虚增库存；只有「取消订单」且货物未出库时释放锁定库存，释放量 = 该订单行已锁未出数量。取消释放锁定库存的精确平台节点待 Q07/Q08 确认。退款金额与平台账单在「平台结算对账」核对。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows.filter((row) => row.status === '待确认').map((row) => (
            <Button key={row.id} size="sm" onClick={() => approve(row.id)}>审核通过 · {row.id}</Button>
          ))}
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
