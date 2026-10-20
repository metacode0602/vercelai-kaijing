'use client'

import { useMemo, useState } from 'react'
import { Clock, Cpu, Globe, HardDrive, Loader2, Server, Search } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import { Badge } from '@workspace/ui/components/badge'
import { Card, CardContent } from '@workspace/ui/components/card'
import { Input } from '@workspace/ui/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { trpc } from '@/trpc/client'
import { cn } from '@workspace/ui/lib/utils'
import { LocaleLink } from '@/lib/i18n/navigation'

function formatCNY(amount: number) {
  return `¥${amount.toFixed(2)}`
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return dateStr
  }
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleString('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return dateStr
  }
}

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return `${Math.abs(diff)} 天前到期`
  if (diff === 0) return '今天到期'
  return `${diff} 天后到期`
}

const statusStyle: Record<string, { dot: string; label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  pending: { dot: 'bg-chart-4 animate-pulse', label: '待部署', variant: 'secondary' },
  provisioning: { dot: 'bg-chart-4 animate-pulse', label: '部署中', variant: 'secondary' },
  active: { dot: 'bg-primary', label: '运行中', variant: 'default' },
  running: { dot: 'bg-primary', label: '运行中', variant: 'default' },
  stopping: { dot: 'bg-muted-foreground', label: '停止中', variant: 'outline' },
  stopped: { dot: 'bg-muted-foreground', label: '已停止', variant: 'outline' },
  overdue: { dot: 'bg-destructive', label: '已逾期', variant: 'destructive' },
  expired: { dot: 'bg-destructive', label: '已过期', variant: 'destructive' },
  cancelled: { dot: 'bg-muted-foreground', label: '已取消', variant: 'outline' },
  reserved: { dot: 'bg-chart-4', label: '已预留', variant: 'secondary' },
  released: { dot: 'bg-muted-foreground', label: '已释放', variant: 'outline' },
}

export function MetalInstanceList() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const queryInput = useMemo(
    () => ({
      page,
      pageSize: 20,
      status: statusFilter === 'all' ? undefined : statusFilter,
    }),
    [page, statusFilter],
  )

  const { data, isLoading, isFetching } = trpc.metal.orderList.useQuery(queryInput)

  const orders = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 20))

  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders
    const q = search.toLowerCase()
    return orders.filter(
      (o) =>
        o.orderNo?.toLowerCase().includes(q) ||
        o.description?.toLowerCase().includes(q) ||
        o.dataCenterName?.toLowerCase().includes(q),
    )
  }, [orders, search])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">加载中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="搜索订单号、描述、机房…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {Object.entries(statusStyle).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {filteredOrders.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Server className="size-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">还没有裸金属设备</p>
          <p className="mt-1 text-xs text-muted-foreground">前往裸金属市场选择规格并租用</p>
          <Button asChild className="mt-4">
            <LocaleLink href="/console/metal/list">裸金属市场</LocaleLink>
          </Button>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>订单号</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>GPU</TableHead>
                  <TableHead>机房</TableHead>
                  <TableHead>租期</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>自动续租</TableHead>
                  <TableHead>下单时间</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => {
                  const st = statusStyle[order.status] ?? { dot: 'bg-muted-foreground', label: order.status, variant: 'outline' as const }
                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div>
                          <LocaleLink
                            href={`/console/metal/instances/${order.id}`}
                            className="text-sm font-semibold text-foreground hover:underline"
                          >
                            {order.description || order.orderNo || order.id.slice(0, 8)}
                          </LocaleLink>
                          <p className="font-mono text-xs text-muted-foreground">{order.orderNo ?? order.id}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant} className="gap-1">
                          <span className={cn('size-1.5 rounded-full', st.dot)} />
                          {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Cpu className="size-3.5 text-muted-foreground" />
                          {order.gpuCount}× {order.gpuModelName ?? 'GPU'}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1">
                          <Globe className="size-3.5 text-muted-foreground" />
                          {order.dataCenterName ?? '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>{formatDate(order.rentStartsAt)} ~ {formatDate(order.rentEndsAt)}</p>
                          <p className="text-xs text-muted-foreground">{daysUntil(order.rentEndsAt) ?? '—'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">{formatCNY(order.finalAmount)}</span>
                      </TableCell>
                      <TableCell>
                        {order.autoRenew ? (
                          <Badge variant="default" className="text-xs">自动续租</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateTime(order.orderedAt)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <LocaleLink href={`/console/metal/instances/${order.id}`}>详情</LocaleLink>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {total > 20 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            共 {total} 条{isFetching && !isLoading ? '（刷新中…）' : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              上一页
            </Button>
            <span>{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              下一页
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
