'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
  matchesKeyword,
  useConsolePagination,
} from '@/components/console/list'
import { MOCK_CANDIDATES } from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { labelStatus, labeledOptions } from '@/lib/console/labels'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'

const DECISION_OPTIONS = [
  { value: 'all', label: '全部决策' },
  ...[...new Set(MOCK_CANDIDATES.map((row) => row.goNoGo))].map((value) => ({ value: String(value), label: labelStatus(String(value)) })),
] satisfies { value: string; label: string }[]

const STATUSES = [...new Set(MOCK_CANDIDATES.map((r) => r.status))] as string[]
const CATEGORIES = [...new Set(MOCK_CANDIDATES.map((r) => r.categoryHint))] as string[]

export default function CandidatesPage() {
  const [keyword, setKeyword] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [goNoGo, setGoNoGo] = React.useState('all')
  const [category, setCategory] = React.useState('all')

  const rows = MOCK_CANDIDATES.filter((row) => {
    if (!matchesKeyword(keyword, row.title, row.id, row.categoryHint)) return false
    if (status !== 'all' && row.status !== status) return false
    if (goNoGo !== 'all' && row.goNoGo !== goNoGo) return false
    if (category !== 'all' && row.categoryHint !== category) return false
    return true
  })
  const { pagedRows, pagination } = useConsolePagination(rows)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">AI 选品</h2>
        <p className="text-sm text-muted-foreground">候选列表 · 查看证据、数据状态和成本情景后再决定下一步</p>
      </div>

      <Alert>
        <AlertTitle>UED 演示数据</AlertTitle>
        <AlertDescription>
          页面中的市场、评分和成本均为示例或估算，尚未连接真实数据，也不会保存到业务数据库。不要将示例结论当成采购或上架建议。
        </AlertDescription>
      </Alert>

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        keywordPlaceholder="产品 / ID / 类目"
        filters={[
          {
            id: 'status',
            label: '状态',
            value: status,
            onChange: setStatus,
            options: labeledOptions(STATUSES),
          },
          {
            id: 'go',
            label: '决策',
            value: goNoGo,
            onChange: setGoNoGo,
            options: DECISION_OPTIONS,
          },
          {
            id: 'category',
            label: '类目',
            value: category,
            onChange: setCategory,
            options: CATEGORIES.map((v) => ({ value: v, label: v })),
          },
        ]}
      />

      <ConsoleListSection title="候选列表" description={`共 ${rows.length} 条`} pagination={pagination}>
        {rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>产品</TableHead>
                <TableHead>类目</TableHead>
                <TableHead>到仓成本（估算）</TableHead>
                <TableHead>建议售价（估算）</TableHead>
                <TableHead>经营净利率（估算）</TableHead>
                <TableHead>证据状态</TableHead>
                <TableHead>潜力（示例）</TableHead>
                <TableHead>决策</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    <LocaleLink
                      href={`/console/candidates/${row.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.title}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.categoryHint}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.landedCost.toFixed(2)} {row.currency}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.suggestPrice.toFixed(2)} {row.currency}
                  </TableCell>
                  <TableCell className="tabular-nums">{row.marginPct}% <span className="text-muted-foreground">估算</span></TableCell>
                  <TableCell><Badge variant="outline">{row.evidenceLabel}</Badge></TableCell>
                  <TableCell className="tabular-nums">{row.score.toFixed(2)} <span className="text-muted-foreground">演示分</span></TableCell>
                  <TableCell>
                    <Badge variant={row.goNoGo === 'GO' ? 'default' : 'secondary'}>{labelStatus(row.goNoGo)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.status === 'new' ? 'secondary' : 'default'}>{labelStatus(row.status)}</Badge>
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
