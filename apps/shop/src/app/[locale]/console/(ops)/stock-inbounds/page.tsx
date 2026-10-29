'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type InboundRow = {
  id: string
  sourceType: string
  sourceDoc: string
  sku: string
  quantity: number
  qcResult: string
  bin: string
  operator: string
  at: string
  status: string
}

export const DEMO_INBOUNDS: InboundRow[] = [
  { id: 'IN-2026-0052', sourceType: '采购入库', sourceDoc: 'RCV-2026-0041', sku: 'HSY000001001', quantity: 98, qcResult: '合格 98 / 残次 2', bin: 'A-01-01-01', operator: '兰雨晨', at: '2026-10-26 15:20', status: '已上架' },
  { id: 'IN-2026-0053', sourceType: '采购入库', sourceDoc: 'RCV-2026-0044', sku: 'HSY000001002', quantity: 32, qcResult: '合格 32 / 残次 6', bin: 'A-01-01-02', operator: '兰雨晨', at: '2026-10-28 10:05', status: '待上架' },
  { id: 'IN-2026-0054', sourceType: '售后回库', sourceDoc: 'AS-2026-0081', sku: 'HSY000002001', quantity: 1, qcResult: '质检合格可售 1', bin: 'B-02-01-01', operator: '仓库员', at: '2026-10-28 11:40', status: '待上架' },
]

export default function StockInboundsPage() {
  const [rows, setRows] = React.useState<InboundRow[]>(DEMO_INBOUNDS)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? (
    <UedDialog
      title="手工创建入库单"
      description="入库必须关联来源单据；无来源单的手工入库需选择原因并走审批。"
      fields={[
        { key: 'sourceType', label: '入库类型', options: ['采购入库', '售后回库', '盘盈入库', '调拨入库'], required: true },
        { key: 'sourceDoc', label: '来源单号', options: ['RCV-2026-0044', 'AS-2026-0081', 'ADJ-2026-0018'], required: true },
        { key: 'sku', label: '内部 SKU', options: ['HSY000001001', 'HSY000001002', 'HSY000002001'], required: true },
        { key: 'quantity', label: '数量', type: 'number', required: true },
        { key: 'bin', label: '目标库位', options: ['A-01-01-01', 'A-01-01-02', 'B-02-01-01'], required: true },
        { key: 'qcResult', label: '质检结果', type: 'textarea', fullWidth: true, placeholder: '如 合格 98 / 残次 2' },
        { key: 'operator', label: '操作人', required: true },
        { key: 'remark', label: '备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={() => {
        setRows((current) => [
          {
            id: `IN-2026-${String(current.length + 55).padStart(4, '0')}`,
            sourceType: '采购入库',
            sourceDoc: 'RCV-2026-0044',
            sku: 'HSY000001002',
            quantity: 10,
            qcResult: '待质检',
            bin: 'A-01-01-02',
            operator: '当前用户',
            at: '刚刚',
            status: '待上架',
          },
          ...current,
        ])
        setOpen(false)
        setNotice('入库单已创建（原型）；确认上架后才生成库存流水。')
      }}
    />
  ) : null
  function shelve(id: string) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status: '已上架' } : row)))
    setNotice(`${id} 已上架：对应库位实际库存增加，库存流水按幂等键记账（原型）。`)
  }
  return (
    <>
      {editor}
      <UedWorkspace
        title="入库单"
        description="采购收货、售后回库、盘盈与调拨的统一入库入口；上架确认触发库存流水。"
        rows={rows} detailHref={(row) => `/console/stock-inbounds/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'sourceDoc', 'sku', 'bin', 'operator', 'status']}
        searchPlaceholder="搜索入库单号、来源单或 SKU"
        filters={[{ label: '状态', options: ['待上架', '已上架', '已取消'] }]}
        addLabel="创建入库单"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '入库单号' },
          { key: 'sourceType', label: '入库类型' },
          { key: 'sourceDoc', label: '来源单据' },
          { key: 'sku', label: '内部 SKU' },
          { key: 'quantity', label: '数量', render: (row) => String(row.quantity) },
          { key: 'qcResult', label: '质检结果' },
          { key: 'bin', label: '目标库位' },
          { key: 'operator', label: '操作人' },
          { key: 'at', label: '时间' },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '已上架' ? 'secondary' : 'outline'}>{row.status}</Badge> },
        ]}
      >
        <UedPrototypeNotice>
          每张入库单必须关联来源单据（收货单/售后单/盘点单/调拨单），来源单不可为草稿。上架按「库位+SKU」写入实际库存，同时追加库存流水；重复提交被幂等键拦截。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows.filter((row) => row.status === '待上架').map((row) => (
            <Button key={row.id} size="sm" onClick={() => shelve(row.id)}>确认上架 · {row.id}</Button>
          ))}
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
