'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
  matchesKeyword,
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

const STATUSES = [...new Set(MOCK_CANDIDATES.map((r) => r.status))]
const GO = [...new Set(MOCK_CANDIDATES.map((r) => r.goNoGo))]
const CATEGORIES = [...new Set(MOCK_CANDIDATES.map((r) => r.categoryHint))]

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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">AI 选品</h2>
        <p className="text-sm text-muted-foreground">候选列表 · 点击进入通过/搁置详情</p>
      </div>

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
            options: labeledOptions(GO),
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

      <ConsoleListSection title="候选列表" description={`共 ${rows.length} 条`}>
        {rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>产品</TableHead>
                <TableHead>类目</TableHead>
                <TableHead>到仓成本</TableHead>
                <TableHead>建议售价</TableHead>
                <TableHead>净利率</TableHead>
                <TableHead>潜力</TableHead>
                <TableHead>决策</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
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
                  <TableCell className="tabular-nums">{row.marginPct}%</TableCell>
                  <TableCell className="tabular-nums">{row.score}</TableCell>
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
