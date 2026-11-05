'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
  matchesKeyword,
  useConsolePagination,
} from '@/components/console/list'
import { DetailKpiRow } from '@/components/console/detail'
import { financeOverview, useFinanceState, useSettlements } from '@/lib/crossborder/finance-store'
import { LocaleLink } from '@/lib/i18n/navigation'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

export default function FinancePage() {
  const state = useFinanceState()
  const settlements = useSettlements()
  const overview = React.useMemo(() => financeOverview(state), [state])
  const [keyword, setKeyword] = React.useState('')
  const [status, setStatus] = React.useState('all')

  const rows = settlements.filter((row) => {
    if (!matchesKeyword(keyword, row.platform, row.shop, row.id, row.period)) return false
    if (status !== 'all' && row.status !== status) return false
    return true
  })
  const { pagedRows, pagination } = useConsolePagination(rows)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">财务中心</h2>
        <p className="text-sm text-muted-foreground">
          营收 / 成本 / 利润粗览 · 结算批次来自财务会话 · 费用拆分占位
        </p>
      </div>
      <UedPrototypeNotice>
        KPI 与结算列表聚合本地财务会话（无 tRPC / DB）。费用拆分：平台 / 物流 / 推广 / JSB / 退款 / 汇兑。
      </UedPrototypeNotice>
      <DetailKpiRow
        items={[
          { label: '订单营收（会话）', value: overview.revenue.toLocaleString() },
          { label: '商品成本', value: overview.cost.toLocaleString() },
          { label: '费用合计', value: overview.fees.toLocaleString() },
          { label: '净利润', value: overview.profit.toLocaleString() },
          {
            label: '净打款（会话）',
            value: settlements.reduce((sum, row) => sum + row.payoutAmount, 0).toLocaleString(),
          },
          { label: '利润率', value: overview.margin },
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
      </div>

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        keywordPlaceholder="账单号 / 平台 / 店铺"
        filters={[
          {
            id: 'status',
            label: '结算状态',
            value: status,
            onChange: setStatus,
            options: [
              { value: '待匹配', label: '待匹配' },
              { value: '差异待处理', label: '差异待处理' },
              { value: '已确认', label: '已确认' },
            ],
          },
        ]}
      />

      <ConsoleListSection title="结算批次" description={`共 ${rows.length} 条 · 会话内 ${overview.settlementCount} 批`} pagination={pagination}>
        {rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>账单号</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>店铺</TableHead>
                <TableHead>周期</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>差异</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    <LocaleLink
                      href={`/console/settlements/${encodeURIComponent(row.id)}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.id}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>{row.platform}</TableCell>
                  <TableCell>{row.shop}</TableCell>
                  <TableCell>{row.period}</TableCell>
                  <TableCell className="tabular-nums">
                    {row.billAmount.toLocaleString()} {row.currency}
                  </TableCell>
                  <TableCell className="tabular-nums">{row.diffAmount}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === '已确认' ? 'secondary' : 'outline'}>{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h3 className="font-medium">账户流水</h3>
            <p className="text-sm text-muted-foreground">按平台交易号去重；结算、运费、退款共用资金账户。</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>交易号</TableHead>
                <TableHead>店铺</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>金额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.accountTransactions.slice(0, 6).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.transactionNumber}</TableCell>
                  <TableCell>{row.shop}</TableCell>
                  <TableCell>{row.type} / {row.subType}</TableCell>
                  <TableCell className={row.amount < 0 ? 'text-destructive tabular-nums' : 'tabular-nums'}>
                    {row.amount.toLocaleString()} {row.currency}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h3 className="font-medium">物流费用明细</h3>
            <p className="text-sm text-muted-foreground">尾程 / 燃油 / JSB 按订单行与包裹归集。</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>订单</TableHead>
                <TableHead>费用</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>账单</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.logisticsFees.slice(0, 6).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">{row.externalOrderId}</TableCell>
                  <TableCell>{row.feeName}</TableCell>
                  <TableCell className="tabular-nums">{row.amount.toLocaleString()} {row.currency}</TableCell>
                  <TableCell className="font-mono text-xs">{row.settlementId}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
