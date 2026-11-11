'use client'

import * as React from 'react'
import { ConfirmActionDialog } from '@/components/shared/confirm-action-dialog'
import { ConfirmReasonDialog } from '@/components/shared/confirm-reason-dialog'
import { PageDataLoading } from '@/components/shared/data-table'
import { ListPagination } from '@/components/shared/list-pagination'
import { formatOpsTime } from '@/lib/console/format-time'
import { LocaleLink } from '@/lib/i18n/navigation'
import { useListPagination } from '@/lib/pagination/use-list-pagination'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Textarea } from '@workspace/ui/components/textarea'

const HANDLER_LABELS: Record<string, string> = {
  legal_rep: '法定代表人本人办理',
  authorized_agent: '授权代理人办理',
}

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  submitted: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  suspended: '已暂停',
}

const SHOP_STATUS_LABELS: Record<string, string> = {
  draft: '待授权',
  connecting: '连接中',
  active: '已授权',
  error: '授权失效',
  disabled: '已停用',
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b py-2 sm:grid-cols-[180px_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value || '—'}</dd>
    </div>
  )
}

function FileLink({ href, name }: { href: string | null; name?: string | null }) {
  if (!href) return <span className="text-muted-foreground">未上传</span>
  return (
    <a
      className="text-primary underline underline-offset-2"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {name || '查看附件'}
    </a>
  )
}

export default function OnboardingReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const id = React.use(params).id
  const utils = trpc.useUtils()
  const query = trpc.platformOnboarding.get.useQuery({ id })
  const [note, setNote] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [approveOpen, setApproveOpen] = React.useState(false)
  const [rejectOpen, setRejectOpen] = React.useState(false)
  const shopsPager = useListPagination()
  const shopsQuery = trpc.platformShops.list.useQuery(
    {
      organizationId: query.data?.organization.id ?? '',
      page: shopsPager.page,
      pageSize: shopsPager.pageSize,
    },
    { enabled: Boolean(query.data?.organization.id) },
  )

  const approve = trpc.platformOnboarding.approve.useMutation({
    onSuccess: async () => {
      setNotice('已通过审核，租户现在可以绑定店铺。')
      setApproveOpen(false)
      await utils.platformOnboarding.get.invalidate({ id })
      await utils.platformOnboarding.list.invalidate()
      await utils.platformOnboarding.tenants.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const reject = trpc.platformOnboarding.reject.useMutation({
    onSuccess: async () => {
      setNotice('已驳回，租户可修改后重新提交。')
      setRejectOpen(false)
      await utils.platformOnboarding.get.invalidate({ id })
      await utils.platformOnboarding.list.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  if (query.isLoading) {
    return <PageDataLoading />
  }
  if (!query.data) {
    return <p className="text-sm text-muted-foreground">入驻申请不存在。</p>
  }

  const { application: app, organization, files, applicant, reviewer } = query.data
  const pending = app.status === 'submitted'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            <LocaleLink className="underline" href="/console/onboarding">
              入驻审核
            </LocaleLink>{' '}
            / 申请详情
          </p>
          <h2 className="text-lg font-medium">{app.companyName}</h2>
          <p className="text-sm text-muted-foreground">
            租户{' '}
            <LocaleLink className="underline" href={`/console/tenants/${organization.id}`}>
              {organization.name}
            </LocaleLink>
            {' '}· 提交版本 v{app.version}
          </p>
        </div>
        <Badge variant={pending ? 'default' : app.status === 'approved' ? 'secondary' : 'destructive'}>
          {STATUS_LABELS[app.status] ?? app.status}
        </Badge>
      </div>

      <section>
        <h3 className="mb-2 font-medium">主体资料</h3>
        <dl>
          <Field label="主体类型" value={app.subjectType === 'individual' ? '个人' : '企业'} />
          <Field label="企业 / 主体名称" value={app.companyName} />
          <Field label="注册号 / 证件号" value={app.registrationNo} />
          <Field label="国家 / 地区" value={app.countryCode} />
          <Field label="法定代表人" value={app.legalRepresentative} />
          <Field label="办理方式" value={HANDLER_LABELS[app.handlerType] ?? app.handlerType} />
          <Field
            label="营业执照 / 证件"
            value={<FileLink href={files.license} name={app.licenseFileName} />}
          />
        </dl>
      </section>

      <section>
        <h3 className="mb-2 font-medium">联系人</h3>
        <dl>
          <Field label="姓名" value={app.contactName} />
          <Field label="电话" value={app.contactPhone} />
          <Field label="邮箱" value={app.contactEmail} />
          <Field
            label="申请人"
            value={
              applicant ? (
                <LocaleLink className="underline" href={`/console/users/${applicant.id}`}>
                  {applicant.name}
                  {applicant.email ? `（${applicant.email}）` : ''}
                </LocaleLink>
              ) : (
                app.applicantUserId
              )
            }
          />
        </dl>
      </section>

      {app.subjectType === 'enterprise' ? (
        <section>
          <h3 className="mb-2 font-medium">法人 / 代理人材料</h3>
          <dl>
            <Field label="法人身份证号" value={app.legalRepIdNo} />
            <Field label="法人身份证正面" value={<FileLink href={files.legalRepFront} />} />
            <Field label="法人身份证反面" value={<FileLink href={files.legalRepBack} />} />
            {app.handlerType === 'authorized_agent' ? (
              <>
                <Field label="授权书" value={<FileLink href={files.authorization} />} />
                <Field label="代理人姓名" value={app.agentName} />
                <Field label="代理人身份证号" value={app.agentIdNo} />
                <Field label="代理人身份证正面" value={<FileLink href={files.agentFront} />} />
                <Field label="代理人身份证反面" value={<FileLink href={files.agentBack} />} />
              </>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section>
        <h3 className="mb-2 font-medium">组织审核状态</h3>
        <dl>
          <Field label="入驻通过（entryApproved）" value={organization.entryApproved ? '是' : '否'} />
          <Field label="实名状态" value={organization.identityStatus} />
          <Field label="入驻状态" value={organization.merchantStatus} />
        </dl>
      </section>

      <section className="space-y-3">
        <h3 className="mb-2 font-medium">关联店铺（{shopsQuery.data?.total ?? 0} 家）</h3>
        {shopsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">加载中…</p>
        ) : shopsQuery.data?.items.length ? (
          <div className="space-y-2">
            {shopsQuery.data.items.map((shop) => (
              <div
                key={shop.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <div>
                  <LocaleLink className="font-medium underline" href={`/console/shops/${shop.id}`}>
                    {shop.name}
                  </LocaleLink>
                  <span className="text-muted-foreground">
                    {' '}
                    {shop.platform}
                    {shop.region ? ` · ${shop.region.toUpperCase()}` : ''}
                    {shop.externalShopId ? ` · ${shop.externalShopId}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {shop.health ? (
                    <Badge variant={shop.health === 'error' ? 'destructive' : 'secondary'}>
                      同步 {shop.health}
                    </Badge>
                  ) : null}
                  <Badge variant={shop.status === 'active' ? 'default' : 'secondary'}>
                    {SHOP_STATUS_LABELS[shop.status] ?? shop.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">该租户尚未创建店铺。</p>
        )}
        <ListPagination
          page={shopsPager.page}
          totalPages={Math.max(1, Math.ceil((shopsQuery.data?.total ?? 0) / shopsPager.pageSize))}
          totalItems={shopsQuery.data?.total ?? 0}
          pageSize={shopsPager.pageSize}
          onPageChange={shopsPager.setPage}
          onPageSizeChange={shopsPager.setPageSize}
        />
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">审核记录</h3>
        <dl>
          <Field
            label="提交时间"
            value={app.submittedAt ? formatOpsTime(app.submittedAt) : null}
          />
          <Field
            label="审核时间"
            value={app.reviewedAt ? formatOpsTime(app.reviewedAt) : null}
          />
          <Field
            label="审核人"
            value={
              reviewer ? (
                `${reviewer.name}${reviewer.email ? `（${reviewer.email}）` : ''}`
              ) : (
                app.reviewedBy
              )
            }
          />
          <Field label="审核备注" value={app.reviewNote} />
        </dl>
      </section>

      {pending ? (
        <section className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">审核操作</h3>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="通过时可留空；驳回时请填写原因（租户可见）"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={approve.isPending || reject.isPending}
              onClick={() => setApproveOpen(true)}
            >
              通过
            </Button>
            <Button
              variant="destructive"
              disabled={approve.isPending || reject.isPending}
              onClick={() => setRejectOpen(true)}
            >
              驳回
            </Button>
          </div>
        </section>
      ) : null}

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <ConfirmActionDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="通过入驻申请"
        description="确认通过该入驻申请？通过后租户可绑定店铺。"
        confirmLabel="确认通过"
        pending={approve.isPending}
        onConfirm={() => approve.mutate({ id, note: note.trim() || undefined })}
      />
      <ConfirmReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="驳回入驻申请"
        description="确认驳回该入驻申请？驳回原因将展示给租户。"
        confirmLabel="确认驳回"
        confirmVariant="destructive"
        placeholder="请填写驳回原因（必填）"
        required
        defaultReason={note}
        pending={reject.isPending}
        onConfirm={(reason) => {
          setNote(reason)
          reject.mutate({ id, note: reason })
        }}
      />
    </div>
  )
}
