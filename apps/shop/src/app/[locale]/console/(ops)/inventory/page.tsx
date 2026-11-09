'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
} from '@/components/console/list'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@workspace/ui/components/table'
import { labelStatus } from '@/lib/console/labels'
import { Button } from '@workspace/ui/components/button'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { trpc } from '@/lib/trpc/client'

const ALERTS = [
  { value: 'critical', label: '紧急' },
  { value: 'open', label: '开放' },
  { value: 'none', label: '无告警' },
]
const PAGE_SIZE = 20

export default function InventoryPage() {
  const [keyword, setKeyword] = React.useState('')
  const [alert, setAlert] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const listQuery = trpc.wms.listInventoryAlerts.useQuery({
    page, pageSize: PAGE_SIZE, q: keyword || undefined, alert: alert === 'all' ? undefined : alert,
  })
  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">库存预警</h2>
        <p className="text-sm text-muted-foreground">紧急补货 / 库龄 / 建议 · 点击 SKU 看多仓库存</p>
      </div>
      <Alert>
        <AlertTitle>主路径已接库</AlertTitle>
        <AlertDescription>聚合 inventory_balances（`wms.listInventoryAlerts`）。可用 = on_hand − reserved − qc_hold − damaged。</AlertDescription>
      </Alert>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="h-auto gap-1.5 px-3 py-1 text-sm font-normal">
          <span className="text-muted-foreground">紧急补货</span>
          <span className="font-semibold tabular-nums">{listQuery.data?.urgent ?? 0}</span>
        </Badge>
        <Badge variant="secondary" className="h-auto gap-1.5 px-3 py-1 text-sm font-normal">
          <span className="text-muted-foreground">库龄 ≥ 60 天</span>
          <span className="font-semibold tabular-nums">{listQuery.data?.aged ?? 0}</span>
        </Badge>
      </div>
      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={(v) => { setKeyword(v); setPage(1) }}
        keywordPlaceholder="SKU / 标题 / 建议"
        filters={[{ id: 'alert', label: '告警', value: alert, onChange: (v) => { setAlert(v); setPage(1) }, options: ALERTS }]}
      />
      <ConsoleListSection title="库存列表" description={`共 ${total} 条`} pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}>
        {listQuery.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">加载库存…</p>
        ) : rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead><TableHead>标题</TableHead><TableHead>仓位数</TableHead>
                <TableHead>在库</TableHead><TableHead>预留</TableHead><TableHead>可用</TableHead>
                <TableHead>阈值</TableHead><TableHead>库龄</TableHead><TableHead>告警</TableHead><TableHead>建议</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.sku}>
                  <TableCell className="font-mono text-xs">
                    <LocaleLink href={`/console/inventory/${row.sku}`} className="underline-offset-2 hover:underline">{row.sku}</LocaleLink>
                  </TableCell>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell className="tabular-nums">{row.shopCount}</TableCell>
                  <TableCell className="tabular-nums">{row.onHand}</TableCell>
                  <TableCell className="tabular-nums">{row.reserved}</TableCell>
                  <TableCell className="tabular-nums">{row.available}</TableCell>
                  <TableCell className="tabular-nums">{row.threshold}</TableCell>
                  <TableCell className="tabular-nums">{row.ageDays}d</TableCell>
                  <TableCell>
                    {row.alert ? <Badge variant={row.alert === 'critical' ? 'destructive' : 'secondary'}>{labelStatus(row.alert)}</Badge> : <span className="text-sm text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{row.suggestion}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild><LocaleLink href="/console/inventory-ledger">查看库存流水</LocaleLink></Button>
        <Button variant="outline" asChild><LocaleLink href="/console/warehouse">仓库与库位</LocaleLink></Button>
      </div>
    </div>
  )
}
