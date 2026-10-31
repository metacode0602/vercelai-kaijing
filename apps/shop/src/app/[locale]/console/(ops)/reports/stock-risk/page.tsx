'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { STOCK_RISK_SEED } from '@/lib/crossborder/daraz-ops-store'
import { Badge } from '@workspace/ui/components/badge'

export default function StockRiskReportPage() {
  const rows = STOCK_RISK_SEED
  const slow = rows.filter((r) => r.flag === '滞销').length
  const stockout = rows.filter((r) => r.flag === '断货风险').length

  return (
    <UedWorkspace
      title="滞销 / 断货预警"
      description="F21 · 滞销=90天零动销；断货风险看本地可售天数；可售天数含在途/清关（按 ETA 仓简化合计）。"
      rows={rows}
      searchKeys={['sku', 'name', 'flag']}
      filters={[{ label: '标记', options: ['滞销', '断货风险', '正常', '新品观察'] }]}
      columns={[
        { key: 'sku', label: 'SKU' },
        { key: 'name', label: '商品' },
        { key: 'available', label: '本地可用', render: (r) => String(r.available) },
        { key: 'inTransit', label: '在途', render: (r) => String(r.inTransit) },
        { key: 'customsClearing', label: '清关中', render: (r) => String(r.customsClearing) },
        { key: 'dailySales30', label: '日均销(30d)', render: (r) => String(r.dailySales30) },
        {
          key: 'daysOfCoverLocal',
          label: '可售天(本地)',
          render: (r) => (r.daysOfCoverLocal == null ? '∞/无销' : String(r.daysOfCoverLocal)),
        },
        {
          key: 'daysOfCoverWithEta',
          label: '可售天(含在途ETA)',
          render: (r) => (r.daysOfCoverWithEta == null ? '∞/无销' : String(r.daysOfCoverWithEta)),
        },
        { key: 'etaWarehouse', label: '最近ETA仓' },
        {
          key: 'flag',
          label: '标记',
          render: (r) => (
            <Badge variant={r.flag === '断货风险' || r.flag === '滞销' ? 'destructive' : 'secondary'}>{r.flag}</Badge>
          ),
        },
      ]}
    >
      <DetailKpiRow
        items={[
          { label: '滞销 SKU', value: String(slow) },
          { label: '断货风险', value: String(stockout) },
          { label: '监控 SKU', value: String(rows.length) },
        ]}
      />
      <UedPrototypeNotice>
        在途/清关数量来自 F22 柜次投影思路。可售天数公式原型： (可用+在途+清关)/日均销；分段 ETA 折现待黄发聪确认。
      </UedPrototypeNotice>
    </UedWorkspace>
  )
}
