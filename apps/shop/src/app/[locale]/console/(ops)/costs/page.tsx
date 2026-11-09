'use client'

import * as React from 'react'
import { CostCalculatorEntry } from '@/components/console/cost-calculator-host'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
} from '@/components/console/list'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
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
          <h2 className="text-xl font-semibold tracking-tight">成本计算</h2>
          <p className="text-sm text-muted-foreground">sku_costs 列表 · 柜次版本 · 测算工作台仍可本机试算</p>
        </div>
        <CostCalculatorEntry label="成本测算" />
      </div>

      <Alert>
        <AlertTitle>主路径已接库</AlertTitle>
        <AlertDescription>
          列表读取 sku_costs；测算工作台可继续本地试算。税费/运价不写死，以费用模板与柜次字段为准。
        </AlertDescription>
      </Alert>

      <UedPrototypeNotice>
        订单净利润请前往「利润」页查看。
      </UedPrototypeNotice>

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
