'use client'

import * as React from 'react'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { NativeSelect, NativeSelectOption } from '@workspace/ui/components/native-select'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ERP_DEMO_INVENTORY, ERP_DEMO_PURCHASES, ERP_DEMO_PRODUCTS } from '@/lib/crossborder/erp-ued-data'

type ReportRow = { dimension: string; orders: number; units: number; sales: string; inventory: number; inbound: number; note: string }

const baseRows: ReportRow[] = [
  { dimension: 'Lazada / MY', orders: 28, units: 36, sales: 'MYR 1,840', inventory: 46, inbound: 60, note: '示例汇总' },
  { dimension: 'Daraz / LK', orders: 19, units: 24, sales: 'USD 712', inventory: 97, inbound: 0, note: '示例汇总' },
  { dimension: '全平台（原币分列）', orders: 47, units: 60, sales: '需汇率确认', inventory: 143, inbound: 60, note: '暂不跨币种相加' },
]

export default function ReportsPage() {
  const [rows] = React.useState(baseRows)
  const [notice, setNotice] = React.useState('')
  const count = ERP_DEMO_PRODUCTS.length + ERP_DEMO_PURCHASES.length + ERP_DEMO_INVENTORY.length
  return <UedWorkspace title="报表中心" description="销售、库存与采购数据可下钻；汇率口径确认前按原币分列。" rows={rows} searchKeys={['dimension', 'sales', 'note']} searchPlaceholder="搜索平台、站点或指标" columns={[
    { key: 'dimension', label: '维度' }, { key: 'orders', label: '订单数' }, { key: 'units', label: '销售件数' }, { key: 'sales', label: '销售金额 / 币种' }, { key: 'inventory', label: '实际库存' }, { key: 'inbound', label: '采购在途' }, { key: 'note', label: '口径状态' },
  ]}>
    <UedPrototypeNotice>仪表盘指标、利润和跨币种合计当前均为示例/待确认规则；日期、订单状态、汇率及费用分摊口径冻结后才能视为正式报表。</UedPrototypeNotice>
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4"><div className="flex flex-col gap-2"><label className="text-xs text-muted-foreground">日期范围</label><Input type="date" defaultValue="2026-10-01" /></div><div className="flex flex-col gap-2"><label className="text-xs text-muted-foreground">平台 / 站点</label><NativeSelect defaultValue="all"><NativeSelectOption value="all">全部平台</NativeSelectOption><NativeSelectOption value="lazada">Lazada</NativeSelectOption><NativeSelectOption value="daraz">Daraz</NativeSelectOption></NativeSelect></div><Button variant="outline" onClick={() => setNotice(`当前筛选展示 ${count} 条关联示例主数据，尚未查询服务器。`)}>查询</Button><Button variant="outline" onClick={() => setNotice('已导出当前示例筛选（原型动作，无文件下载）。')}>导出</Button></div>
    <div className="flex flex-wrap gap-2">{['订单数', '销售金额', '库存', '在途采购'].map((label) => <Button key={label} variant="secondary" size="sm" onClick={() => setNotice(`${label}：点击后应下钻至同筛选条件明细列表。`)}>{label} · 查看明细</Button>)}</div>{notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
  </UedWorkspace>
}
