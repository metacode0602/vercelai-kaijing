'use client'

import * as React from 'react'
import { DetailFieldGrid, DetailKpiRow, DetailPageHeader, DetailSection } from '@/components/console/detail'
import { ConsoleBreadcrumbRegistration } from '@/components/console/console-breadcrumbs-context'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { trpc } from '@/lib/trpc/client'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

export default function ProfitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const detailQuery = trpc.finance.getProfit.useQuery({ id })
  const row = detailQuery.data

  if (detailQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">加载利润…</p>
  }
  if (!row) {
    return (
      <Alert variant="destructive">
        <AlertTitle>未找到</AlertTitle>
        <AlertDescription>无利润行 {id}。可从利润列表进入。</AlertDescription>
      </Alert>
    )
  }
  const b = row.breakdown
  return (
    <div className="space-y-4">
      <ConsoleBreadcrumbRegistration
        items={[
          { label: '订单与 SKU 利润', href: '/console/profits' },
          { label: row.id },
        ]}
      />
      <DetailPageHeader
        backHref="/console/profits"
        backLabel="利润列表"
        title={row.id}
        description={`${row.dimension} · ${row.view === 'order' ? '订单' : 'SKU'} 维度`}
      />
      <DetailKpiRow
        items={[
          { label: '收入', value: row.revenue.toLocaleString() },
          { label: '成本', value: row.cost.toLocaleString() },
          { label: '费用', value: row.fees.toLocaleString() },
          { label: '利润', value: row.profit.toLocaleString() },
          { label: '利润率', value: row.margin },
        ]}
      />
      <DetailFieldGrid
        fields={[
          { label: '单据/SKU', value: row.id, mono: true },
          { label: '维度', value: row.dimension },
          { label: '币种口径', value: row.fx },
          {
            label: '费用拆分',
            value: `平台 ${b.platform} / 物流 ${b.logistics} / 推广 ${b.ads} / JSB ${b.jsb} / 退款 ${b.refunds} / 汇兑 ${b.fx}`,
          },
          { label: '退款', value: String(row.refund) },
          {
            label: '状态',
            value: <Badge variant={row.status === '未结算' ? 'outline' : 'secondary'}>{row.status}</Badge>,
          },
        ]}
        columns={3}
      />
      <DetailSection title="费用下钻">
        {row.feeLines.length === 0 ? (
          <p className="text-sm text-muted-foreground">无结算/物流费用行。</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>来源</TableHead>
                <TableHead>结算单</TableHead>
                <TableHead>费用类型</TableHead>
                <TableHead>订单</TableHead>
                <TableHead className="text-right">金额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {row.feeLines.map((line) => (
                <TableRow key={`${line.source}:${line.id}`}>
                  <TableCell className="text-xs">{line.source}</TableCell>
                  <TableCell className="font-mono text-xs">{line.settlementId || '—'}</TableCell>
                  <TableCell className="text-xs">
                    {line.feeKind}/{line.feeType}
                  </TableCell>
                  <TableCell className="text-xs">{line.order}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {line.amount.toLocaleString()} {line.currency}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DetailSection>
    </div>
  )
}
