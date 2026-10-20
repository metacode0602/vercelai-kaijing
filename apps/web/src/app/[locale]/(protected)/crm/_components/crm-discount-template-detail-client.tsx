'use client'

import * as React from 'react'
import { getBillingProductLineLabel } from '@/lib/crm/tenant-billing-import-utils'
import { ListPagination } from '@/components/shared/list-pagination'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
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
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { ArrowLeftIcon, X } from 'lucide-react'

const PAGE_SIZE = 20
const FILTER_ALL = '__all__'

function formatMoney(amount: number) {
  return `¥${amount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDateTime(iso?: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

function templateStatusLabel(status: string) {
  switch (status) {
    case 'Open':
      return '有效'
    case 'Close':
      return '已关闭'
    default:
      return status
  }
}

function couponStatusLabel(status: string) {
  switch (status) {
    case 'Open':
      return '有效'
    case 'Close':
      return '已关闭'
    case 'Exhausted':
      return '已用尽'
    default:
      return status
  }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground mb-0.5 text-xs">{label}</div>
      <div className="text-sm break-all">{value}</div>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums tracking-tight">{value}</div>
    </div>
  )
}

export function CrmDiscountTemplateDetailClient({ templateId }: { templateId: string }) {
  const [page, setPage] = React.useState(1)
  const [month, setMonth] = React.useState('')
  const [status, setStatus] = React.useState(FILTER_ALL)

  const { data: filterOptions } = trpc.crm.discountTemplates.listFilterOptions.useQuery()
  const {
    data: template,
    isLoading: templateLoading,
    error: templateError,
  } = trpc.crm.discountTemplates.getById.useQuery({ id: templateId })

  React.useEffect(() => {
    setPage(1)
  }, [month, status, templateId])

  const issuanceQuery = trpc.crm.discountTemplates.listIssuances.useQuery(
    {
      templateId,
      page,
      pageSize: PAGE_SIZE,
      month: month.trim() || undefined,
      status: status === FILTER_ALL ? undefined : status,
    },
    { placeholderData: (prev) => prev },
  )

  if (templateLoading) {
    return <p className="text-muted-foreground p-6 text-sm">加载中…</p>
  }

  if (templateError || !template) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">未找到算力券模板。</p>
        <Button className="mt-4" variant="outline" asChild>
          <LocaleLink href="/crm/discount-templates">返回列表</LocaleLink>
        </Button>
      </div>
    )
  }

  const items = issuanceQuery.data?.items ?? []
  const total = issuanceQuery.data?.total ?? 0
  const summary = issuanceQuery.data?.summary ?? {
    issuedCount: template.issuedCount,
    issuedAmount: template.issuedAmount,
    usedAmount: template.usedAmount,
  }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = Boolean(month.trim()) || status !== FILTER_ALL

  return (
    <div className="bg-background p-4 md:p-6">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <LocaleLink href="/crm/discount-templates">
              <ArrowLeftIcon className="size-4" />
            </LocaleLink>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{template.title}</h1>
            <p className="text-muted-foreground text-sm font-mono">
              平台模板 ID #{template.platformTemplateId}
            </p>
          </div>

        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryStat
            label="发送数量"
            value={summary.issuedCount.toLocaleString('zh-CN')}
          />
          <SummaryStat label="发送金额" value={formatMoney(summary.issuedAmount)} />
          <SummaryStat label="使用金额" value={formatMoney(summary.usedAmount)} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>模板信息</CardTitle>
            <CardDescription>平台同步的算力券模板元数据</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Row label="模板名称" value={template.title} />
            <Row label="平台模板 ID" value={String(template.platformTemplateId)} />
            <div>
              <div className="text-muted-foreground mb-0.5 text-xs">状态</div>
              <Badge variant={template.status === 'Open' ? 'default' : 'secondary'}>
                {templateStatusLabel(template.status)}
              </Badge>
            </div>
            <Row label="单次面值" value={formatMoney(template.faceAmount)} />
            <Row
              label="发放总量上限"
              value={
                template.totalAmount != null ? formatMoney(template.totalAmount) : '—'
              }
            />
            <Row
              label="有效天数"
              value={template.validityDay != null ? `${template.validityDay} 天` : '—'}
            />
            <div className="sm:col-span-2 lg:col-span-3">
              <div className="text-muted-foreground mb-0.5 text-xs">适用产品线</div>
              <div className="flex flex-wrap gap-1">
                {template.supportProductLines.length > 0 ? (
                  template.supportProductLines.map((pl) => (
                    <Badge key={pl} variant="outline" className="text-xs">
                      {getBillingProductLineLabel(pl)}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm">—</span>
                )}
              </div>
            </div>
            <Row label="平台原始产品" value={template.supportProducts ?? '—'} />
            <Row label="标记" value={template.mark ?? '—'} />
            <Row label="备注" value={template.remark ?? '—'} />
            <Row label="规则" value={template.rule ?? '—'} />
            <Row label="开始时间" value={formatDateTime(template.startDate)} />
            <Row label="结束时间" value={formatDateTime(template.endDate)} />
            <Row label="平台创建" value={formatDateTime(template.platformCreatedAt)} />
            <Row label="平台更新" value={formatDateTime(template.platformUpdatedAt)} />
            <Row label="最近同步" value={formatDateTime(template.syncedAt)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>发放记录</CardTitle>
            <CardDescription>
              基于已同步的租户算力券实例；汇总随当前筛选条件变化
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border-b px-4 py-3 flex flex-wrap gap-3 items-end">
              <div className="space-y-1.5">
                <Label htmlFor="template-issuance-month" className="text-xs">
                  发放月份
                </Label>
                <Input
                  id="template-issuance-month"
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
                    {(filterOptions?.couponStatuses ?? []).map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
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
                  <TableHead>租户</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead className="text-right">面值</TableHead>
                  <TableHead className="text-right">剩余</TableHead>
                  <TableHead className="text-right">已使用</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>发放时间</TableHead>
                  <TableHead>过期时间</TableHead>
                  <TableHead>操作人</TableHead>
                  <TableHead>备注</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issuanceQuery.isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-center text-muted-foreground py-8"
                    >
                      加载中…
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-center text-muted-foreground py-8"
                    >
                      {hasFilters ? '暂无符合条件的发放记录' : '暂无发放记录'}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm">
                        {item.tenantName ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {item.code || '—'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(item.value)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(item.surplusAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(item.usedAmount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={item.status === 'Open' ? 'default' : 'secondary'}
                        >
                          {couponStatusLabel(item.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDateTime(item.issuedAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDateTime(item.expiredAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {item.adminNickname ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[160px] truncate">
                        {item.remark ?? '—'}
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
      </div>
    </div>
  )
}
