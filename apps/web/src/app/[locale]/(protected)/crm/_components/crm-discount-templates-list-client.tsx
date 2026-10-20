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
import { normalizeAppRole } from '@/lib/auth/app-role'
import { authClient } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc/client'
import { Eye, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'

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

function statusLabel(status: string) {
  switch (status) {
    case 'Open':
      return '有效'
    case 'Close':
      return '已关闭'
    default:
      return status
  }
}

export function CrmDiscountTemplatesListClient() {
  const { data: session } = authClient.useSession()
  const isAdmin = normalizeAppRole(session?.user?.role) === 'admin'
  const utils = trpc.useUtils()

  const [page, setPage] = React.useState(1)
  const [searchInput, setSearchInput] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState(FILTER_ALL)
  const [productLine, setProductLine] = React.useState(FILTER_ALL)

  React.useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(t)
  }, [searchInput])

  React.useEffect(() => {
    setPage(1)
  }, [search, status, productLine])

  const { data: filterOptions } = trpc.crm.discountTemplates.listFilterOptions.useQuery()

  const { data, isLoading, isFetching } = trpc.crm.discountTemplates.list.useQuery(
    {
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      status: status === FILTER_ALL ? undefined : status,
      productLine: productLine === FILTER_ALL ? undefined : productLine,
    },
    { placeholderData: (prev) => prev },
  )

  const syncMutation = trpc.crm.discountTemplates.syncNow.useMutation({
    onSuccess: (result) => {
      toast.success(
        `同步完成：拉取 ${result.fetched}，新建 ${result.created}，更新 ${result.updated}`,
      )
      if (result.errors.length > 0) {
        toast.warning(`部分失败：${result.errors.slice(0, 3).join('；')}`)
      }
      void utils.crm.discountTemplates.list.invalidate()
    },
    onError: (e) => toast.error(e.message),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters =
    Boolean(search) || status !== FILTER_ALL || productLine !== FILTER_ALL

  return (
    <div className="bg-background p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>算力券模板</CardTitle>
            <CardDescription>
              平台算力券模板及发放汇总（共 {total} 条
              {isFetching && !isLoading ? '，刷新中…' : ''}）
            </CardDescription>
          </div>
          {isAdmin ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              type="button"
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              <RefreshCw
                className={`size-4 ${syncMutation.isPending ? 'animate-spin' : ''}`}
              />
              {syncMutation.isPending ? '同步中…' : '同步模板'}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
            <Input
              placeholder="搜索：模板名称 / 平台模板 ID"
              className="max-w-md"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="状态" />
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
            <Select value={productLine} onValueChange={setProductLine}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="产品线" />
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
            {hasFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchInput('')
                  setSearch('')
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
                <TableHead>模板</TableHead>
                <TableHead>产品线</TableHead>
                <TableHead>面值</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">发放数量</TableHead>
                <TableHead className="text-right">发送金额</TableHead>
                <TableHead className="text-right">使用金额</TableHead>
                <TableHead>最近同步</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    加载中…
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {hasFilters ? '暂无符合条件的模板' : '暂无算力券模板'}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.title}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        #{item.platformTemplateId}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {item.supportProductLines.length > 0 ? (
                          item.supportProductLines.map((pl) => (
                            <Badge key={pl} variant="outline" className="text-xs">
                              {getBillingProductLineLabel(pl)}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatMoney(item.faceAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.status === 'Open' ? 'default' : 'secondary'}>
                        {statusLabel(item.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.issuedCount.toLocaleString('zh-CN')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(item.issuedAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(item.usedAmount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDateTime(item.syncedAt)}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="gap-1" asChild>
                        <LocaleLink href={`/crm/discount-templates/${item.id}`}>
                          <Eye className="size-3.5" />
                          详情
                        </LocaleLink>
                      </Button>
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
  )
}
