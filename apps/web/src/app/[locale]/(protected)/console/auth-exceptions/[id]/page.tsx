'use client'

import * as React from 'react'
import { DetailField, DetailSection } from '@/components/console/detail-section'
import {
  PageDataLoading,
  TableEmptyRow,
  TableErrorRow,
  TableLoadingRow,
} from '@/components/shared/data-table'
import { ListPagination } from '@/components/shared/list-pagination'
import { formatOpsTime } from '@/lib/console/format-time'
import { LocaleLink } from '@/lib/i18n/navigation'
import { useListPagination } from '@/lib/pagination/use-list-pagination'
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

export default function AuthExceptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const id = React.use(params).id
  const query = trpc.platformOps.getAuthException.useQuery({ id })
  const pager = useListPagination()
  const related = trpc.platformOps.authExceptions.useQuery(
    {
      shopId: query.data?.shop.id,
      page: pager.page,
      pageSize: pager.pageSize,
    },
    { enabled: Boolean(query.data?.shop.id) },
  )

  if (query.isLoading) return <PageDataLoading />
  if (!query.data) {
    return <p className="text-sm text-muted-foreground">授权异常不存在。</p>
  }

  const row = query.data

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground">
          <LocaleLink className="underline" href="/console/auth-exceptions">
            授权异常
          </LocaleLink>{' '}
          / 异常详情
        </p>
        <h2 className="text-lg font-medium">{row.errorCode}</h2>
        <p className="text-sm text-muted-foreground">{formatOpsTime(row.createdAt)}</p>
      </div>

      <DetailSection title="异常本身">
        <dl>
          <DetailField label="时间" value={formatOpsTime(row.createdAt)} />
          <DetailField label="动作" value={row.action} />
          <DetailField label="错误码" value={<span className="font-mono text-xs">{row.errorCode}</span>} />
          <DetailField label="原因" value={row.reason} />
          <DetailField label="建议操作" value={row.advice} />
          <DetailField label="消息" value={row.message} />
          <DetailField
            label="payload 摘要"
            value={
              <pre className="overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
                {JSON.stringify(row.payloadSummary ?? {}, null, 2)}
              </pre>
            }
          />
        </dl>
      </DetailSection>

      <DetailSection title="租户与店铺">
        <dl>
          <DetailField
            label="租户"
            value={
              <LocaleLink className="underline" href={`/console/tenants/${row.organization.id}`}>
                {row.organization.name}
              </LocaleLink>
            }
          />
          <DetailField label="租户状态" value={row.organization.status} />
          <DetailField
            label="店铺"
            value={
              <LocaleLink className="underline" href={`/console/shops/${row.shop.id}`}>
                {row.shop.name}
              </LocaleLink>
            }
          />
          <DetailField label="店铺状态" value={row.shop.status} />
          <DetailField label="同步健康" value={row.shop.health || '—'} />
          <DetailField label="最近错误" value={row.shop.lastError} />
          <DetailField label="是否已配置凭证" value={row.shop.hasCredential ? '已配置' : '未配置'} />
          <DetailField label="授权到期" value={formatOpsTime(row.shop.authExpiresAt)} />
          <DetailField label="平台店铺 ID" value={row.shop.externalShopId} />
        </dl>
      </DetailSection>

      {row.conflict ? (
        <DetailSection title="对应冲突单">
          <dl>
            <DetailField
              label="冲突单"
              value={
                <LocaleLink className="underline" href={`/console/shop-conflicts/${row.conflict.id}`}>
                  查看冲突详情
                </LocaleLink>
              }
            />
            <DetailField label="冲突状态" value={row.conflict.status} />
            <DetailField label="占用方" value={row.conflict.occupantOrganizationName} />
            <DetailField label="申诉截止" value={formatOpsTime(row.conflict.appealDeadlineAt)} />
          </dl>
        </DetailSection>
      ) : null}

      <DetailSection title="同店铺近期授权异常">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>错误码</TableHead>
              <TableHead>原因</TableHead>
              <TableHead>建议</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {related.isLoading ? (
              <TableLoadingRow colSpan={4} />
            ) : related.isError ? (
              <TableErrorRow
                colSpan={4}
                message={related.error.message}
                onRetry={() => related.refetch()}
              />
            ) : related.data?.items.length ? (
              related.data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs">
                    {item.id === row.id ? (
                      <span>{formatOpsTime(item.createdAt)}（本条）</span>
                    ) : (
                      <LocaleLink className="underline" href={`/console/auth-exceptions/${item.id}`}>
                        {formatOpsTime(item.createdAt)}
                      </LocaleLink>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{item.errorCode}</TableCell>
                  <TableCell>{item.reason}</TableCell>
                  <TableCell className="text-muted-foreground">{item.advice}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableEmptyRow colSpan={4}>暂无其他授权异常。</TableEmptyRow>
            )}
          </TableBody>
        </Table>
        <ListPagination
          page={pager.page}
          totalPages={Math.max(1, Math.ceil((related.data?.total ?? 0) / pager.pageSize))}
          totalItems={related.data?.total ?? 0}
          pageSize={pager.pageSize}
          onPageChange={pager.setPage}
          onPageSizeChange={pager.setPageSize}
        />
      </DetailSection>
    </div>
  )
}
