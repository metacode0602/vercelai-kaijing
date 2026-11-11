'use client'

import * as React from 'react'
import { CostCalculatorEntry } from '@/components/console/cost-calculator-host'
import { LocaleLink } from '@/lib/i18n/navigation'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
} from '@/components/console/list'
import { Button } from '@workspace/ui/components/button'
import { Badge } from '@workspace/ui/components/badge'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { trpc } from '@/lib/trpc/client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

const PAGE_SIZE = 20

export default function CostsPage() {
  const [keyword, setKeyword] = React.useState('')
  const [currency, setCurrency] = React.useState('all')
  const [page, setPage] = React.useState(1)

  const listQuery = trpc.finance.listCosts.useQuery({
    page,
    pageSize: PAGE_SIZE,
    q: keyword || undefined,
    currency: currency === 'all' ? undefined : currency,
  })
  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const currencies = [...new Set(rows.map((r) => r.currency))]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">成本计算 / 定价建议</h2>
          <p className="text-sm text-muted-foreground">sku_costs 列表 · 柜次版本 · 定价建议计算器自动带出主档与费用模板</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="default" asChild>
            <LocaleLink href="/console/costs/calculator">定价建议计算器</LocaleLink>
          </Button>
          <CostCalculatorEntry label="经典成本测算" />
        </div>
      </div>

      <Alert>
        <AlertTitle>主路径已接库</AlertTitle>
        <AlertDescription>
          列表读取 sku_costs。定价建议请用「定价建议计算器」：自动带出采购价、箱规、柜次分摊、汇率与费用模板。费用来自本组织费用模板，并非平台实时同步。
        </AlertDescription>
      </Alert>

      <p className="text-sm text-muted-foreground">订单净利润请前往「利润」页查看。</p>

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={(v) => {
          setKeyword(v)
          setPage(1)
        }}
        keywordPlaceholder="SKU / 标题 / 成本类型"
        filters={[
          {
            id: 'currency',
            label: '币种',
            value: currency,
            onChange: (v) => {
              setCurrency(v)
              setPage(1)
            },
            options: currencies.map((v) => ({ value: v, label: v })),
          },
        ]}
      />

      <ConsoleListSection
        title="SKU 成本（sku_costs）"
        description={`共 ${total} 条`}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      >
        {listQuery.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">加载成本…</p>
        ) : rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>柜次</TableHead>
                <TableHead>v#</TableHead>
                <TableHead className="text-right">金额</TableHead>
                <TableHead className="text-right">到仓单价</TableHead>
                <TableHead>生效</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">
                    <LocaleLink
                      href={`/console/costs/${encodeURIComponent(row.sku)}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.sku}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.kind}</TableCell>
                  <TableCell className="font-mono text-xs">{row.containerLotId}</TableCell>
                  <TableCell className="tabular-nums">{row.versionNo}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.amount} {row.currency}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.landedUnitCost == null ? '—' : `${row.landedUnitCost} ${row.currency}`}
                  </TableCell>
                  <TableCell>{row.effectiveFrom}</TableCell>
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
