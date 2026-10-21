'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
  matchesKeyword,
} from '@/components/console/list'
import { MOCK_FINANCE } from '@/lib/crossborder/mock-data'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

const active = MOCK_FINANCE.find((r) => !r.disabled) ?? MOCK_FINANCE[0]

export default function FinancePage() {
  const [keyword, setKeyword] = React.useState('')
  const [access, setAccess] = React.useState('all')

  const rows = MOCK_FINANCE.filter((row) => {
    if (!matchesKeyword(keyword, row.platform, row.platformKey)) return false
    if (access === 'mvp' && row.disabled) return false
    if (access === 'disabled' && !row.disabled) return false
    return true
  })

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">财务中心</h2>
        <p className="text-sm text-muted-foreground">营收 / 成本 / 利润粗览 · 点击平台看结算明细</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: '总营收', value: active.revenue.toLocaleString() },
          { label: '总成本', value: active.cost.toLocaleString() },
          { label: '净利润', value: active.profit.toLocaleString() },
          { label: '利润率', value: active.margin },
        ].map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm text-muted-foreground">{k.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold tabular-nums">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        keywordPlaceholder="平台"
        filters={[
          {
            id: 'access',
            label: '接入状态',
            value: access,
            onChange: setAccess,
            options: [
              { value: 'mvp', label: '已接入 MVP' },
              { value: 'disabled', label: '未接入' },
            ],
          },
        ]}
      />

      <ConsoleListSection title="平台财务" description={`共 ${rows.length} 条`}>
        {rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>平台</TableHead>
                <TableHead>营收</TableHead>
                <TableHead>成本</TableHead>
                <TableHead>利润</TableHead>
                <TableHead>利润率</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.platform} className={row.disabled ? 'opacity-60' : undefined}>
                  <TableCell className="font-medium">
                    <LocaleLink
                      href={`/console/finance/${row.platformKey}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.platform}
                    </LocaleLink>
                  </TableCell>
                  <TableCell className="tabular-nums">{row.revenue.toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums">{row.cost.toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums">{row.profit.toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums">{row.margin}</TableCell>
                  <TableCell>
                    {row.disabled ? (
                      <Badge variant="outline">未接入</Badge>
                    ) : (
                      <Badge variant="default">MVP</Badge>
                    )}
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
