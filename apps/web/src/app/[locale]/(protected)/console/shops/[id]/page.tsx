'use client'

import * as React from 'react'
import { DetailBackButton } from '@/components/console/detail-back-button'
import { DetailField, DetailSection } from '@/components/console/detail-section'
import { ConfirmActionDialog } from '@/components/shared/confirm-action-dialog'
import { ConfirmReasonDialog } from '@/components/shared/confirm-reason-dialog'
import {
  PageDataLoading,
  TableEmptyRow,
  TableErrorRow,
  TableLoadingRow,
} from '@/components/shared/data-table'
import { ListPagination } from '@/components/shared/list-pagination'
import { formatOpsTime } from '@/lib/console/format-time'
import { classifyOAuthFailure } from '@/lib/server/oauth-auth-errors'
import { LocaleLink } from '@/lib/i18n/navigation'
import { useListPagination } from '@/lib/pagination/use-list-pagination'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'

const STATUS_LABELS: Record<string, string> = {
  draft: '待授权',
  connecting: '连接中',
  active: '已授权',
  error: '授权失效',
  disabled: '已停用',
}

const FULFILLMENT_LABELS: Record<string, string> = {
  fbm: '自营仓发货',
  fbp: '平台仓履约',
  hybrid: '混合履约',
}

export default function PlatformShopDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const id = React.use(params).id
  const utils = trpc.useUtils()
  const query = trpc.platformShops.get.useQuery({ id })
  const conflictsPager = useListPagination()
  const exceptionsPager = useListPagination()
  const actionsPager = useListPagination()
  const logsPager = useListPagination()
  const auditPager = useListPagination()
  const [notice, setNotice] = React.useState('')
  const [disableOpen, setDisableOpen] = React.useState(false)
  const [restoreOpen, setRestoreOpen] = React.useState(false)

  const conflicts = trpc.platformOnboarding.listConflicts.useQuery(
    {
      shopId: id,
      platform: query.data?.shop.platform,
      externalShopId: query.data?.shop.externalShopId ?? undefined,
      page: conflictsPager.page,
      pageSize: conflictsPager.pageSize,
    },
    { enabled: Boolean(query.data) },
  )
  const exceptions = trpc.platformOps.authExceptions.useQuery({
    shopId: id,
    page: exceptionsPager.page,
    pageSize: exceptionsPager.pageSize,
  })
  const actions = trpc.platformOps.pendingActions.useQuery({
    shopId: id,
    page: actionsPager.page,
    pageSize: actionsPager.pageSize,
  })
  const logs = trpc.platformOps.listIntegrationLogs.useQuery({
    shopId: id,
    page: logsPager.page,
    pageSize: logsPager.pageSize,
  })
  const audit = trpc.platformOnboarding.listAuditEvents.useQuery({
    entityType: 'shop',
    entityId: id,
    page: auditPager.page,
    pageSize: auditPager.pageSize,
  })

  const disable = trpc.platformShops.disable.useMutation({
    onSuccess: async () => {
      setNotice('店铺已停用，租户将收到站内信通知。停用店仍占绑定名额。')
      setDisableOpen(false)
      await utils.platformShops.get.invalidate({ id })
      await utils.platformShops.list.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const restore = trpc.platformShops.restore.useMutation({
    onSuccess: async () => {
      setNotice('店铺已恢复，等待租户重新授权。')
      setRestoreOpen(false)
      await utils.platformShops.get.invalidate({ id })
      await utils.platformShops.list.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  if (query.isLoading) return <PageDataLoading />
  if (!query.data) {
    return <p className="text-sm text-muted-foreground">店铺不存在。</p>
  }

  const { shop, organization, health, lastError, credential, syncPaused } = query.data
  const {
    lastOrdersSyncAt,
    lastInventorySyncAt,
    lastProductsSyncAt,
    lastListingsSyncAt,
    lastLogisticsSyncAt,
    lastReviewsSyncAt,
    lastReverseSyncAt,
    lastSettlementsSyncAt,
  } = query.data
  const platformMeta =
    shop.meta && typeof shop.meta === 'object'
      ? (shop.meta as Record<string, unknown>)
      : {}
  const metaLastError =
    typeof platformMeta.lastError === 'string' ? platformMeta.lastError : null
  const metaLastErrorCode =
    typeof platformMeta.lastErrorCode === 'string' ? platformMeta.lastErrorCode : null
  const failureAdvice =
    lastError || metaLastError || metaLastErrorCode
      ? classifyOAuthFailure({
          reason: metaLastErrorCode,
          message: lastError ?? metaLastError,
          lastError,
        })
      : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <DetailBackButton href="/console/shops" />
          <h2 className="text-lg font-medium">{shop.name}</h2>
          <p className="text-sm text-muted-foreground">
            平台 {shop.platform}
            {shop.region ? ` · ${shop.region.toUpperCase()}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={shop.status === 'active' ? 'default' : 'secondary'}>
            {STATUS_LABELS[shop.status] ?? shop.status}
          </Badge>
          {syncPaused ? <Badge variant="outline">同步已暂停</Badge> : null}
        </div>
      </div>

      <DetailSection title="所属租户">
        <dl>
          <DetailField
            label="租户"
            value={
              <LocaleLink className="underline" href={`/console/tenants/${organization.id}`}>
                {organization.name}
              </LocaleLink>
            }
          />
          <DetailField label="入驻是否通过" value={organization.entryApproved ? '已通过' : '未通过'} />
          <DetailField label="租户状态" value={organization.status} />
        </dl>
      </DetailSection>

      <DetailSection title="店铺信息">
        <dl className="grid gap-x-8 sm:grid-cols-2">
          <DetailField label="平台店铺 ID" value={<span className="font-mono text-xs">{shop.externalShopId || '—'}</span>} />
          <DetailField label="卖家 ID" value={<span className="font-mono text-xs">{shop.sellerId || '—'}</span>} />
          <DetailField label="卖家名称" value={shop.sellerName} />
          <DetailField label="店铺分组" value={shop.shopGroup} />
          <DetailField label="履约模式" value={FULFILLMENT_LABELS[shop.fulfillmentMode] ?? shop.fulfillmentMode} />
          <DetailField label="币种" value={shop.currency} />
          <DetailField label="时区" value={shop.timezone} />
          <DetailField label="站点国家" value={shop.region?.toUpperCase()} />
          <DetailField
            label="库存池"
            value={
              shop.inventoryPoolName
                ? `${shop.inventoryPoolName}${shop.inventoryPoolId ? `（${shop.inventoryPoolId}）` : ''}`
                : shop.inventoryPoolId
            }
          />
          <DetailField label="最近同步" value={formatOpsTime(shop.lastSyncAt)} />
          <DetailField label="创建时间" value={formatOpsTime(shop.createdAt)} />
          <DetailField label="更新时间" value={formatOpsTime(shop.updatedAt)} />
        </dl>
      </DetailSection>

      <DetailSection title="授权与同步">
        <dl className="grid gap-x-8 sm:grid-cols-2">
          <DetailField
            label="凭证"
            value={
              credential
                ? `已配置 · ${credential.kind} · 到期 ${formatOpsTime(credential.expiresAt)}`
                : '未配置凭证'
            }
          />
          <DetailField label="授权到期" value={formatOpsTime(shop.authExpiresAt)} />
          <DetailField
            label="同步健康"
            value={
              <>
                {health ?? '—'}
                {lastError ? (
                  <span className="text-destructive">（{failureAdvice?.reason ?? lastError}）</span>
                ) : null}
              </>
            }
          />
          <DetailField label="订单同步" value={formatOpsTime(lastOrdersSyncAt)} />
          <DetailField label="库存同步" value={formatOpsTime(lastInventorySyncAt)} />
          <DetailField label="商品同步" value={formatOpsTime(lastProductsSyncAt)} />
          <DetailField label="刊登同步" value={formatOpsTime(lastListingsSyncAt)} />
          <DetailField label="物流同步" value={formatOpsTime(lastLogisticsSyncAt)} />
          <DetailField label="评价同步" value={formatOpsTime(lastReviewsSyncAt)} />
          <DetailField label="售后同步" value={formatOpsTime(lastReverseSyncAt)} />
          <DetailField label="结算同步" value={formatOpsTime(lastSettlementsSyncAt)} />
        </dl>
      </DetailSection>

      {failureAdvice ? (
        <section className="rounded-lg border p-4 text-sm">
          <p className="font-medium">授权异常排查</p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">错误码</dt>
              <dd className="font-mono text-xs">{failureAdvice.code}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">原因</dt>
              <dd>{failureAdvice.reason}</dd>
            </div>
          </dl>
          <p className="mt-2 text-muted-foreground">建议操作：{failureAdvice.advice}</p>
          {failureAdvice.code === 'shop_bound_other_org' ? (
            <p className="mt-2">
              <LocaleLink className="underline" href="/console/shop-conflicts">
                前往店铺冲突队列
              </LocaleLink>
            </p>
          ) : (
            <p className="mt-2">
              <LocaleLink className="underline" href="/console/auth-exceptions">
                查看全部授权异常
              </LocaleLink>
            </p>
          )}
        </section>
      ) : null}

      {typeof platformMeta.platformDisabledReason === 'string' &&
      platformMeta.platformDisabledReason ? (
        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">平台停用原因</p>
          <p className="mt-1 text-muted-foreground">{platformMeta.platformDisabledReason}</p>
        </section>
      ) : null}

      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="font-medium">平台操作</h3>
        <p className="text-sm text-muted-foreground">
          停用为风控动作：暂停同步并通知租户；停用店仍占绑定名额，不会因此释放给后来者。恢复后店铺回到待授权状态，由租户重新发起授权。
        </p>
        <div className="flex flex-wrap gap-2">
          {shop.status === 'disabled' ? (
            <Button disabled={restore.isPending} onClick={() => setRestoreOpen(true)}>
              恢复店铺
            </Button>
          ) : (
            <Button variant="destructive" disabled={disable.isPending} onClick={() => setDisableOpen(true)}>
              停用店铺
            </Button>
          )}
        </div>
      </section>

      <DetailSection title="绑定冲突" description="此处只读，转移只能在冲突详情中批准。">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>平台店铺</TableHead>
              <TableHead>对方租户</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>申诉截止</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conflicts.isLoading ? (
              <TableLoadingRow colSpan={4} />
            ) : conflicts.isError ? (
              <TableErrorRow colSpan={4} message={conflicts.error.message} onRetry={() => conflicts.refetch()} />
            ) : conflicts.data?.items.length ? (
              conflicts.data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <LocaleLink className="underline" href={`/console/shop-conflicts/${item.id}`}>
                      {item.platform} / {item.externalShopId}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>
                    {item.occupantShopId === shop.id
                      ? item.challengerOrganizationName
                      : item.occupantOrganizationName}
                  </TableCell>
                  <TableCell>{item.statusLabel}</TableCell>
                  <TableCell className="text-xs">{formatOpsTime(item.appealDeadlineAt)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableEmptyRow colSpan={4}>暂无绑定冲突。</TableEmptyRow>
            )}
          </TableBody>
        </Table>
        <ListPagination
          page={conflictsPager.page}
          totalPages={Math.max(1, Math.ceil((conflicts.data?.total ?? 0) / conflictsPager.pageSize))}
          totalItems={conflicts.data?.total ?? 0}
          pageSize={conflictsPager.pageSize}
          onPageChange={conflictsPager.setPage}
          onPageSizeChange={conflictsPager.setPageSize}
        />
      </DetailSection>

      <DetailSection title="授权异常">
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
            {exceptions.isLoading ? (
              <TableLoadingRow colSpan={4} />
            ) : exceptions.isError ? (
              <TableErrorRow colSpan={4} message={exceptions.error.message} onRetry={() => exceptions.refetch()} />
            ) : exceptions.data?.items.length ? (
              exceptions.data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs">
                    <LocaleLink className="underline" href={`/console/auth-exceptions/${item.id}`}>
                      {formatOpsTime(item.createdAt)}
                    </LocaleLink>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{item.errorCode}</TableCell>
                  <TableCell>{item.reason}</TableCell>
                  <TableCell className="text-muted-foreground">{item.advice}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableEmptyRow colSpan={4}>暂无授权异常。</TableEmptyRow>
            )}
          </TableBody>
        </Table>
        <ListPagination
          page={exceptionsPager.page}
          totalPages={Math.max(1, Math.ceil((exceptions.data?.total ?? 0) / exceptionsPager.pageSize))}
          totalItems={exceptions.data?.total ?? 0}
          pageSize={exceptionsPager.pageSize}
          onPageChange={exceptionsPager.setPage}
          onPageSizeChange={exceptionsPager.setPageSize}
        />
      </DetailSection>

      <DetailSection title="待审动作">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>类型</TableHead>
              <TableHead>标题</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>创建时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {actions.isLoading ? (
              <TableLoadingRow colSpan={4} />
            ) : actions.isError ? (
              <TableErrorRow colSpan={4} message={actions.error.message} onRetry={() => actions.refetch()} />
            ) : actions.data?.items.length ? (
              actions.data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.kind}</TableCell>
                  <TableCell>
                    <LocaleLink className="underline" href={`/console/pending-actions/${item.id}`}>
                      {item.title}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>{item.status}</TableCell>
                  <TableCell className="text-xs">{formatOpsTime(item.createdAt)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableEmptyRow colSpan={4}>暂无待审动作。</TableEmptyRow>
            )}
          </TableBody>
        </Table>
        <ListPagination
          page={actionsPager.page}
          totalPages={Math.max(1, Math.ceil((actions.data?.total ?? 0) / actionsPager.pageSize))}
          totalItems={actions.data?.total ?? 0}
          pageSize={actionsPager.pageSize}
          onPageChange={actionsPager.setPage}
          onPageSizeChange={actionsPager.setPageSize}
        />
      </DetailSection>

      <DetailSection title="集成日志">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>动作</TableHead>
              <TableHead>方向</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>消息</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.isLoading ? (
              <TableLoadingRow colSpan={5} />
            ) : logs.isError ? (
              <TableErrorRow colSpan={5} message={logs.error.message} onRetry={() => logs.refetch()} />
            ) : logs.data?.items.length ? (
              logs.data.items.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs">{formatOpsTime(log.createdAt)}</TableCell>
                  <TableCell className="font-mono text-xs">{log.action}</TableCell>
                  <TableCell className="text-xs">{log.direction}</TableCell>
                  <TableCell>
                    <Badge variant={log.status === 'success' ? 'secondary' : 'destructive'}>{log.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{log.message || '—'}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableEmptyRow colSpan={5}>暂无集成日志。</TableEmptyRow>
            )}
          </TableBody>
        </Table>
        <ListPagination
          page={logsPager.page}
          totalPages={Math.max(1, Math.ceil((logs.data?.total ?? 0) / logsPager.pageSize))}
          totalItems={logs.data?.total ?? 0}
          pageSize={logsPager.pageSize}
          onPageChange={logsPager.setPage}
          onPageSizeChange={logsPager.setPageSize}
        />
      </DetailSection>

      <DetailSection title="平台审计">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>操作者</TableHead>
              <TableHead>动作</TableHead>
              <TableHead>结果</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {audit.isLoading ? (
              <TableLoadingRow colSpan={4} />
            ) : audit.isError ? (
              <TableErrorRow colSpan={4} message={audit.error.message} onRetry={() => audit.refetch()} />
            ) : audit.data?.items.length ? (
              audit.data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs">{formatOpsTime(item.createdAt)}</TableCell>
                  <TableCell>{item.actor?.name || item.actorLabel || item.actorUserId || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{item.action}</TableCell>
                  <TableCell>{item.result || '—'}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableEmptyRow colSpan={4}>暂无平台审计。</TableEmptyRow>
            )}
          </TableBody>
        </Table>
        <ListPagination
          page={auditPager.page}
          totalPages={Math.max(1, Math.ceil((audit.data?.total ?? 0) / auditPager.pageSize))}
          totalItems={audit.data?.total ?? 0}
          pageSize={auditPager.pageSize}
          onPageChange={auditPager.setPage}
          onPageSizeChange={auditPager.setPageSize}
        />
      </DetailSection>

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <ConfirmReasonDialog
        open={disableOpen}
        onOpenChange={setDisableOpen}
        title="停用店铺"
        description={`确认停用店铺「${shop.name}」？停用将暂停同步并通知租户。停用店仍占绑定名额。`}
        confirmLabel="确认停用"
        confirmVariant="destructive"
        reasonLabel="停用原因"
        placeholder="可填写停用原因（可留空）"
        required={false}
        pending={disable.isPending}
        onConfirm={(reason) =>
          disable.mutate({ shopId: shop.id, reason: reason || undefined })
        }
      />
      <ConfirmActionDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title="恢复店铺"
        description={`确认恢复店铺「${shop.name}」？恢复后需租户重新授权。`}
        confirmLabel="确认恢复"
        pending={restore.isPending}
        onConfirm={() => restore.mutate({ shopId: shop.id })}
      />
    </div>
  )
}
