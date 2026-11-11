'use client'

import * as React from 'react'
import { LocaleLink } from '@/lib/i18n/navigation'
import { useListPagination } from '@/lib/pagination/use-list-pagination'
import {
  TableEmptyRow,
  TableErrorRow,
  TableLoadingRow,
} from '@/components/shared/data-table'
import { ListPagination } from '@/components/shared/list-pagination'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { NativeSelect } from '@workspace/ui/components/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

const STATUS_LABELS: Record<string, string> = {
  submitted: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  suspended: '已暂停',
}

export default function OnboardingReviewListPage() {
  const { page, setPage, pageSize, setPageSize } = useListPagination()
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('submitted')
  const [country, setCountry] = React.useState('all')
  const query = trpc.platformOnboarding.list.useQuery({
    page,
    pageSize,
    q: q.trim() || undefined,
    status,
    countryCode: country,
  })
  const stats = trpc.platformOnboarding.stats.useQuery()
  const data = query.data
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">入驻审核</h2>
          <p className="text-sm text-muted-foreground">
            审核租户主体资料；通过后租户即可绑定店铺并开启同步。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value)
              setPage(1)
            }}
            placeholder="搜索企业名称 / 注册号 / 联系人"
            className="w-64"
          />
          <NativeSelect
            value={country}
            onChange={(event) => {
              setCountry(event.target.value)
              setPage(1)
            }}
          >
            <option value="all">全部国家</option>
            {stats.data?.countries.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            value={status}
            onChange={(event) => {
              setStatus(event.target.value)
              setPage(1)
            }}
          >
            <option value="submitted">待审核</option>
            <option value="approved">已通过</option>
            <option value="rejected">已驳回</option>
            <option value="suspended">已暂停</option>
            <option value="all">全部</option>
          </NativeSelect>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">待审核</p>
          <p className="text-2xl font-semibold tabular-nums">
            {stats.data?.pending ?? '—'}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">今日通过</p>
          <p className="text-2xl font-semibold tabular-nums">
            {stats.data?.approvedToday ?? '—'}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">今日驳回</p>
          <p className="text-2xl font-semibold tabular-nums">
            {stats.data?.rejectedToday ?? '—'}
          </p>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>企业 / 主体</TableHead>
            <TableHead>租户</TableHead>
            <TableHead>国家</TableHead>
            <TableHead>联系人</TableHead>
            <TableHead>提交时间</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading ? (
            <TableLoadingRow colSpan={7} />
          ) : query.isError ? (
            <TableErrorRow
              colSpan={7}
              message={query.error.message}
              onRetry={() => query.refetch()}
            />
          ) : data?.items.length ? (
            data.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium">
                    <LocaleLink className="underline-offset-2 hover:underline" href={`/console/onboarding/${item.id}`}>
                      {item.companyName}
                    </LocaleLink>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {item.registrationNo || '—'}
                  </div>
                </TableCell>
                <TableCell>
                  <div>{item.organizationName}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.organizationSlug || item.organizationId}
                  </div>
                </TableCell>
                <TableCell>{item.countryCode}</TableCell>
                <TableCell>
                  <div>{item.contactName}</div>
                  <div className="text-xs text-muted-foreground">{item.contactPhone}</div>
                </TableCell>
                <TableCell className="text-xs">
                  {item.submittedAt ? new Date(item.submittedAt).toLocaleString() : '—'}
                </TableCell>
                <TableCell>
                  <Badge variant={item.status === 'submitted' ? 'default' : 'secondary'}>
                    {STATUS_LABELS[item.status] ?? item.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <LocaleLink href={`/console/onboarding/${item.id}`}>
                      详情
                    </LocaleLink>
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyRow colSpan={7}>暂无入驻申请。</TableEmptyRow>
          )}
        </TableBody>
      </Table>

      <ListPagination
        page={page}
        totalPages={pageCount}
        totalItems={data?.total ?? 0}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  )
}
