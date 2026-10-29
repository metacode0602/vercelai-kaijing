'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type ReceiptRow = {
  id: string
  po: string
  sku: string
  arrived: number
  qcPass: number
  qcDefect: number
  shortage: number
  bin: string
  operator: string
  status: string
}

export const DEMO_RECEIPTS: ReceiptRow[] = [
  { id: 'RCV-2026-0044', po: 'PO-2026-0030', sku: 'HSY000001002', arrived: 40, qcPass: 32, qcDefect: 6, shortage: 2, bin: 'A-01-01-02', operator: '仓库员 · 兰雨晨', status: '部分入库' },
  { id: 'RCV-2026-0045', po: 'PO-2026-0031', sku: 'HSY000002001', arrived: 50, qcPass: 0, qcDefect: 0, shortage: 0, bin: 'B-02-01-01', operator: '仓库员 · 兰雨晨', status: '待质检' },
  { id: 'RCV-2026-0041', po: 'PO-2026-0028', sku: 'HSY000001001', arrived: 100, qcPass: 98, qcDefect: 2, shortage: 0, bin: 'A-01-01-01', operator: '仓库员 · 兰雨晨', status: '已入库' },
]

export default function PurchaseReceiptsPage() {
  const [rows, setRows] = React.useState<ReceiptRow[]>(DEMO_RECEIPTS)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? (
    <UedDialog
      title="登记到货批次"
      description="按采购单分批到货建单；实际到货数量与质检结果决定入库数量。"
      fields={[
        { key: 'po', label: '采购单', options: ['PO-2026-0030', 'PO-2026-0031', 'PO-2026-0028'], required: true },
        { key: 'sku', label: '内部 SKU', options: ['HSY000001001', 'HSY000001002', 'HSY000002001'], required: true },
        { key: 'arrived', label: '到货数量', type: 'number', required: true, helper: '按实际清点数量填写' },
        { key: 'boxes', label: '箱数', type: 'number', required: true },
        { key: 'qcPass', label: '质检合格数', type: 'number', helper: '质检完成后回填' },
        { key: 'qcDefect', label: '残次数量', type: 'number' },
        { key: 'shortage', label: '短少数量', type: 'number' },
        { key: 'bin', label: '上架库位', options: ['A-01-01-01', 'A-01-01-02', 'B-02-01-01'], required: true },
        { key: 'deliveryNote', label: '送货单号', placeholder: '供应商送货单 / 物流单号' },
        { key: 'operator', label: '收货操作人', required: true },
        { key: 'remark', label: '收货备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={() => {
        setRows((current) => [
          {
            id: `RCV-2026-${String(current.length + 46).padStart(4, '0')}`,
            po: 'PO-2026-0031',
            sku: 'HSY000002001',
            arrived: 20,
            qcPass: 0,
            qcDefect: 0,
            shortage: 0,
            bin: 'B-02-01-01',
            operator: '当前用户',
            status: '待质检',
          },
          ...current,
        ])
        setOpen(false)
        setNotice('到货批次已登记为「待质检」（原型）；质检合格后才形成入库流水。')
      }}
    />
  ) : null
  function qc(id: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row
        const defect = Math.min(2, Math.max(0, row.arrived - 1))
        return { ...row, qcPass: row.arrived - defect, qcDefect: defect, shortage: 0, status: '已入库' }
      }),
    )
    setNotice(`${id} 质检完成：合格数进可用库存，残次入不可售区并登记原因（原型流水）。`)
  }
  return (
    <>
      {editor}
      <UedWorkspace
        title="到货质检入库"
        description="分批到货 → 质检（合格/残次/短缺）→ 部分或整批入库；合格数量才进可用库存。"
        rows={rows} detailHref={(row) => `/console/purchase-receipts/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'po', 'sku', 'bin', 'operator', 'status']}
        searchPlaceholder="搜索收货单号、采购单或 SKU"
        filters={[{ label: '状态', options: ['待质检', '部分入库', '已入库', '退供应商'] }]}
        addLabel="登记到货"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '收货单号' },
          { key: 'po', label: '采购单' },
          { key: 'sku', label: '内部 SKU' },
          { key: 'arrived', label: '到货', render: (row) => String(row.arrived) },
          { key: 'qcPass', label: '合格', render: (row) => String(row.qcPass) },
          { key: 'qcDefect', label: '残次', render: (row) => String(row.qcDefect) },
          { key: 'shortage', label: '短缺', render: (row) => String(row.shortage) },
          { key: 'bin', label: '上架库位' },
          { key: 'operator', label: '操作人' },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '已入库' ? 'secondary' : 'outline'}>{row.status}</Badge> },
        ]}
      >
        <UedPrototypeNotice>
          合格数量才进可用库存；残次进不可售区并要求填写原因；短缺回写采购单差异，超过容忍比例需主管确认。每批入库触发库存流水（幂等键防重复记账），历史流水不可删除。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows.filter((row) => row.status === '待质检').map((row) => (
            <Button key={row.id} size="sm" onClick={() => qc(row.id)}>质检并入库 · {row.id}</Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => setNotice('残次批次可发起退供应商：生成退货物流并回写采购单（原型）。')}>退供应商</Button>
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
