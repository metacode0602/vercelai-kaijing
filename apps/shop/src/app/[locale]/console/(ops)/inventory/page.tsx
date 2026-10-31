'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
  matchesKeyword,
  useConsolePagination,
} from '@/components/console/list'
import { MOCK_INVENTORY_LIST_ROWS } from '@/lib/crossborder/mock-data'
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
import { labelStatus } from '@/lib/console/labels'
import { Button } from '@workspace/ui/components/button'

const ALERTS = [
  { value: 'critical', label: '紧急' },
  { value: 'open', label: '开放' },
  { value: 'none', label: '无告警' },
]

export default function InventoryPage() {
  const urgent = MOCK_INVENTORY_LIST_ROWS.filter((i) => i.alert)
  const aged = MOCK_INVENTORY_LIST_ROWS.filter((i) => i.ageDays >= 60)

  const [keyword, setKeyword] = React.useState('')
  const [alert, setAlert] = React.useState('all')

  const rows = MOCK_INVENTORY_LIST_ROWS.filter((row) => {
    if (!matchesKeyword(keyword, row.sku, row.title, row.suggestion)) return false
    if (alert === 'none' && row.alert) return false
    if (alert !== 'all' && alert !== 'none' && row.alert !== alert) return false
    return true
  })
  const { pagedRows, pagination } = useConsolePagination(rows)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">库存预警</h2>
        <p className="text-sm text-muted-foreground">紧急补货 / 库龄 / 建议 · 点击 SKU 看多店库存</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="h-auto gap-1.5 px-3 py-1 text-sm font-normal">
          <span className="text-muted-foreground">紧急补货</span>
          <span className="font-semibold tabular-nums">{urgent.length}</span>
        </Badge>
        <Badge variant="secondary" className="h-auto gap-1.5 px-3 py-1 text-sm font-normal">
          <span className="text-muted-foreground">库龄 ≥ 60 天</span>
          <span className="font-semibold tabular-nums">{aged.length}</span>
        </Badge>
        <Badge variant="outline" asChild className="h-auto gap-1.5 px-3 py-1 text-sm font-normal">
          <LocaleLink href="/console/inventory/MAT-02">
            <span className="text-muted-foreground">闪购建议</span>
            <span className="font-semibold">MAT-02</span>
          </LocaleLink>
        </Badge>
      </div>

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        keywordPlaceholder="SKU / 标题 / 建议"
        filters={[
          {
            id: 'alert',
            label: '告警',
            value: alert,
            onChange: setAlert,
            options: ALERTS,
          },
        ]}
      />

      <ConsoleListSection title="库存列表" description={`共 ${rows.length} 条`} pagination={pagination}>
        {rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>标题</TableHead>
                <TableHead>店铺数</TableHead>
                <TableHead>在库</TableHead>
                <TableHead>预留</TableHead>
                <TableHead>阈值</TableHead>
                <TableHead>库龄</TableHead>
                <TableHead>告警</TableHead>
                <TableHead>建议</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((row) => (
                <TableRow key={row.sku}>
                  <TableCell className="font-mono text-xs">
                    <LocaleLink
                      href={`/console/inventory/${row.sku}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.sku}
                    </LocaleLink>
                  </TableCell>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell className="tabular-nums">{row.shopCount}</TableCell>
                  <TableCell className="tabular-nums">{row.onHand}</TableCell>
                  <TableCell className="tabular-nums">{row.reserved}</TableCell>
                  <TableCell className="tabular-nums">{row.threshold}</TableCell>
                  <TableCell className="tabular-nums">{row.ageDays}d</TableCell>
                  <TableCell>
                    {row.alert ? (
                      <Badge variant={row.alert === 'critical' ? 'destructive' : 'secondary'}>
                        {labelStatus(row.alert)}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                    {row.suggestion}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild><LocaleLink href="/console/inventory-ledger">查看库存流水</LocaleLink></Button>
        <Button variant="outline" asChild><LocaleLink href="/console/warehouse">仓库与库位</LocaleLink></Button>
        <p className="self-center text-sm text-muted-foreground">当前库存页为示例预警视图；总账、库位和流水请使用对应原型页核对。</p>
      </div>
    </div>
  )
}
