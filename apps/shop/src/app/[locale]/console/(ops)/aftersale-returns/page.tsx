'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type ReturnRow = {
  id: string
  order: string
  sku: string
  tracking: string
  receivedAt: string
  qty: number
  qc: string
  restock: number
  scrap: number
  status: string
}

export const DEMO_RETURNS: ReturnRow[] = [
  { id: 'AS-2026-0081', order: 'DZ-10018', sku: 'HSY000002001', tracking: 'DZRT-5521', receivedAt: '2026-10-28 11:20', qty: 1, qc: '待质检', restock: 0, scrap: 0, status: '待质检' },
  { id: 'AS-2026-0077', order: 'LZ-2180', sku: 'HSY000001001', tracking: 'LZRT-1180', receivedAt: '2026-10-25 15:05', qty: 2, qc: '合格 1 / 残次 1', restock: 1, scrap: 1, status: '已回库' },
  { id: 'AS-2026-0070', order: 'DZ-09988', sku: 'HSY000001002', tracking: 'DZRT-5480', receivedAt: '2026-10-19 09:30', qty: 1, qc: '合格 1', restock: 1, scrap: 0, status: '已回库' },
]

export default function AftersaleReturnsPage() {
  const [rows, setRows] = React.useState<ReturnRow[]>(DEMO_RETURNS)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? (
    <UedDialog
      title="登记退货收货"
      description="寄回运单收货后才可质检；收货登记不直接增加可用库存。"
      fields={[
        { key: 'id', label: '售后单号', options: ['AS-2026-0081', 'AS-2026-0079'], required: true, helper: '关联已登记的退货退款售后单' },
        { key: 'order', label: '原订单', options: ['DZ-10018', 'DZ-10012'], required: true },
        { key: 'sku', label: '内部 SKU', options: ['HSY000002001', 'HSY000001001'], required: true },
        { key: 'tracking', label: '寄回运单号', required: true, placeholder: '平台退货物流单号' },
        { key: 'qty', label: '实收数量', type: 'number', required: true, helper: '以实际清点数量为准' },
        { key: 'bin', label: '收货库位', options: ['B-02-01-01', 'A-01-01-02'], required: true },
        { key: 'packageCondition', label: '外包装状况', options: ['完好', '轻微破损', '破损'], required: true },
        { key: 'qc', label: '质检状态', options: ['待质检', '质检中', '质检完成'], required: true },
        { key: 'remark', label: '收货备注', type: 'textarea', fullWidth: true, placeholder: '选填：异常件、缺少配件、拍照留存说明' },
      ]}
      onClose={() => setOpen(false)}
      onSave={() => {
        setRows((current) => [
          {
            id: 'AS-2026-0081',
            order: 'DZ-10018',
            sku: 'HSY000002001',
            tracking: 'DZRT-5521',
            receivedAt: '刚刚',
            qty: 1,
            qc: '待质检',
            restock: 0,
            scrap: 0,
            status: '待收货确认',
          },
          ...current,
        ])
        setOpen(false)
        setNotice('退货收货已登记（原型）；质检通过后才回库。')
      }}
    />
  ) : null
  function qcPass(id: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, qc: `合格 ${row.qty} / 残次 0`, restock: row.qty, scrap: 0, status: '已回库' } : row,
      ),
    )
    setNotice(`${id} 质检完成：可售数量 ${rows.find((row) => row.id === id)?.qty ?? 1} 形成回库流水（原型）；残次走报损。`)
  }
  function qcScrap(id: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, qc: `合格 0 / 残次 ${row.qty}`, restock: 0, scrap: row.qty, status: '已报损' } : row,
      ),
    )
    setNotice(`${id} 质检判定全部残次：进不可售区并生成报损调整单（原型）。`)
  }
  return (
    <>
      {editor}
      <UedWorkspace
        title="退货质检与回库"
        description="退货实物收货 → 质检 → 可售回库 / 残次报损；只有质检可售数量进入可用库存。"
        rows={rows} detailHref={(row) => `/console/aftersale-returns/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'order', 'sku', 'tracking', 'status']}
        searchPlaceholder="搜索售后单号、订单或寄回运单"
        filters={[{ label: '状态', options: ['待收货确认', '待质检', '已回库', '已报损'] }]}
        addLabel="登记退货收货"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '售后单号' },
          { key: 'order', label: '原订单' },
          { key: 'sku', label: '内部 SKU' },
          { key: 'tracking', label: '寄回运单' },
          { key: 'receivedAt', label: '收货时间' },
          { key: 'qty', label: '退货数量', render: (row) => String(row.qty) },
          { key: 'qc', label: '质检结果' },
          { key: 'restock', label: '可售回库', render: (row) => String(row.restock) },
          { key: 'scrap', label: '报损', render: (row) => String(row.scrap) },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '待质检' ? 'outline' : 'secondary'}>{row.status}</Badge> },
        ]}
      >
        <UedPrototypeNotice>
          收货、质检、回库三步分离：未收货不可质检，质检不合格不回可售。回库只增加可售库存，与退款金额无关；残次报损生成盘点调整单走审批。每一步都追加库存流水，历史不可删除。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows.filter((row) => row.status === '待质检').map((row) => (
            <React.Fragment key={row.id}>
              <Button size="sm" onClick={() => qcPass(row.id)}>质检合格回库 · {row.id}</Button>
              <Button variant="outline" size="sm" onClick={() => qcScrap(row.id)}>全部残次报损</Button>
            </React.Fragment>
          ))}
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
