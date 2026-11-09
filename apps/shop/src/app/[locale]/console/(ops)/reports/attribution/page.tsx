'use client'

import * as React from 'react'
import { DetailKpiRow } from '@/components/console/detail'
import { UedWorkspace } from '@/components/console/erp-ued-workspace'
import { ATTRIBUTION_REASON_LABELS, ATTRIBUTION_SEED } from '@/lib/crossborder/daraz-ops-store'
import { Button } from '@workspace/ui/components/button'

export default function AttributionBoardPage() {
  const rows = ATTRIBUTION_SEED
  const [notice, setNotice] = React.useState('')
  const totalBad = rows.reduce((s, r) => s + r.badReviews, 0)

  return (
    <UedWorkspace
      title="差评 / 退货归因看板"
      description="F30 · 按 SKU 汇总差评与退货；五类原因：质量 / 尺码规格 / 物流 / 描述不符 / 其他。下钻为 stub。"
      rows={rows}
      searchKeys={['sku', 'name']}
      columns={[
        { key: 'sku', label: 'SKU' },
        { key: 'name', label: '商品' },
        { key: 'badReviews', label: '差评数', render: (r) => String(r.badReviews) },
        { key: 'returns', label: '退货数', render: (r) => String(r.returns) },
        { key: 'quality', label: ATTRIBUTION_REASON_LABELS.quality, render: (r) => String(r.reasons.quality) },
        { key: 'size', label: ATTRIBUTION_REASON_LABELS.size, render: (r) => String(r.reasons.size) },
        { key: 'logistics', label: ATTRIBUTION_REASON_LABELS.logistics, render: (r) => String(r.reasons.logistics) },
        { key: 'description', label: ATTRIBUTION_REASON_LABELS.description, render: (r) => String(r.reasons.description) },
        { key: 'other', label: ATTRIBUTION_REASON_LABELS.other, render: (r) => String(r.reasons.other) },
        {
          key: 'drill',
          label: '下钻',
          render: (r) => (
            <Button size="sm" variant="ghost" onClick={() => setNotice(`下钻 stub：${r.sku} 评论明细（P2 Q36 抓取未接）`)}>
              查看评论
            </Button>
          ),
        },
      ]}
    >
      <DetailKpiRow
        items={[
          { label: '差评合计', value: String(totalBad) },
          { label: 'SKU 数', value: String(rows.length) },
          { label: '原因类', value: '5' },
        ]}
      />
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </UedWorkspace>
  )
}
