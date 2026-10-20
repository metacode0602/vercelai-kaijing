'use client'

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, MoreHorizontal, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { billDetailTypeLabels } from '@/app/[locale]/(protected)/crm/_components/crm-tenant-billing-shared'
import { trpc } from '@/lib/trpc/client'
import type { MerchantMonthlyBillListItem } from '@/lib/types/merchant'
import { MerchantDetailNav } from './merchant-detail-nav'
import { formatMoney } from './merchant-utils'
import { Button } from '@workspace/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

function formatRmb(amount: number) {
  return `¥${formatMoney(amount)}`
}

function MonthlyBillDetailsDialog({
  open,
  onOpenChange,
  merchantId,
  bill,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantId: string
  bill: MerchantMonthlyBillListItem | null
}) {
  const detailsQuery = trpc.merchant.bill.monthlyDetails.useQuery(
    {
      merchantId,
      billMonth: bill?.billMonth ?? '',
      billId: bill?.id,
    },
    { enabled: open && Boolean(bill) },
  )

  const details = detailsQuery.data ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-4xl min-w-[40vw] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>月度账单明细 · {bill?.billMonth ?? '—'}</DialogTitle>
          <DialogDescription>
            总消费 {formatRmb(bill?.totalAmount ?? 0)} · 券消费{' '}
            {formatRmb(bill?.couponAmount ?? 0)} · 余额消费{' '}
            {formatRmb(bill?.balanceAmount ?? 0)} · 租户 {bill?.tenantCount ?? 0}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {detailsQuery.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              加载明细…
            </div>
          ) : details.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">该账期暂无产品线明细</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>产品线</TableHead>
                  <TableHead>资源</TableHead>
                  <TableHead>付费类型</TableHead>
                  <TableHead className="text-right">消费</TableHead>
                  <TableHead className="text-right">券/优惠</TableHead>
                  <TableHead className="text-right">余额消费</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.productLine || '—'}</TableCell>
                    <TableCell>{row.resourceName || '—'}</TableCell>
                    <TableCell>{billDetailTypeLabels[row.type] ?? row.type}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRmb(row.amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRmb(row.couponAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRmb(row.balanceAmount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DailyBillsDialog({
  open,
  onOpenChange,
  merchantId,
  billMonth,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantId: string
  billMonth: string | null
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const dailyQuery = trpc.merchant.bill.daily.useQuery(
    { merchantId, billMonth: billMonth ?? '' },
    { enabled: open && Boolean(billMonth) },
  )

  const rows = dailyQuery.data ?? []

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += row.totalAmount
        acc.coupon += row.couponAmount
        acc.balance += row.balanceAmount
        return acc
      },
      { total: 0, coupon: 0, balance: 0 },
    )
  }, [rows])

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setExpandedIds(new Set())
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-5xl min-w-[50vw] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>日账单 · {billMonth ?? '—'}</DialogTitle>
          <DialogDescription>
            共 {rows.length} 天 · 总消费 {formatRmb(totals.total)} · 券消费{' '}
            {formatRmb(totals.coupon)} · 余额消费 {formatRmb(totals.balance)}
            。点击行可展开当日产品线消费。
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {dailyQuery.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              加载日账单…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">该月暂无日账单</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>日期</TableHead>
                  <TableHead className="text-right">总消费</TableHead>
                  <TableHead className="text-right">券/优惠</TableHead>
                  <TableHead className="text-right">余额消费</TableHead>
                  <TableHead className="text-right">租户数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const expanded = expandedIds.has(row.id)
                  return (
                    <Fragment key={row.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => toggleExpand(row.id)}
                      >
                        <TableCell>
                          {expanded ? (
                            <ChevronDown className="size-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium tabular-nums">{row.usageDate}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatRmb(row.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatRmb(row.couponAmount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatRmb(row.balanceAmount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.tenantCount}</TableCell>
                      </TableRow>
                      {expanded ? (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={6} className="p-0">
                            {row.details.length === 0 ? (
                              <p className="px-8 py-3 text-sm text-muted-foreground">
                                当日暂无产品线明细
                              </p>
                            ) : (
                              <div className="px-6 py-3">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>产品线</TableHead>
                                      <TableHead>资源</TableHead>
                                      <TableHead>付费类型</TableHead>
                                      <TableHead className="text-right">消费</TableHead>
                                      <TableHead className="text-right">券/优惠</TableHead>
                                      <TableHead className="text-right">余额消费</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {row.details.map((detail) => (
                                      <TableRow key={detail.id}>
                                        <TableCell className="font-mono text-xs">
                                          {detail.productLine || '—'}
                                        </TableCell>
                                        <TableCell>{detail.resourceName || '—'}</TableCell>
                                        <TableCell>
                                          {billDetailTypeLabels[detail.type] ?? detail.type}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                          {formatRmb(detail.amount)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                          {formatRmb(detail.couponAmount)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                          {formatRmb(detail.balanceAmount)}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function MerchantBillsContent({ merchantId }: { merchantId: string }) {
  const utils = trpc.useUtils()
  const merchantQuery = trpc.merchant.getById.useQuery({ id: merchantId })
  const billsQuery = trpc.merchant.bill.monthly.useQuery({ merchantId })
  const rollupMutation = trpc.merchant.bill.rollup.useMutation()

  const [detailBill, setDetailBill] = useState<MerchantMonthlyBillListItem | null>(null)
  const [dailyMonth, setDailyMonth] = useState<string | null>(null)

  const rows = billsQuery.data ?? []

  const handleRollup = async () => {
    try {
      const result = await rollupMutation.mutateAsync({ merchantId })
      toast.success(`汇总完成：月账单 ${result.months} 期，日账单 ${result.days} 天`)
      await utils.merchant.bill.monthly.invalidate({ merchantId })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '汇总失败')
    }
  }

  if (merchantQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        加载中…
      </div>
    )
  }

  const merchant = merchantQuery.data
  if (!merchant) {
    return <p className="text-muted-foreground">商户不存在</p>
  }

  return (
    <div className="space-y-6">
      <MerchantDetailNav merchant={merchant} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">月度账单</CardTitle>
            <CardDescription>
              按所属租户账单汇总。可通过行菜单查看产品线明细或本月日账单。
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleRollup()}
            disabled={rollupMutation.isPending}
          >
            {rollupMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            重新汇总
          </Button>
        </CardHeader>
        <CardContent>
          {billsQuery.isLoading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              加载月度账单…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              暂无月度账单。可先同步下属租户账单，或点击「重新汇总」。
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>账期</TableHead>
                    <TableHead className="text-right">总消费</TableHead>
                    <TableHead className="text-right">券/优惠</TableHead>
                    <TableHead className="text-right">余额消费</TableHead>
                    <TableHead className="text-right">租户数</TableHead>
                    <TableHead>来源</TableHead>
                    <TableHead className="w-[72px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium tabular-nums">{row.billMonth}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRmb(row.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRmb(row.couponAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRmb(row.balanceAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.tenantCount}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.source === 'live_from_tenant'
                          ? '实时汇总'
                          : row.source === 'rollup_from_tenant'
                            ? '已落库'
                            : row.source}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">打开菜单</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setDetailBill(row)}>
                              查看月度明细
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setDailyMonth(row.billMonth)}>
                              查看本月日账单
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <MonthlyBillDetailsDialog
        open={Boolean(detailBill)}
        onOpenChange={(open) => {
          if (!open) setDetailBill(null)
        }}
        merchantId={merchantId}
        bill={detailBill}
      />

      <DailyBillsDialog
        open={Boolean(dailyMonth)}
        onOpenChange={(open) => {
          if (!open) setDailyMonth(null)
        }}
        merchantId={merchantId}
        billMonth={dailyMonth}
      />
    </div>
  )
}
