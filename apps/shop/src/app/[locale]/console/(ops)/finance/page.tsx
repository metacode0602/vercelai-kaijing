'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
} from '@/components/console/list'
import { DetailKpiRow } from '@/components/console/detail'
import { LocaleLink } from '@/lib/i18n/navigation'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

const PAGE_SIZE = 20

export default function FinancePage() {
  const [keyword, setKeyword] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [page, setPage] = React.useState(1)

  const overviewQuery = trpc.finance.overview.useQuery()
  const listQuery = trpc.finance.listSettlements.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: keyword || undefined,
    status: status === 'all' ? undefined : status,
  })

  const overview = overviewQuery.data
  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">财务中心</h2>
        <p className="text-sm text-muted-foreground">
          营收 / 成本 / 利润粗览 · 结算批次来自 settlements · 费用按明细汇总（未写死税费）
        </p>
      </div>
      <UedPrototypeNotice>
        已接 PostgreSQL（settlements / sku_costs / orders）。不假装平台结算 OpenAPI 已通；无结算订单在利润页显示「未结算」。
      </UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '订单营收', value: (overview?.revenue ?? 0).toLocaleString() },
          { label: '商品成本', value: (overview?.cost ?? 0).toLocaleString() },
          { label: '费用合计', value: (overview?.fees ?? 0).toLocaleString() },
          { label: '净利润', value: (overview?.profit ?? 0).toLocaleString() },
          { label: '净打款', value: (overview?.payoutTotal ?? 0).toLocaleString() },
          { label: '利润率', value: overview?.margin ?? '—' },
        ]}
      />

      <div className="flex flex-wrap gap-2 text-sm">
        <LocaleLink className="underline-offset-2 hover:underline" href="/console/settlements">
          平台结算对账
        </LocaleLink>
        <LocaleLink className="underline-offset-2 hover:underline" href="/console/profits">
          订单 / SKU 利润
        </LocaleLink>
        <LocaleLink className="underline-offset-2 hover:underline" href="/console/costs">
          成本表
        </LocaleLink>
        <LocaleLink className="underline-offset-2 hover:underline" href="/console/freight">
          运费估算
        </LocaleLink>
      </div>

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={(v) => {
          setKeyword(v)
          setPage(1)
        }}
        keywordPlaceholder="账单号 / 平台 / 店铺"
        filters={[
          {
            id: 'status',
            label: '结算状态',
            value: status,
            onChange: (v) => {
              setStatus(v)
              setPage(1)
            },
            options: [
              { value: '待匹配', label: '待匹配' },
              { value: '差异待处理', label: '差异待处理' },
              { value: '已确认', label: '已确认' },
              { value: '已打款', label: '已打款' },
            ],
          },
        ]}
      />

      <ConsoleListSection
        title="结算批次"
        description={`共 ${total} 条 · DB settlements`}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total,
          onPageChange: setPage,
        }}
      >
        {listQuery.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">加载结算…</p>
        ) : rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>结算单</TableHead>
                <TableHead>平台 / 店铺</TableHead>
                <TableHead>账期</TableHead>
                <TableHead className="text-right">账单额</TableHead>
                <TableHead className="text-right">费用</TableHead>
                <TableHead className="text-right">打款</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">
                    <LocaleLink
                      href={`/console/settlements/${encodeURIComponent(row.id)}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.externalSettlementId}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>
                    {row.platform} / {row.shop}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.period}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.billAmount.toLocaleString()} {row.currency}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.feesTotal.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.payoutAmount.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
    </div>
  )
}
