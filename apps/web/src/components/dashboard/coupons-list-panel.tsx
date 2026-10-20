'use client'

import { useEffect, useMemo, useState } from 'react'
import { getBillingProductLineLabel } from '@/lib/crm/tenant-billing-import-utils'
import { ListPagination } from '@/components/shared/list-pagination'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
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
import { trpc } from '@/lib/trpc/client'
import { X } from 'lucide-react'
import { LocaleLink } from '@/lib/i18n/navigation'

const PAGE_SIZE = 20
const FILTER_ALL = '__all__'

type CouponsPanelScope =
  | { kind: 'project'; projectId: string }
  | { kind: 'tenant'; tenantId: string }
  | { kind: 'customer'; customerId: string }

type CouponsListPanelProps = {
  scope: CouponsPanelScope
  title?: string
  showTenantColumn?: boolean
}

function formatMoney(amount: number) {
  return `¥${amount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDateTime(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

function statusLabel(status: string) {
  switch (status) {
    case 'Open':
      return '有效'
    case 'Close':
      return '已关闭'
    case 'Exhausted':
      return '已用尽'
    case 'active':
      return '有效'
    case 'used':
      return '已使用'
    case 'expired':
      return '已过期'
    default:
      return status
  }
}

export function CouponsListPanel({
  scope,
  title = '算力券',
  showTenantColumn,
}: CouponsListPanelProps) {
  const [page, setPage] = useState(1)
  const [month, setMonth] = useState('')
  const [status, setStatus] = useState(FILTER_ALL)
  const [productLine, setProductLine] = useState(FILTER_ALL)

  const { data: filterOptions } = trpc.crm.discountTemplateSync.listFilterOptions.useQuery()

  const filters = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      month: month.trim() || undefined,
      status: status === FILTER_ALL ? undefined : status,
      productLine: productLine === FILTER_ALL ? undefined : productLine,
    }),
    [page, month, status, productLine],
  )

  useEffect(() => {
    setPage(1)
  }, [month, status, productLine, scope])

  const projectQuery = trpc.crm.projects.listCoupons.useQuery(
    { projectId: scope.kind === 'project' ? scope.projectId : '', ...filters },
    { enabled: scope.kind === 'project' },
  )
  const tenantQuery = trpc.crm.tenants.listCoupons.useQuery(
    { tenantId: scope.kind === 'tenant' ? scope.tenantId : '', ...filters },
    { enabled: scope.kind === 'tenant' },
  )
  const customerQuery = trpc.crm.customers.listCoupons.useQuery(
    { customerId: scope.kind === 'customer' ? scope.customerId : '', ...filters },
    { enabled: scope.kind === 'customer' },
  )

  const active =
    scope.kind === 'project' ? projectQuery : scope.kind === 'tenant' ? tenantQuery : customerQuery

  const items = active.data?.items ?? []
  const total = active.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showTenant = showTenantColumn ?? scope.kind !== 'tenant'
  const hasFilters = Boolean(month.trim()) || status !== FILTER_ALL || productLine !== FILTER_ALL

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border-b px-4 py-3 flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="coupon-filter-month" className="text-xs">
              发放月份
            </Label>
            <Input
              id="coupon-filter-month"
              type="month"
              className="h-8 w-[150px]"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 min-w-[140px]">
            <Label className="text-xs">状态</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>全部状态</SelectItem>
                {(filterOptions?.statuses ?? []).map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 min-w-[160px]">
            <Label className="text-xs">产品线</Label>
            <Select value={productLine} onValueChange={setProductLine}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="全部产品线" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>全部产品线</SelectItem>
                {(filterOptions?.productLines ?? []).map((pl) => (
                  <SelectItem key={pl.productLine} value={pl.productLine}>
                    {pl.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => {
                setMonth('')
                setStatus(FILTER_ALL)
                setProductLine(FILTER_ALL)
              }}
            >
              <X className="size-3.5 mr-1" />
              重置
            </Button>
          ) : null}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              {showTenant ? <TableHead>租户</TableHead> : null}
              <TableHead>名称</TableHead>
              <TableHead>模板</TableHead> 
              <TableHead>产品线</TableHead>
              <TableHead>面值</TableHead>
              <TableHead>剩余</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>发放时间</TableHead>
              <TableHead>过期时间</TableHead>
              <TableHead>备注</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={showTenant ? 10 : 9}
                  className="text-center text-muted-foreground py-8"
                >
                  加载中…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showTenant ? 10 : 9}
                  className="text-center text-muted-foreground py-8"
                >
                  {hasFilters ? '暂无符合条件的算力券' : '暂无算力券'}
                </TableCell>
              </TableRow>
            ) : (
              items.map((coupon) => (
                <TableRow key={coupon.id}>
                  {showTenant ? (
                    <TableCell className="text-sm">{coupon.tenantName ?? '—'}</TableCell>
                  ) : null}
                  <TableCell className="font-medium">
                    <div>{coupon.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{coupon.code}</div>
                  </TableCell>
                  <TableCell className="font-medium">
                    <LocaleLink href={`/crm/discount-templates/${coupon.templateId}`}>
                      {coupon.templateTitle ?? '—'}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(coupon.supportProductLines ?? []).length > 0 ? (
                        coupon.supportProductLines.map((pl) => (
                          <Badge key={pl} variant="outline" className="text-xs">
                            {getBillingProductLineLabel(pl)}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatMoney(coupon.value)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoney(coupon.surplusAmount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={coupon.status === 'Open' ? 'default' : 'secondary'}>
                      {statusLabel(coupon.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDateTime(coupon.issuedAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDateTime(coupon.expiredAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[180px] truncate">
                    {coupon.remark ?? '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <ListPagination
          page={page}
          totalPages={totalPages}
          totalItems={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </CardContent>
    </Card>
  )
}
