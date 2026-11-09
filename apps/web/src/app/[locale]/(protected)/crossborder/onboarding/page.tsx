'use client'

import * as React from 'react'
import { LocaleLink } from '@/lib/i18n/navigation'
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
  const [page, setPage] = React.useState(1)
  const [q, setQ] = React.useState('')
  const [status, setStatus] = React.useState('submitted')
  const query = trpc.platformOnboarding.list.useQuery({
    page,
    pageSize: 20,
    q: q.trim() || undefined,
    status,
  })
  const data = query.data
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / 20))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">入驻审核</h2>
          <p className="text-sm text-muted-foreground">
            审核租户主体资料；通过后租户即可绑定店铺。
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
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground">
                加载中…
              </TableCell>
            </TableRow>
          ) : data?.items.length ? (
            data.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium">{item.companyName}</div>
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
                    <LocaleLink href={`/crossborder/onboarding/${item.id}`}>
                      查看
                    </LocaleLink>
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground">
                暂无入驻申请。
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>共 {data?.total ?? 0} 条</span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            上一页
          </Button>
          <span>
            {page} / {pageCount}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  )
}
