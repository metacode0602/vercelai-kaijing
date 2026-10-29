'use client'

import * as React from 'react'
import { UedDialog, UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'

type SettlementRow = {
  id: string
  platform: string
  shop: string
  period: string
  billAmount: number
  currency: string
  matchedOrders: number
  diffAmount: number
  status: string
}

export const DEMO_SETTLEMENTS: SettlementRow[] = [
  { id: 'STL-DZ-2026-10-LK', platform: 'Daraz', shop: 'Daraz LK', period: '2026-10 上半月', billAmount: 4820.55, currency: 'USD', matchedOrders: 148, diffAmount: -12.4, status: '差异待处理' },
  { id: 'STL-LZ-2026-09-MY', platform: 'Lazada', shop: 'Lazada MY', period: '2026-09 下半月', billAmount: 12640.2, currency: 'MYR', matchedOrders: 216, diffAmount: 0, status: '已确认' },
  { id: 'STL-LZ-2026-10-TH', platform: 'Lazada', shop: 'Lazada TH', period: '2026-10 上半月', billAmount: 35800, currency: 'THB', matchedOrders: 97, diffAmount: 356, status: '待匹配' },
]

export default function SettlementsPage() {
  const [rows, setRows] = React.useState<SettlementRow[]>(DEMO_SETTLEMENTS)
  const [open, setOpen] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const editor = open ? (
    <UedDialog
      title="导入平台账单"
      description="上传平台结算账单后自动按订单匹配；差异行进入处理队列，确认后锁定期间。"
      fields={[
        { key: 'platform', label: '平台', options: ['Daraz', 'Lazada', 'TikTok'], required: true },
        { key: 'shop', label: '店铺', options: ['Daraz LK', 'Lazada MY', 'Lazada TH'], required: true },
        { key: 'period', label: '结算周期', required: true, placeholder: '如 2026-10 上半月' },
        { key: 'file', label: '账单文件名', required: true },
        { key: 'currency', label: '账单币种', options: ['USD', 'MYR', 'THB', 'PHP', 'SGD', 'VND'], required: true },
        { key: 'billAmount', label: '账单总额', type: 'number' },
        { key: 'periodStart', label: '账期开始', type: 'date', required: true },
        { key: 'periodEnd', label: '账期结束', type: 'date', required: true },
        { key: 'remark', label: '导入备注', type: 'textarea', fullWidth: true },
      ]}
      onClose={() => setOpen(false)}
      onSave={() => {
        setRows((current) => [
          {
            id: `STL-IMP-${String(current.length + 1).padStart(4, '0')}`,
            platform: 'Daraz',
            shop: 'Daraz LK',
            period: '2026-10 下半月',
            billAmount: 0,
            currency: 'USD',
            matchedOrders: 0,
            diffAmount: 0,
            status: '待匹配',
          },
          ...current,
        ])
        setOpen(false)
        setNotice('账单已导入为待匹配批次（原型）；自动匹配完成后差异行会出现在本列表。')
      }}
    />
  ) : null
  function confirm(id: string) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status: '已确认', diffAmount: 0 } : row)))
    setNotice(`${id} 已确认：期间账单锁定，确认事件记入审计（原型）。`)
  }
  return (
    <>
      {editor}
      <UedWorkspace
        title="平台结算对账"
        description="导入平台账单 → 自动匹配订单 → 处理差异 → 确认锁定；对账口径按原币分列。"
        rows={rows} detailHref={(row) => `/console/settlements/${encodeURIComponent(row.id)}`}
        searchKeys={['id', 'platform', 'shop', 'period', 'status']}
        searchPlaceholder="搜索账单号、平台或店铺"
        filters={[{ label: '状态', options: ['待匹配', '差异待处理', '已确认'] }]}
        addLabel="导入平台账单"
        onAdd={() => setOpen(true)}
        columns={[
          { key: 'id', label: '账单号' },
          { key: 'platform', label: '平台' },
          { key: 'shop', label: '店铺' },
          { key: 'period', label: '结算周期' },
          { key: 'billAmount', label: '账单金额', render: (row) => `${row.billAmount.toLocaleString()} ${row.currency}` },
          { key: 'matchedOrders', label: '匹配订单', render: (row) => String(row.matchedOrders) },
          { key: 'diffAmount', label: '差异', render: (row) => <span className={row.diffAmount !== 0 ? 'text-destructive tabular-nums' : 'tabular-nums'}>{row.diffAmount === 0 ? '0' : `${row.diffAmount > 0 ? '+' : ''}${row.diffAmount}`}</span> },
          { key: 'status', label: '状态', render: (row) => <Badge variant={row.status === '已确认' ? 'secondary' : row.status === '差异待处理' ? 'destructive' : 'outline'}>{row.status}</Badge> },
        ]}
      >
        <UedPrototypeNotice>
          账单费用来源（佣金/物流/推广/罚款）与差异处理规则待财务确认；蔡值为只读角色，不能执行导入与确认。差异处理保留「账单行 ↔ 订单 ↔ 处理结论」三元审计记录，确认后期间不可再导入。
        </UedPrototypeNotice>
        <div className="flex flex-wrap gap-2">
          {rows.filter((row) => row.status === '差异待处理').map((row) => (
            <Button key={row.id} variant="outline" size="sm" onClick={() => setNotice(`${row.id}：差异 ${row.diffAmount} ${row.currency}，定位到 2 笔未匹配订单 + 1 笔多收物流费（示例）。`)}>处理差异 · {row.id}</Button>
          ))}
          {rows.filter((row) => row.status !== '已确认').map((row) => (
            <Button key={`ok-${row.id}`} size="sm" onClick={() => confirm(row.id)}>确认账单 · {row.id}</Button>
          ))}
        </div>
        {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      </UedWorkspace>
    </>
  )
}
