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
import { MOCK_SHOPS } from '@/lib/crossborder/mock-data'
import {
  confirmOrder,
  toOrderListRow,
  useOrders,
  usePackages,
} from '@/lib/crossborder/order-store'
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
import { Button } from '@workspace/ui/components/button'

function statusVariant(status: string) {
  if (status === 'paid' || status === 'ready_to_ship') return 'secondary' as const
  if (status === 'shipped' || status === 'delivered') return 'default' as const
  if (status === 'cancelled') return 'destructive' as const
  return 'outline' as const
}

export default function OrdersPage() {
  const orders = useOrders()
  const packages = usePackages()
  const [keyword, setKeyword] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [shop, setShop] = React.useState('all')
  const [platform, setPlatform] = React.useState('all')
  const [notice, setNotice] = React.useState('')

  const listRows = React.useMemo(() => orders.map(toOrderListRow), [orders])
  const STATUSES = [...new Set(listRows.map((r) => r.status))]
  const SHOPS = [...new Set(listRows.map((r) => r.shop))]
  const PLATFORMS = [...new Set(listRows.map((r) => r.platform))]

  const activeShops = MOCK_SHOPS.filter((s) => s.status === 'active').length
  const pendingShip = listRows.filter((o) =>
    ['paid', 'ready_to_ship', 'created'].includes(o.status),
  ).length
  const reservedCount = listRows.filter((o) => o.reserved).length
  const mappingExceptions = listRows.filter((o) => o.mappingStatus !== 'ok').length
  const openPackages = packages.filter((p) => p.status !== '已出库' && p.status !== '已取消').length

  const kpis = [
    { label: '已同步店铺', value: String(activeShops) },
    { label: '近 7 天订单', value: String(listRows.length) },
    { label: '待发货', value: String(pendingShip) },
    { label: '占库 / 包裹 / 映射异常', value: `${reservedCount} / ${openPackages} / ${mappingExceptions}` },
  ]

  const rows = listRows.filter((row) => {
    if (!matchesKeyword(keyword, row.externalOrderId, row.orderNumber ?? '', row.id, row.shop, row.city)) return false
    if (status !== 'all' && row.status !== status) return false
    if (shop !== 'all' && row.shop !== shop) return false
    if (platform !== 'all' && row.platform !== platform) return false
    return true
  })
  const { pagedRows, pagination } = useConsolePagination(rows)

  function onConfirm(id: string) {
    const result = confirmOrder(id)
    if (!result.ok) {
      setNotice(result.reason)
      return
    }
    setNotice(
      `${result.order.externalOrderId} 已确认 · 状态 ${labelStatus(result.order.status)} · 已写「订单锁定」流水（不直改余额）`,
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">订单</h2>
        <p className="text-sm text-muted-foreground">
          平台订单号 / 状态 / 金额 · 确认占库 → 拣货出库写流水 · 点击详情
        </p>
      </div>
      <DetailKpiRow items={kpis} />

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
            options: labeledOptions(STATUSES),
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

      <ConsoleListSection title="订单列表" description={`共 ${rows.length} 条 · 原型会话`} pagination={pagination}>
        {rows.length === 0 ? (
          <ConsoleTableEmpty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>平台订单号</TableHead>
                <TableHead>订单号</TableHead>
                <TableHead>店铺 / 站点</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>订单状态</TableHead>
                <TableHead>映射</TableHead>
                <TableHead>履约 / 包裹</TableHead>
                <TableHead>最近同步</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((row) => {
                const mappingBlocked = row.mappingStatus === 'exception'
                const canConfirm =
                  !mappingBlocked &&
                  row.status !== 'shipped' &&
                  row.status !== 'delivered' &&
                  row.status !== 'cancelled' &&
                  (row.status === 'created' || row.status === 'paid' || !row.reserved)
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">
                      <LocaleLink
                        href={`/console/orders/${row.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {row.externalOrderId}
                      </LocaleLink>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.orderNumber ?? '—'}</TableCell>
                    <TableCell className="font-medium">{row.shop} · {row.externalShopId}</TableCell>
                    <TableCell>{row.platform}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.totalAmount.toFixed(2)} {row.currency}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={statusVariant(row.status)}>{labelStatus(row.status)}</Badge>
                        <span className="text-xs text-muted-foreground">{row.platformStatus}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={mappingBlocked ? 'destructive' : row.mappingStatus === 'pending' ? 'outline' : 'secondary'}>
                        {mappingBlocked ? '映射异常' : row.mappingStatus === 'pending' ? '待确认' : '正常'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs">
                        <span>{labelStatus(row.fulfillmentStatus)} · {row.reserved ? '已锁库' : '未锁库'}</span>
                        <span className="text-muted-foreground">{row.shipmentCount} 个包裹</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.lastSyncedAt ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      {mappingBlocked ? (
                        <Button size="sm" variant="outline" asChild>
                          <LocaleLink href={`/console/mappings?order=${encodeURIComponent(row.externalOrderId)}`}>
                            修复映射
                          </LocaleLink>
                        </Button>
                      ) : canConfirm ? (
                        <Button size="sm" variant="outline" onClick={() => onConfirm(row.id)}>
                          确认占库
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </ConsoleListSection>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" asChild>
          <LocaleLink href="/console/order-exceptions">查看映射异常</LocaleLink>
        </Button>
        <Button variant="outline" asChild>
          <LocaleLink href="/console/picking">查看拣货打包</LocaleLink>
        </Button>
        <Button variant="outline" asChild>
          <LocaleLink href="/console/stock-outbounds">查看出库单</LocaleLink>
        </Button>
        <Button variant="outline" asChild>
          <LocaleLink href="/console/inventory-ledger">查看库存流水</LocaleLink>
        </Button>
      </div>
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          确认占库写「订单锁定」流水；拣货终态调用出库过账写「订单出库」流水，禁止直改余额。
        </p>
      )}
    </div>
  )
}
