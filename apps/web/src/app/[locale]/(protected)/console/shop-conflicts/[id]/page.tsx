'use client'

import * as React from 'react'
import { DetailBackButton } from '@/components/console/detail-back-button'
import { DetailField, DetailSection } from '@/components/console/detail-section'
import { ConfirmReasonDialog } from '@/components/shared/confirm-reason-dialog'
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

export default function ShopConflictDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const id = React.use(params).id
  const utils = trpc.useUtils()
  const query = trpc.platformOnboarding.getConflict.useQuery({ id })
  const exceptionsPager = useListPagination()
  const exceptions = trpc.platformOps.authExceptions.useQuery({
    shopId: query.data?.challengerShopId,
    page: exceptionsPager.page,
    pageSize: exceptionsPager.pageSize,
  }, { enabled: Boolean(query.data?.challengerShopId) })
  const [notice, setNotice] = React.useState('')
  const [upholdOpen, setUpholdOpen] = React.useState(false)
  const [transferOpen, setTransferOpen] = React.useState(false)
  const [acceptOpen, setAcceptOpen] = React.useState(false)
  const [rejectOpen, setRejectOpen] = React.useState(false)

  const invalidate = async () => {
    await utils.platformOnboarding.getConflict.invalidate({ id })
    await utils.platformOnboarding.listConflicts.invalidate()
  }

  const uphold = trpc.platformOnboarding.upholdConflict.useMutation({
    onSuccess: async () => {
      setNotice('已维持原绑定。')
      setUpholdOpen(false)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const approveTransfer = trpc.platformOnboarding.approveTransfer.useMutation({
    onSuccess: async () => {
      setNotice('已批准转移。系统不会自动通知原租户，如需告知请自行联系。历史数据不会迁移。')
      setTransferOpen(false)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const reviewAppeal = trpc.platformOnboarding.reviewAppeal.useMutation({
    onSuccess: async () => {
      setNotice('申诉复审已提交。系统不会自动发送通知。')
      setAcceptOpen(false)
      setRejectOpen(false)
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  if (query.isLoading) return <PageDataLoading />
  if (!query.data) {
    return <p className="text-sm text-muted-foreground">冲突单不存在。</p>
  }

  const conflict = query.data
  const pending = uphold.isPending || approveTransfer.isPending || reviewAppeal.isPending

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <DetailBackButton href="/console/shop-conflicts" />
        <h2 className="text-lg font-medium">
          {conflict.platform} / {conflict.externalShopId}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{conflict.statusLabel}</Badge>
        </div>
      </div>

      <DetailSection
        title="冲突概要"
        description="「同一家店」主键是平台 + 平台店铺 ID。后来者授权已被拒绝且未保存 token。"
      >
        <dl>
          <DetailField label="平台" value={conflict.platform} />
          <DetailField label="平台店铺 ID" value={conflict.externalShopId} />
          <DetailField label="状态" value={conflict.statusLabel} />
          <DetailField label="创建时间" value={formatOpsTime(conflict.createdAt)} />
          <DetailField label="更新时间" value={formatOpsTime(conflict.updatedAt)} />
        </dl>
      </DetailSection>

      <DetailSection title="占用方（原绑定）">
        <dl>
          <DetailField
            label="租户"
            value={
              <LocaleLink className="underline" href={`/console/tenants/${conflict.occupantOrganizationId}`}>
                {conflict.occupantOrganizationName}
              </LocaleLink>
            }
          />
          <DetailField label="租户 Slug" value={conflict.occupantOrganizationSlug} />
          <DetailField
            label="入驻 / 组织状态"
            value={`${conflict.occupantOrganizationEntryApproved ? '入驻已通过' : '入驻未通过'} / ${conflict.occupantOrganizationStatus}`}
          />
          <DetailField
            label="店铺"
            value={
              <LocaleLink className="underline" href={`/console/shops/${conflict.occupantShopId}`}>
                {conflict.occupantShopName}
              </LocaleLink>
            }
          />
          <DetailField label="授权状态" value={STATUS_LABELS[conflict.occupantShopStatus] ?? conflict.occupantShopStatus} />
          <DetailField label="卖家 ID" value={conflict.occupantShopSellerId} />
          <DetailField label="授权到期" value={formatOpsTime(conflict.occupantShopAuthExpiresAt)} />
          <DetailField label="同步健康" value={conflict.occupantShopHealth || '—'} />
        </dl>
      </DetailSection>

      <DetailSection title="后来者" description="后来者店铺应无可用 token，不能凭后台登录自动换主人。">
        <dl>
          <DetailField
            label="租户"
            value={
              <LocaleLink className="underline" href={`/console/tenants/${conflict.challengerOrganizationId}`}>
                {conflict.challengerOrganizationName}
              </LocaleLink>
            }
          />
          <DetailField label="租户 Slug" value={conflict.challengerOrganizationSlug} />
          <DetailField
            label="入驻 / 组织状态"
            value={`${conflict.challengerOrganizationEntryApproved ? '入驻已通过' : '入驻未通过'} / ${conflict.challengerOrganizationStatus}`}
          />
          <DetailField
            label="店铺"
            value={
              <LocaleLink className="underline" href={`/console/shops/${conflict.challengerShopId}`}>
                {conflict.challengerShopName}
              </LocaleLink>
            }
          />
          <DetailField label="授权状态" value={STATUS_LABELS[conflict.challengerShopStatus] ?? conflict.challengerShopStatus} />
          <DetailField label="卖家 ID" value={conflict.challengerShopSellerId} />
          <DetailField label="授权到期" value={formatOpsTime(conflict.challengerShopAuthExpiresAt)} />
          <DetailField label="同步健康" value={conflict.challengerShopHealth || '—'} />
        </dl>
      </DetailSection>

      <DetailSection title="发起人">
        <dl>
          <DetailField
            label="发起人"
            value={
              conflict.initiator ? (
                <LocaleLink className="underline" href={`/console/users/${conflict.initiator.id}`}>
                  {conflict.initiator.name}
                  {conflict.initiator.email ? `（${conflict.initiator.email}）` : ''}
                </LocaleLink>
              ) : (
                conflict.initiatorUserId || '—'
              )
            }
          />
        </dl>
      </DetailSection>

      <DetailSection title="裁决记录">
        <dl>
          <DetailField label="裁决人" value={conflict.reviewer?.name || conflict.reviewedByUserId} />
          <DetailField label="裁决时间" value={formatOpsTime(conflict.reviewedAt)} />
          <DetailField label="裁决原因" value={conflict.reviewReason} />
        </dl>
      </DetailSection>

      <DetailSection title="申诉">
        <dl>
          <DetailField label="申诉截止" value={formatOpsTime(conflict.appealDeadlineAt)} />
          <DetailField label="申诉内容" value={conflict.appealContent} />
          <DetailField label="申诉时间" value={formatOpsTime(conflict.appealedAt)} />
          <DetailField
            label="申诉人"
            value={
              conflict.appellant ? (
                <LocaleLink className="underline" href={`/console/users/${conflict.appellant.id}`}>
                  {conflict.appellant.name}
                </LocaleLink>
              ) : (
                conflict.appealedByUserId
              )
            }
          />
          <DetailField label="复审人" value={conflict.appealReviewer?.name || conflict.appealReviewedByUserId} />
          <DetailField label="复审时间" value={formatOpsTime(conflict.appealReviewedAt)} />
          <DetailField label="复审原因" value={conflict.appealReviewReason} />
        </dl>
      </DetailSection>

      <DetailSection
        title="释放与结案"
        description={
          conflict.status === 'transfer_approved_pending_appeal'
            ? '等待原租户申诉。系统不会自动通知原租户，请自行判断是否联系。'
            : undefined
        }
      >
        <dl>
          <DetailField label="释放时间" value={formatOpsTime(conflict.releasedAt)} />
          <DetailField label="结案时间" value={formatOpsTime(conflict.closedAt)} />
        </dl>
      </DetailSection>

      <DetailSection title="相关授权异常">
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
            {exceptions.isLoading ? (
              <TableLoadingRow colSpan={4} />
            ) : exceptions.isError ? (
              <TableErrorRow
                colSpan={4}
                message={exceptions.error.message}
                onRetry={() => exceptions.refetch()}
              />
            ) : exceptions.data?.items.length ? (
              exceptions.data.items.map((item) => (
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
              ))
            ) : (
              <TableEmptyRow colSpan={4}>暂无相关授权异常。</TableEmptyRow>
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

      {conflict.status === 'pending' ? (
        <DetailSection
          title="处理操作"
          description="默认结案是维持原绑定。批准转移必须填写核实原因；批准后进入申诉窗口，历史订单、库存和结算留在原租户。"
        >
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={pending} onClick={() => setUpholdOpen(true)}>
              维持原绑定
            </Button>
            <Button disabled={pending} onClick={() => setTransferOpen(true)}>
              批准转移
            </Button>
          </div>
        </DetailSection>
      ) : conflict.status === 'appealed_pending_review' ? (
        <DetailSection title="处理操作" description="接受申诉将维持原绑定；驳回申诉将释放名额。历史数据不会迁移。">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={pending} onClick={() => setAcceptOpen(true)}>
              接受申诉
            </Button>
            <Button disabled={pending} onClick={() => setRejectOpen(true)}>
              驳回申诉
            </Button>
          </div>
        </DetailSection>
      ) : (
        <p className="text-sm text-muted-foreground">
          {conflict.status === 'transfer_approved_pending_appeal'
            ? '等待原租户申诉。系统不会自动通知，请自行判断是否联系。'
            : conflict.status === 'released_pending_reauth'
              ? '名额已释放，等待后来者重新授权。'
              : '该冲突单已结案。'}
        </p>
      )}

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <ConfirmReasonDialog
        open={upholdOpen}
        onOpenChange={setUpholdOpen}
        title="维持原绑定"
        description="确认维持原绑定并关闭后来者的这次申请？原因可填写备注。"
        confirmLabel="确认维持"
        reasonLabel="备注"
        placeholder="可选填写备注"
        required={false}
        pending={uphold.isPending}
        onConfirm={(reason) =>
          uphold.mutate({ conflictId: conflict.id, reason: reason || undefined })
        }
      />
      <ConfirmReasonDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        title="批准转移"
        description="确认批准转移？批准后将进入原租户申诉窗口（若窗口天数大于 0）。系统不会自动通知原租户。历史数据不会迁移。"
        confirmLabel="确认批准"
        placeholder="请填写核实原因（必填）"
        required
        pending={approveTransfer.isPending}
        onConfirm={(reason) => approveTransfer.mutate({ conflictId: conflict.id, reason })}
      />
      <ConfirmReasonDialog
        open={acceptOpen}
        onOpenChange={setAcceptOpen}
        title="接受申诉"
        description="确认接受申诉并维持原绑定？"
        confirmLabel="确认接受"
        placeholder="请填写复审原因（必填）"
        required
        pending={reviewAppeal.isPending}
        onConfirm={(reason) =>
          reviewAppeal.mutate({ conflictId: conflict.id, decision: 'accept', reason })
        }
      />
      <ConfirmReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="驳回申诉"
        description="确认驳回申诉并释放名额？历史数据不会迁移。"
        confirmLabel="确认驳回"
        confirmVariant="destructive"
        placeholder="请填写复审原因（必填）"
        required
        pending={reviewAppeal.isPending}
        onConfirm={(reason) =>
          reviewAppeal.mutate({ conflictId: conflict.id, decision: 'reject', reason })
        }
      />
    </div>
  )
}
