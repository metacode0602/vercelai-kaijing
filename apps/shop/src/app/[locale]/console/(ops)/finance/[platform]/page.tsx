import { notFound } from 'next/navigation'
import { PageDemoBanner } from '@/components/console/page-demo-banner'
import {
  DetailFieldGrid,
  DetailKpiRow,
  DetailPageHeader,
  DetailSection,
} from '@/components/console/detail'
import { getFinanceByPlatform } from '@/lib/crossborder/mock-data'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

interface FinanceDetailPageProps {
  params: Promise<{ platform: string }>
}

export default async function FinanceDetailPage({ params }: FinanceDetailPageProps) {
  const { platform } = await params
  const row = getFinanceByPlatform(platform)
  if (!row) notFound()

  return (
    <div className="space-y-4">
      <PageDemoBanner />
      <DetailPageHeader
        backHref="/console/finance"
        title={`${row.platform} · 财务`}
        description="营收 / 成本 / 结算粗览（示例）"
        badges={
          row.disabled ? (
            <Badge variant="outline">未接入</Badge>
          ) : (
            <Badge variant="default">MVP</Badge>
          )
        }
      />

      <DetailKpiRow
        items={[
          { label: '营收', value: row.revenue.toLocaleString() },
          { label: '成本', value: row.cost.toLocaleString() },
          { label: '净利润', value: row.profit.toLocaleString() },
          { label: '利润率', value: row.margin },
        ]}
      />

      {row.settlement ? (
        <>
          <DetailFieldGrid
            title="settlements"
            fields={[
              { label: 'id', value: row.settlement.id, mono: true },
              {
                label: 'externalSettlementId',
                value: row.settlement.externalSettlementId,
                mono: true,
              },
              { label: 'shop', value: row.settlement.shopName },
              {
                label: 'period',
                value: `${row.settlement.periodStart} → ${row.settlement.periodEnd}`,
              },
              { label: 'currency', value: row.settlement.currency },
              { label: '平台费用（粗）', value: row.fees.toLocaleString() },
            ]}
          />
          <DetailSection title="settlement_lines" description="订单净额与费用拆分（示例）">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>关联</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>备注</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {row.settlement.lines.map((line) => (
                  <TableRow key={`${line.orderExternalId}-${line.note}`}>
                    <TableCell className="font-mono text-xs">{line.orderExternalId}</TableCell>
                    <TableCell className="tabular-nums">
                      {line.amount.toFixed(2)} {row.settlement!.currency}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{line.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DetailSection>
        </>
      ) : (
        <DetailSection title="结算" description="依赖平台结算同步">
          <p className="text-sm text-muted-foreground">该平台尚未接入，无 settlements 数据。</p>
        </DetailSection>
      )}
    </div>
  )
}
