'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedPrototypeNotice, UedWorkspace } from '@/components/console/erp-ued-workspace'
import { SELL_THROUGH_SEED, sellThroughRate } from '@/lib/crossborder/daraz-ops-store'
import { Badge } from '@workspace/ui/components/badge'

type Row = (typeof SELL_THROUGH_SEED)[number] & {
  rate7: number | null
  rate30: number | null
  rate90: number | null
}

export default function SellThroughReportPage() {
  const rows: Row[] = React.useMemo(
    () =>
      SELL_THROUGH_SEED.map((row) => ({
        ...row,
        rate7: sellThroughRate(row.sold7, row.avgStock7, !row.isNewUnder7d),
        rate30: sellThroughRate(row.sold30, row.avgStock30, true),
        rate90: sellThroughRate(row.sold90, row.avgStock90, true),
      })),
    [],
  )
  const inDenom7 = rows.filter((r) => r.rate7 != null).length

  return (
    <UedWorkspace
      title="动销率"
      description="F20 · 7/30/90 天动销率 = 销量 ÷ 平均库存。新品未满 7 天不进入 7 日分母。"
      rows={rows}
      searchKeys={['sku', 'name', 'shop']}
      searchPlaceholder="搜索 SKU / 店铺"
      columns={[
        { key: 'sku', label: 'SKU' },
        { key: 'name', label: '商品' },
        { key: 'shop', label: '店铺' },
        { key: 'listedAt', label: '上架日' },
        {
          key: 'rate7',
          label: '7 日动销%',
          render: (row) =>
            row.rate7 == null ? (
              <Badge variant="outline">未满7天·不计分母</Badge>
            ) : (
              <span className="tabular-nums">{row.rate7}%</span>
            ),
        },
        { key: 'rate30', label: '30 日%', render: (row) => <span className="tabular-nums">{row.rate30}%</span> },
        { key: 'rate90', label: '90 日%', render: (row) => <span className="tabular-nums">{row.rate90}%</span> },
        { key: 'sold30', label: '30日销量', render: (row) => String(row.sold30) },
      ]}
    >
      <DetailKpiRow
        items={[
          { label: 'SKU 数', value: String(rows.length) },
          { label: '7日分母SKU', value: String(inDenom7), hint: '排除未满7天新品' },
          { label: '平台', value: 'Daraz LK' },
        ]}
      />
      <UedPrototypeNotice>示例数据；正式口径需杨洁确认日期维度与库存平均算法。P2 评论抓取（Q36）不在此页。</UedPrototypeNotice>
    </UedWorkspace>
  )
}
