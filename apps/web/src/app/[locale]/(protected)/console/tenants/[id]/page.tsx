'use client'

import * as React from 'react'
import { DetailBackButton } from '@/components/console/detail-back-button'
import { DetailField, DetailSection } from '@/components/console/detail-section'
import { ConfirmActionDialog } from '@/components/shared/confirm-action-dialog'
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

function SubTableShell({
  loading,
  error,
  onRetry,
  colSpan,
  empty,
  hasItems,
  children,
}: {
  loading: boolean
  error?: { message: string } | null
  onRetry: () => void
  colSpan: number
  empty: string
  hasItems: boolean
  children: React.ReactNode
}) {
  if (loading) return <TableLoadingRow colSpan={colSpan} />
  if (error) {
    return <TableErrorRow colSpan={colSpan} message={error.message} onRetry={onRetry} />
  }
  if (!hasItems) return <TableEmptyRow colSpan={colSpan}>{empty}</TableEmptyRow>
  return children
}

export default function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const id = React.use(params).id
  const utils = trpc.useUtils()
  const query = trpc.platformOnboarding.getTenant.useQuery({ id })
  const shopsPager = useListPagination()
  const membersPager = useListPagination()
  const conflictsPager = useListPagination()
  const exceptionsPager = useListPagination()
  const credentialsPager = useListPagination()
  const actionsPager = useListPagination()
  const auditPager = useListPagination()
  const [notice, setNotice] = React.useState('')
  const [disableOpen, setDisableOpen] = React.useState(false)

  const shops = trpc.platformShops.list.useQuery({
    organizationId: id,
    page: shopsPager.page,
    pageSize: shopsPager.pageSize,
  })
  const members = trpc.platformOnboarding.listTenantMembers.useQuery({
    organizationId: id,
    page: membersPager.page,
    pageSize: membersPager.pageSize,
  })
  const conflicts = trpc.platformOnboarding.listConflicts.useQuery({
    organizationId: id,
    page: conflictsPager.page,
    pageSize: conflictsPager.pageSize,
  })
  const exceptions = trpc.platformOps.authExceptions.useQuery({
    organizationId: id,
    page: exceptionsPager.page,
    pageSize: exceptionsPager.pageSize,
  })
  const credentials = trpc.platformOnboarding.listTenantCredentials.useQuery({
    organizationId: id,
    page: credentialsPager.page,
    pageSize: credentialsPager.pageSize,
  })
  const actions = trpc.platformOps.pendingActions.useQuery({
    organizationId: id,
    page: actionsPager.page,
    pageSize: actionsPager.pageSize,
  })
  const audit = trpc.platformOnboarding.listAuditEvents.useQuery({
    organizationId: id,
    page: auditPager.page,
    pageSize: auditPager.pageSize,
  })

  const disable = trpc.platformOnboarding.disableTenant.useMutation({
    onSuccess: async (result) => {
      setNotice(`租户已停用，${result.shops} 个店铺已停止同步。`)
      setDisableOpen(false)
      await utils.platformOnboarding.getTenant.invalidate({ id })
      await utils.platformOnboarding.tenants.invalidate()
      await utils.platformShops.list.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  if (query.isLoading) return <PageDataLoading />
  if (!query.data) {
    return <p className="text-sm text-muted-foreground">租户不存在。</p>
  }

  const { tenant, parent, application } = query.data

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <DetailBackButton href="/console/tenants" />
          <h2 className="text-lg font-medium">{tenant.name}</h2>
          <p className="font-mono text-xs text-muted-foreground">{tenant.slug || '—'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={tenant.status === 'active' ? 'secondary' : 'destructive'}>
            {tenant.status}
          </Badge>
          {tenant.status === 'active' ? (
            <Button variant="destructive" size="sm" onClick={() => setDisableOpen(true)}>
              停用
            </Button>
          ) : null}
        </div>
      </div>

      <DetailSection title="租户信息">
        <dl>
          <DetailField label="名称" value={tenant.name} />
          <DetailField label="Slug" value={tenant.slug} />
          <DetailField label="状态" value={tenant.status} />
          <DetailField label="入驻是否通过" value={tenant.entryApproved ? '已通过' : '未通过'} />
          <DetailField label="实名状态" value={tenant.identityStatus} />
          <DetailField label="企业认证" value={tenant.enterpriseVerificationStatus} />
          <DetailField label="商户状态" value={tenant.merchantStatus} />
          <DetailField label="创建时间" value={formatOpsTime(tenant.createdAt)} />
          {parent ? (
            <DetailField
              label="父组织"
              value={`${parent.name}${parent.slug ? `（${parent.slug}）` : ''}`}
            />
          ) : null}
        </dl>
      </DetailSection>

      <DetailSection title="入驻申请">
        {application ? (
          <dl>
            <DetailField
              label="企业名称"
              value={
                <LocaleLink className="underline" href={`/console/onboarding/${application.id}`}>
                  {application.companyName}
                </LocaleLink>
              }
            />
            <DetailField label="注册号" value={application.registrationNo} />
            <DetailField label="国家" value={application.countryCode} />
            <DetailField label="联系人" value={`${application.contactName} ${application.contactPhone}`} />
            <DetailField label="状态" value={application.status} />
            <DetailField label="版本" value={application.version} />
            <DetailField label="提交时间" value={formatOpsTime(application.submittedAt)} />
            <DetailField label="审核时间" value={formatOpsTime(application.reviewedAt)} />
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">该租户尚未提交入驻申请。</p>
        )}
      </DetailSection>

      <DetailSection title="店铺">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>店铺</TableHead>
              <TableHead>平台 / 站点</TableHead>
              <TableHead>平台店铺 ID</TableHead>
              <TableHead>授权</TableHead>
              <TableHead>同步健康</TableHead>
              <TableHead>授权到期</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SubTableShell
              loading={shops.isLoading}
              error={shops.error}
              onRetry={() => shops.refetch()}
              colSpan={6}
              empty="暂无店铺。"
              hasItems={Boolean(shops.data?.items.length)}
            >
              {shops.data?.items.map((shop) => (
                <TableRow key={shop.id}>
                  <TableCell>
                    <LocaleLink className="underline" href={`/console/shops/${shop.id}`}>
                      {shop.name}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>
                    {shop.platform}
                    {shop.region ? ` / ${shop.region.toUpperCase()}` : ''}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{shop.externalShopId || '—'}</TableCell>
                  <TableCell>{STATUS_LABELS[shop.status] ?? shop.status}</TableCell>
                  <TableCell>{shop.health || '—'}</TableCell>
                  <TableCell className="text-xs">{formatOpsTime(shop.authExpiresAt)}</TableCell>
                </TableRow>
              ))}
            </SubTableShell>
          </TableBody>
        </Table>
        <ListPagination
          page={shopsPager.page}
          totalPages={Math.max(1, Math.ceil((shops.data?.total ?? 0) / shopsPager.pageSize))}
          totalItems={shops.data?.total ?? 0}
          pageSize={shopsPager.pageSize}
          onPageChange={shopsPager.setPage}
          onPageSizeChange={shopsPager.setPageSize}
        />
      </DetailSection>

      <DetailSection title="成员">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>手机</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>加入时间</TableHead>
              <TableHead>封禁</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SubTableShell
              loading={members.isLoading}
              error={members.error}
              onRetry={() => members.refetch()}
              colSpan={6}
              empty="暂无成员。"
              hasItems={Boolean(members.data?.items.length)}
            >
              {members.data?.items.map((item) => (
                <TableRow key={item.userId}>
                  <TableCell>
                    <LocaleLink className="underline" href={`/console/users/${item.userId}`}>
                      {item.name || item.email}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>{item.email}</TableCell>
                  <TableCell>{item.phoneNumber || '—'}</TableCell>
                  <TableCell>{item.role}</TableCell>
                  <TableCell className="text-xs">{formatOpsTime(item.joinedAt)}</TableCell>
                  <TableCell>{item.banned ? '已封禁' : '正常'}</TableCell>
                </TableRow>
              ))}
            </SubTableShell>
          </TableBody>
        </Table>
        <ListPagination
          page={membersPager.page}
          totalPages={Math.max(1, Math.ceil((members.data?.total ?? 0) / membersPager.pageSize))}
          totalItems={members.data?.total ?? 0}
          pageSize={membersPager.pageSize}
          onPageChange={membersPager.setPage}
          onPageSizeChange={membersPager.setPageSize}
        />
      </DetailSection>

      <DetailSection title="店铺冲突">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>平台店铺</TableHead>
              <TableHead>对方</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>申诉截止</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SubTableShell
              loading={conflicts.isLoading}
              error={conflicts.error}
              onRetry={() => conflicts.refetch()}
              colSpan={4}
              empty="暂无店铺冲突。"
              hasItems={Boolean(conflicts.data?.items.length)}
            >
              {conflicts.data?.items.map((item) => {
                const otherName =
                  item.occupantOrganizationId === id
                    ? item.challengerOrganizationName
                    : item.occupantOrganizationName
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <LocaleLink className="underline" href={`/console/shop-conflicts/${item.id}`}>
                        {item.platform} / {item.externalShopId}
                      </LocaleLink>
                    </TableCell>
                    <TableCell>{otherName}</TableCell>
                    <TableCell>{item.statusLabel}</TableCell>
                    <TableCell className="text-xs">{formatOpsTime(item.appealDeadlineAt)}</TableCell>
                  </TableRow>
                )
              })}
            </SubTableShell>
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
              <TableHead>店铺</TableHead>
              <TableHead>错误码</TableHead>
              <TableHead>原因</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SubTableShell
              loading={exceptions.isLoading}
              error={exceptions.error}
              onRetry={() => exceptions.refetch()}
              colSpan={4}
              empty="暂无授权异常。"
              hasItems={Boolean(exceptions.data?.items.length)}
            >
              {exceptions.data?.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs">{formatOpsTime(item.createdAt)}</TableCell>
                  <TableCell>
                    <LocaleLink className="underline" href={`/console/auth-exceptions/${item.id}`}>
                      {item.shopName}
                    </LocaleLink>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{item.errorCode}</TableCell>
                  <TableCell>{item.reason}</TableCell>
                </TableRow>
              ))}
            </SubTableShell>
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

      <DetailSection
        title="应用凭据摘要"
        description="只展示 appKey、状态和最近错误，不会返回密钥。"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>平台</TableHead>
              <TableHead>站点</TableHead>
              <TableHead>App Key</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>最近校验</TableHead>
              <TableHead>最近错误</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SubTableShell
              loading={credentials.isLoading}
              error={credentials.error}
              onRetry={() => credentials.refetch()}
              colSpan={6}
              empty="暂无应用凭据。"
              hasItems={Boolean(credentials.data?.items.length)}
            >
              {credentials.data?.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.platform}</TableCell>
                  <TableCell>{item.region || '通用'}</TableCell>
                  <TableCell className="font-mono text-xs">{item.appKey}</TableCell>
                  <TableCell>{item.status}</TableCell>
                  <TableCell className="text-xs">{formatOpsTime(item.lastVerifiedAt)}</TableCell>
                  <TableCell className="text-xs">{item.lastError || '—'}</TableCell>
                </TableRow>
              ))}
            </SubTableShell>
          </TableBody>
        </Table>
        <ListPagination
          page={credentialsPager.page}
          totalPages={Math.max(1, Math.ceil((credentials.data?.total ?? 0) / credentialsPager.pageSize))}
          totalItems={credentials.data?.total ?? 0}
          pageSize={credentialsPager.pageSize}
          onPageChange={credentialsPager.setPage}
          onPageSizeChange={credentialsPager.setPageSize}
        />
      </DetailSection>

      <DetailSection title="待审动作">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>类型</TableHead>
              <TableHead>标题</TableHead>
              <TableHead>店铺</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>创建时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SubTableShell
              loading={actions.isLoading}
              error={actions.error}
              onRetry={() => actions.refetch()}
              colSpan={5}
              empty="暂无待审动作。"
              hasItems={Boolean(actions.data?.items.length)}
            >
              {actions.data?.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.kind}</TableCell>
                  <TableCell>
                    <LocaleLink className="underline" href={`/console/pending-actions/${item.id}`}>
                      {item.title}
                    </LocaleLink>
                  </TableCell>
                  <TableCell>
                    {item.shopId ? (
                      <LocaleLink className="underline" href={`/console/shops/${item.shopId}`}>
                        {item.shopName}
                      </LocaleLink>
                    ) : (
                      item.shopName || '—'
                    )}
                  </TableCell>
                  <TableCell>{item.status}</TableCell>
                  <TableCell className="text-xs">{formatOpsTime(item.createdAt)}</TableCell>
                </TableRow>
              ))}
            </SubTableShell>
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

      <DetailSection title="平台审计">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>操作者</TableHead>
              <TableHead>动作</TableHead>
              <TableHead>对象</TableHead>
              <TableHead>结果</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SubTableShell
              loading={audit.isLoading}
              error={audit.error}
              onRetry={() => audit.refetch()}
              colSpan={5}
              empty="暂无平台审计。"
              hasItems={Boolean(audit.data?.items.length)}
            >
              {audit.data?.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs">{formatOpsTime(item.createdAt)}</TableCell>
                  <TableCell>{item.actor?.name || item.actorLabel || item.actorUserId || '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{item.action}</TableCell>
                  <TableCell className="text-xs">
                    {item.entityType}
                    {item.entityId ? ` / ${item.entityId}` : ''}
                  </TableCell>
                  <TableCell>{item.result || '—'}</TableCell>
                </TableRow>
              ))}
            </SubTableShell>
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

      <ConfirmActionDialog
        open={disableOpen}
        onOpenChange={setDisableOpen}
        title="停用租户"
        description={`确认停用租户「${tenant.name}」？其店铺将停止同步。停用店仍占绑定名额，不会把店铺改绑到其他租户。`}
        confirmLabel="确认停用"
        confirmVariant="destructive"
        pending={disable.isPending}
        onConfirm={() => disable.mutate({ organizationId: tenant.id })}
      />
    </div>
  )
}
