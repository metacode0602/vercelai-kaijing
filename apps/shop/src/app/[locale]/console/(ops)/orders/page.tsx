'use client'

import * as React from 'react'
import {
  ConsoleFilterBar,
  ConsoleListSection,
  ConsoleTableEmpty,
  matchesKeyword,
} from '@/components/console/list'
import { MOCK_ORDER_LIST_ROWS, MOCK_SHOPS } from '@/lib/crossborder/mock-data'
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

const activeShops = MOCK_SHOPS.filter((s) => s.status === 'active').length
const pendingShip = MOCK_ORDER_LIST_ROWS.filter((o) =>
  ['paid', 'ready_to_ship', 'created'].includes(o.status),
).length

const KPIS = [
  { label: '已同步店铺', value: String(activeShops) },
  { label: '近 7 天订单', value: String(MOCK_ORDER_LIST_ROWS.length) },
  { label: '待发货', value: String(pendingShip) },
  { label: '异常', value: '0' },
]

function statusVariant(status: string) {
  if (status === 'paid' || status === 'ready_to_ship') return 'secondary' as const
  if (status === 'shipped' || status === 'delivered') return 'default' as const
  if (status === 'cancelled') return 'destructive' as const
  return 'outline' as const
}

const STATUSES = [...new Set(MOCK_ORDER_LIST_ROWS.map((r) => r.status))]
const SHOPS = [...new Set(MOCK_ORDER_LIST_ROWS.map((r) => r.shop))]
const PLATFORMS = [...new Set(MOCK_ORDER_LIST_ROWS.map((r) => r.platform))]

export default function OrdersPage() {
  const [keyword, setKeyword] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [shop, setShop] = React.useState('all')
  const [platform, setPlatform] = React.useState('all')

  const rows = MOCK_ORDER_LIST_ROWS.filter((row) => {
    if (!matchesKeyword(keyword, row.externalOrderId, row.id, row.shop, row.city)) return false
    if (status !== 'all' && row.status !== status) return false
    if (shop !== 'all' && row.shop !== shop) return false
    if (platform !== 'all' && row.platform !== platform) return false
    return true
  })

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">订单</h2>
        <p className="text-sm text-muted-foreground">lean：externalOrderId / status / totalAmount / currency · buyer/shipping 在 raw · 点击详情</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((k) => (
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
        keywordPlaceholder="订单号 / 店铺 / 城市"
        filters={[
          {
            id: 'status',
            label: '状态',
            value: status,
            onChange: setStatus,
            options: STATUSES.map((v) => ({ value: v, label: v })),
          },
          {
            id: 'shop',
            label: '店铺',
            value: shop,
            onChange: setShop,
            options: SHOPS.map((v) => ({ value: v, label: v })),
          },
          {
            id: 'platform',
            label: '平台',
            value: platform,
            onChange: setPlatform,
            options: PLATFORMS.map((v) => ({ value: v, label: v })),
          },
        ]}
      />

      <ConsoleListSection title="订单列表" description={`共 ${rows.length} 条`}>
        {rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>订单号</TableHead>
                <TableHead>店铺</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>raw.city</TableHead>
                <TableHead>下单时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">
                    <LocaleLink
                      href={`/console/orders/${row.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.externalOrderId}
                    </LocaleLink>
                  </TableCell>
                  <TableCell className="font-medium">{row.shop}</TableCell>
                  <TableCell>{row.platform}</TableCell>
                  <TableCell className="tabular-nums">
                    {row.totalAmount.toFixed(2)} {row.currency}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                  </TableCell>
                  <TableCell>{row.city}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.placedAt}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
    </div>
  )
}
