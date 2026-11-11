'use client'

import * as React from 'react'
import { DetailBackButton } from '@/components/console/detail-back-button'
import { DetailField, DetailSection } from '@/components/console/detail-section'
import { PageDataLoading } from '@/components/shared/data-table'
import { formatOpsTime } from '@/lib/console/format-time'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'

const KIND_LABELS: Record<string, string> = {
  sourcing_upsert: '选品入库',
  listing_submit: '刊登提交',
  price_change: '改价',
  inventory_push: '库存推送',
  settlement_post: '结算过账',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待确认',
  confirmed: '已确认',
  executing: '执行中',
  failed: '失败',
  cancelled: '已取消',
  expired: '已过期',
}

function JsonBlock({ value }: { value: unknown }) {
  if (value == null) return <span>—</span>
  return (
    <pre className="overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export default function PendingActionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const id = React.use(params).id
  const query = trpc.platformOps.getPendingAction.useQuery({ id })

  if (query.isLoading) return <PageDataLoading />
  if (!query.data) {
    return <p className="text-sm text-muted-foreground">待审动作不存在。</p>
  }

  const row = query.data

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <DetailBackButton href="/console/pending-actions" />
        <h2 className="text-lg font-medium">{row.title}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{KIND_LABELS[row.kind] ?? row.kind}</Badge>
          <Badge variant={row.status === 'failed' ? 'destructive' : 'secondary'}>
            {STATUS_LABELS[row.status] ?? row.status}
          </Badge>
        </div>
      </div>

      <DetailSection title="动作概要" description="本页只读，平台侧暂不提供通过或取消接口。">
        <dl>
          <DetailField label="类型" value={KIND_LABELS[row.kind] ?? row.kind} />
          <DetailField label="标题" value={row.title} />
          <DetailField label="状态" value={STATUS_LABELS[row.status] ?? row.status} />
          <DetailField label="创建时间" value={formatOpsTime(row.createdAt)} />
          <DetailField label="更新时间" value={formatOpsTime(row.updatedAt)} />
          <DetailField label="过期时间" value={formatOpsTime(row.expiresAt)} />
        </dl>
      </DetailSection>

      <DetailSection title="租户与店铺">
        <dl>
          <DetailField
            label="租户"
            value={
              <LocaleLink className="underline" href={`/console/tenants/${row.organizationId}`}>
                {row.organizationName}
              </LocaleLink>
            }
          />
          <DetailField
            label="店铺"
            value={
              row.shopId ? (
                <LocaleLink className="underline" href={`/console/shops/${row.shopId}`}>
                  {row.shopName || row.shopId}
                </LocaleLink>
              ) : (
                row.shopName
              )
            }
          />
        </dl>
      </DetailSection>

      <DetailSection title="提交与执行">
        <dl>
          <DetailField
            label="创建人"
            value={
              row.createdBy ? (
                <LocaleLink className="underline" href={`/console/users/${row.createdBy.id}`}>
                  {row.createdBy.name}
                  {row.createdBy.email ? `（${row.createdBy.email}）` : ''}
                </LocaleLink>
              ) : (
                '—'
              )
            }
          />
          <DetailField
            label="确认人"
            value={
              row.confirmedBy ? (
                <LocaleLink className="underline" href={`/console/users/${row.confirmedBy.id}`}>
                  {row.confirmedBy.name}
                </LocaleLink>
              ) : (
                '—'
              )
            }
          />
          <DetailField label="确认时间" value={formatOpsTime(row.confirmedAt)} />
          <DetailField label="执行时间" value={formatOpsTime(row.executedAt)} />
          <DetailField label="尝试次数" value={row.attemptCount} />
          <DetailField label="下次重试" value={formatOpsTime(row.nextRetryAt)} />
        </dl>
      </DetailSection>

      <DetailSection title="内容">
        <dl>
          <DetailField label="payload" value={<JsonBlock value={row.payload} />} />
          <DetailField label="字段差异" value={<JsonBlock value={row.fieldDiff} />} />
        </dl>
      </DetailSection>

      <DetailSection title="平台回执与错误">
        <dl>
          <DetailField label="平台请求 ID" value={row.platformRequestId} />
          <DetailField label="平台回执" value={<JsonBlock value={row.platformResponse} />} />
          <DetailField label="错误码" value={row.lastErrorCode} />
          <DetailField label="错误信息" value={row.lastErrorMessage} />
          <DetailField label="错误" value={row.error} />
        </dl>
      </DetailSection>

      <DetailSection title="幂等键">
        <dl>
          <DetailField label="idempotency_key" value={<span className="font-mono text-xs">{row.idempotencyKey}</span>} />
        </dl>
      </DetailSection>
    </div>
  )
}
