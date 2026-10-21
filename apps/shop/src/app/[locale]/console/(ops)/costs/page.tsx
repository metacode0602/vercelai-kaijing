'use client'

import * as React from 'react'
import { Calculator } from 'lucide-react'
import { CostCalculatorEntry } from '@/components/console/cost-calculator-host'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
  matchesKeyword,
} from '@/components/console/list'
import { MOCK_COSTS, costLandedTotal } from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

const CURRENCIES = [...new Set(MOCK_COSTS.map((r) => r.currency))]

export default function CostsPage() {
  const [keyword, setKeyword] = React.useState('')
  const [currency, setCurrency] = React.useState('all')

  const rows = MOCK_COSTS.filter((row) => {
    if (!matchesKeyword(keyword, row.sku, row.title)) return false
    if (currency !== 'all' && row.currency !== currency) return false
    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">成本计算</h2>
          <p className="text-sm text-muted-foreground">
            到仓成本 · 斯里兰卡税项结构 · 打开测算工作台
          </p>
        </div>
        <CostCalculatorEntry label="成本测算" />
      </div>

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        keywordPlaceholder="SKU / 标题"
        filters={[
          {
            id: 'currency',
            label: '币种',
            value: currency,
            onChange: setCurrency,
            options: CURRENCIES.map((v) => ({ value: v, label: v })),
          },
        ]}
      />

      <ConsoleListSection title="到仓成本" description={`共 ${rows.length} 条 · 点击 SKU 看详情`}>
        {rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>标题</TableHead>
                <TableHead>采购</TableHead>
                <TableHead>头程</TableHead>
                <TableHead>Customs</TableHead>
                <TableHead>PAL</TableHead>
                <TableHead>CESS</TableHead>
                <TableHead>VAT</TableHead>
                <TableHead>SSCL</TableHead>
                <TableHead>合计</TableHead>
                <TableHead>币种</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const total = costLandedTotal(row).toFixed(2)
                return (
                  <TableRow key={row.sku}>
                    <TableCell className="font-mono text-xs">
                      <LocaleLink
                        href={`/console/costs/${row.sku}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {row.sku}
                      </LocaleLink>
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        示例
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{row.title}</TableCell>
                    <TableCell className="tabular-nums">{row.purchase.toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums">{row.freight.toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums">{row.customs.toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums">{row.pal.toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums">{row.cess.toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums">{row.vat.toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums">{row.sscl.toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums font-medium">{total}</TableCell>
                    <TableCell>{row.currency}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="gap-1.5" asChild>
                        <LocaleLink href={`/console/costs/${row.sku}/recalculate`}>
                          <Calculator className="size-3.5" />
                          测算
                        </LocaleLink>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
    </div>
  )
}
