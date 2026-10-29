'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type PickRow = {
  id: string
  order: string
  shop: string
  site: string
  items: number
  skus: string
  weight: string
  tracking: string
  picker: string
  status: string
}

export const DEMO_PICKS: PickRow[] = [
  { id: 'PKG-2026-0051', order: 'DZ-10021', shop: 'Daraz LK', site: 'LK', items: 2, skus: 'HSY000001001 ×2', weight: '待称重', tracking: '待生成', picker: '—', status: '待拣货' },
  { id: 'PKG-2026-0050', order: 'LZ-2201', shop: 'Lazada TH', site: 'TH', items: 1, skus: 'HSY000002001 ×1', weight: '480 g', tracking: 'THJSB-8821', picker: '兰雨晨', status: '已复核' },
  { id: 'PKG-2026-0044', order: 'DZ-10018', shop: 'Daraz LK', site: 'LK', items: 1, skus: 'HSY000002001 ×1', weight: '460 g', tracking: 'DZLK9981', picker: '兰雨晨', status: '已出库' },
]

export default function PickingPage() {
  const [rows, setRows] = React.useState<PickRow[]>(DEMO_PICKS)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? (
    <UedDialog
      title="补建拣货单"
      description="正常由订单自动生成；漏单补建需订单已完成映射且未占用其他包裹。"
      fields={[
        { key: 'order', label: '订单', options: ['DZ-10021', 'LZ-2201', 'DZ-10018'], required: true },
        { key: 'shop', label: '店铺', options: ['Daraz LK', 'Lazada TH', 'Lazada MY'], required: true },
        { key: 'site', label: '站点', options: ['LK', 'TH', 'MY', 'PH'], required: true },
        { key: 'sku', label: '内部 SKU', options: ['HSY000001001', 'HSY000001002', 'HSY000002001'], required: true },
        { key: 'quantity', label: '数量', type: 'number', required: true },
        { key: 'bin', label: '拣货库位', options: ['A-01-01-01', 'A-01-01-02', 'B-02-01-01'], required: true },
        { key: 'picker', label: '拣货人', placeholder: '默认当前用户' },
        { key: 'weight', label: '预估重量（g）', type: 'number' },
        { key: 'remark', label: '补建原因', type: 'textarea', fullWidth: true, required: true, placeholder: '说明漏单原因与关联订单' },
      ]}
      onClose={() => setOpen(false)}
      onSave={() => {
        setRows((current) => [
          {
            id: `PKG-2026-${String(current.length + 52).padStart(4, '0')}`,
            order: 'DZ-10021',
            shop: 'Daraz LK',
            site: 'LK',
            items: 1,
            skus: 'HSY000001001 ×1',
            weight: '待称重',
            tracking: '待生成',
            picker: '当前用户',
            status: '待拣货',
          },
          ...current,
        ])
        setOpen(false)
        setNotice('拣货单已补建（原型）；重复出库保护已按订单行校验。')
      }}
    />
  ) : null
  function advance(id: string) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row
        const next = row.status === '待拣货' ? '拣货中' : row.status === '拣货中' ? '已复核' : row.status === '已复核' ? '已出库' : row.status
        const weight = next === '已复核' && row.weight === '待称重' ? '470 g' : row.weight
        const tracking = next === '已出库' && row.tracking === '待生成' ? `TRK-${id.slice(-4)}` : row.tracking
        return { ...row, status: next, weight, tracking, picker: row.picker === '—' ? '当前用户' : row.picker }
      }),
    )
    setNotice(`${id} 已推进（原型）；出库时与库存流水同事务扣减，面单号回写包裹。`)
  }
  return (
    <>
      {editor}
      <UedWorkspace
        title="拣货打包发货"
        description="按订单生成拣货单：拣货 → 复核 → 称重 → 生成面单 → 出库交接，防重复出库。"
        rows={rows} detailHref={(row) => `/console/picking/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'order', 'shop', 'skus', 'tracking', 'picker', 'status']}
        searchPlaceholder="搜索包裹号、订单、店铺或运单号"
        filters={[{ label: '状态', options: ['待拣货', '拣货中', '已复核', '已出库'] }]}
        addLabel="补建拣货单"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '包裹 / 拣货单' },
          { key: 'order', label: '订单号' },
          { key: 'shop', label: '店铺 / 站点', render: (row) => `${row.shop} · ${row.site}` },
          { key: 'items', label: '件数', render: (row) => String(row.items) },
          { key: 'skus', label: 'SKU 明细' },
          { key: 'weight', label: '称重' },
          { key: 'tracking', label: '面单 / 运单号' },
          { key: 'picker', label: '拣货人' },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '已出库' ? 'secondary' : 'outline'}>{row.status}</Badge> },
        ]}
      >
        <UedPrototypeNotice>
          同一订单行只允许一个未出库包裹，重复出库由服务端幂等拦截。称重与面单在复核后必填；面单号回写包裹与物流任务。库存扣减发生在「出库」动作，与出库流水一致。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows.filter((row) => row.status !== '已出库').map((row) => (
            <Button key={row.id} variant="outline" size="sm" onClick={() => advance(row.id)}>推进 · {row.id}（{row.status}）</Button>
          ))}
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
