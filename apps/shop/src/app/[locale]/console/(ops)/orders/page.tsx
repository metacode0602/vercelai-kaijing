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
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { Button } from '@workspace/ui/components/button'

function statusVariant(status: string) {
  if (status === 'paid' || status === 'ready_to_ship') return 'secondary' as const
  if (status === 'shipped' || status === 'delivered') return 'default' as const
  if (status === 'cancelled') return 'destructive' as const
  return 'outline' as const
}

export default function OrdersPage() {
  const utils = trpc.useUtils()
  const [keyword, setKeyword] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [platform, setPlatform] = React.useState('all')
  const [notice, setNotice] = React.useState('')

  const listQuery = trpc.order.list.useQuery({ page: 1, pageSize: 100, status, platform })
  const statsQuery = trpc.order.stats.useQuery()
  const metaQuery = trpc.order.meta.useQuery()

  const syncMutation = trpc.order.syncIncremental.useMutation({
    onSuccess: async (res) => {
      await utils.order.list.invalidate()
      await utils.order.stats.invalidate()
      setNotice(
        `增量同步完成：upsert ${res.upserted} 单，其中已占库 ${res.reserved} 单（平台 API 为 stub，订单已写入 PostgreSQL）。`,
      )
    },
    onError: (e) => setNotice(e.message),
  })
  const reserveMutation = trpc.order.confirmReserve.useMutation({
    onSuccess: async (order) => {
      await utils.order.list.invalidate()
      await utils.order.stats.invalidate()
      setNotice(
        `${order.externalOrderId} 已确认占库 · ${order.statusLabel} · 已写「订单锁定」流水（order_reserve）`,
      )
    },
    onError: (e) => setNotice(e.message),
  })

  const listRows = listQuery.data?.items ?? []
  const STATUSES = [...new Set(listRows.map((r) => r.status))]
  const PLATFORMS = [...new Set(listRows.map((r) => r.platform))]

  const pendingShip = listRows.filter((o) =>
    ['paid', 'ready_to_ship', 'created'].includes(o.status),
  ).length
  const reservedCount = listRows.filter((o) => o.reserved).length
  const mappingExceptions = listRows.filter((o) => o.mappingStatus !== '正常').length

  const kpis = [
    { label: '订单总数', value: String(statsQuery.data?.total ?? listRows.length) },
    { label: '待发货（本页）', value: String(pendingShip) },
    { label: '活跃占库行', value: String(statsQuery.data?.reservedOrders ?? reservedCount) },
    {
      label: '进行中出库 / 映射异常',
      value: `${statsQuery.data?.openOutbounds ?? 0} / ${mappingExceptions}`,
    },
  ]

  const rows = listRows.filter((row) => {
    if (
      !matchesKeyword(
        keyword,
        row.externalOrderId,
        row.orderNumber ?? '',
        row.id,
        row.shop,
        row.buyerRegion,
      )
    )
      return false
    return true
  })
  const { pagedRows, pagination } = useConsolePagination(rows)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">订单</h2>
          <p className="text-sm text-muted-foreground">
            平台订单经 tRPC 写入 PostgreSQL · 确认占库 → 拣货出库写流水 · 主路径已停用 localStorage
          </p>
        </div>
        <Button
          onClick={() => syncMutation.mutate({ limit: 10 })}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? '同步中…' : '人工增量同步'}
        </Button>
      </div>
      <DetailKpiRow items={kpis} />
      <p className="text-xs text-muted-foreground">
        Q07：{metaQuery.data?.q07Note ?? 'paid 自动占库 + 出库过账扣减'}
      </p>

      <ConsoleFilterBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        keywordPlaceholder="订单号 / 店铺 / 地区"
        filters={[
          {
            id: 'status',
            label: '状态',
            value: status,
            onChange: setStatus,
            options: [
              { value: 'all', label: '全部' },
              ...STATUSES.map((v) => ({ value: v, label: v })),
            ],
          },
          {
            id: 'platform',
            label: '平台',
            value: platform,
            onChange: setPlatform,
            options: [
              { value: 'all', label: '全部' },
              ...PLATFORMS.map((v) => ({ value: v, label: v })),
            ],
          },
        ]}
      />

      <ConsoleListSection
        title="订单列表"
        description={
          listQuery.isLoading
            ? '加载中…'
            : `共 ${listQuery.data?.total ?? rows.length} 条 · PostgreSQL`
        }
        pagination={pagination}
      >
        {listQuery.isError ? (
          <p className="text-sm text-destructive">{listQuery.error.message}</p>
        ) : rows.length === 0 ? (
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
                <TableHead>履约 / 出库</TableHead>
                <TableHead>最近同步</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedRows.map((row) => {
                const mappingBlocked = row.mappingStatus === '映射异常'
                const canConfirm =
                  !mappingBlocked &&
                  row.status !== 'shipped' &&
                  row.status !== 'delivered' &&
                  row.status !== 'cancelled' &&
                  !row.reserved
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
                    <TableCell className="font-medium">
                      {row.shop} · {row.externalShopId}
                    </TableCell>
                    <TableCell>{row.platform}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.totalAmount.toFixed(2)} {row.currency}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={statusVariant(row.status)}>{row.statusLabel}</Badge>
                        <span className="text-xs text-muted-foreground">{row.platformStatus}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          mappingBlocked
                            ? 'destructive'
                            : row.mappingStatus === '待确认'
                              ? 'outline'
                              : 'secondary'
                        }
                      >
                        {row.mappingStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs">
                        <span>
                          {row.fulfillmentStatus || '—'} · {row.reserved ? '已锁库' : '未锁库'}
                        </span>
                        <span className="text-muted-foreground">{row.shipmentCount} 个出库单</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.lastSyncedAt || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {mappingBlocked ? (
                        <Button size="sm" variant="outline" asChild>
                          <LocaleLink
                            href={`/console/mappings?order=${encodeURIComponent(row.externalOrderId)}`}
                          >
                            修复映射
                          </LocaleLink>
                        </Button>
                      ) : canConfirm ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reserveMutation.isPending}
                          onClick={() => reserveMutation.mutate({ id: row.id })}
                        >
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
          确认占库写 order_reserve 流水；拣货推进至出库过账写 order_ship，禁止直改余额。
        </p>
      )}
    </div>
  )
}
