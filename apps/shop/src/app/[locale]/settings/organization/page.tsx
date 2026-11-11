'use client'

import * as React from 'react'
import { Building2, Contact, FileCheck2, ShieldCheck } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
import { Separator } from '@workspace/ui/components/separator'

const IDENTITY_STATUS: Record<string, { label: string; variant: 'secondary' | 'outline' | 'destructive' }> = {
  unverified: { label: '未实名', variant: 'outline' },
  pending: { label: '实名审核中', variant: 'outline' },
  individual_verified: { label: '个人已实名', variant: 'secondary' },
  enterprise_verified: { label: '企业已实名', variant: 'secondary' },
  rejected: { label: '实名未通过', variant: 'destructive' },
}

const VERIFICATION_STATUS: Record<string, { label: string; variant: 'secondary' | 'outline' | 'destructive' }> = {
  unverified: { label: '未认证', variant: 'outline' },
  pending: { label: '认证审核中', variant: 'outline' },
  verified: { label: '已认证', variant: 'secondary' },
  rejected: { label: '认证未通过', variant: 'destructive' },
}

const MERCHANT_STATUS: Record<string, { label: string; variant: 'secondary' | 'outline' | 'destructive' }> = {
  pending: { label: '待审核', variant: 'outline' },
  approved: { label: '已通过', variant: 'secondary' },
  suspended: { label: '已暂停', variant: 'destructive' },
}

const APPLICATION_STATUS: Record<string, { label: string; variant: 'secondary' | 'outline' | 'destructive' }> = {
  draft: { label: '草稿', variant: 'outline' },
  submitted: { label: '审核中', variant: 'outline' },
  approved: { label: '已通过', variant: 'secondary' },
  rejected: { label: '已驳回', variant: 'destructive' },
  suspended: { label: '已暂停', variant: 'destructive' },
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{value ?? '—'}</dd>
    </div>
  )
}

function StatusBadge({
  map,
  value,
}: {
  map: Record<string, { label: string; variant: 'secondary' | 'outline' | 'destructive' }>
  value: string | null | undefined
}) {
  const meta = (value && map[value]) || null
  if (!meta) return <span className="text-muted-foreground">—</span>
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}

export default function OrganizationProfilePage() {
  const utils = trpc.useUtils()
  const profileQuery = trpc.organization.get.useQuery()
  const profile = profileQuery.data
  const [nameDraft, setNameDraft] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState('')
  const [noticeError, setNoticeError] = React.useState(false)
  const nameValue = nameDraft ?? profile?.name ?? ''

  const updateMutation = trpc.organization.update.useMutation({
    onSuccess: async (data) => {
      await utils.organization.get.invalidate()
      setNameDraft(null)
      setNoticeError(false)
      setNotice(`组织名称已更新为「${data.name}」。入驻认证档案仍只读。`)
    },
    onError: (error) => {
      setNoticeError(true)
      setNotice(error.message)
    },
  })

  if (profileQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">加载中…</p>
  }

  if (profileQuery.isError || !profile) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">企业信息</h2>
        <p className="text-sm text-destructive">
          {profileQuery.error?.message ?? '未找到当前组织信息。'}
        </p>
      </div>
    )
  }

  const application = profile.application

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">企业信息</h2>
          <p className="text-sm text-muted-foreground">
            组织名称可在此更新并落库；入驻主体与认证档案只读，修改请走入驻流程。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {profile.entryApproved ? (
            <Badge variant="secondary">入驻已通过</Badge>
          ) : (
            <Badge variant="outline">入驻未通过</Badge>
          )}
          <StatusBadge map={IDENTITY_STATUS} value={profile.identityStatus} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            基本信息
          </CardTitle>
          <CardDescription>组织名称可编辑；标识、类型与认证状态由平台或入驻流程维护。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="org-name">组织名称</Label>
              <Input
                id="org-name"
                value={nameValue}
                onChange={(event) => setNameDraft(event.target.value)}
                maxLength={120}
              />
            </div>
            <Button
              size="sm"
              disabled={updateMutation.isPending || nameValue.trim() === '' || nameValue.trim() === profile.name}
              onClick={() => updateMutation.mutate({ name: nameValue })}
            >
              {updateMutation.isPending ? '保存中…' : '保存名称'}
            </Button>
          </div>
          {notice ? (
            <p role="status" className={`text-sm ${noticeError ? 'text-destructive' : 'text-muted-foreground'}`}>
              {notice}
            </p>
          ) : null}
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Field label="组织 ID" value={<span className="font-mono text-xs">{profile.id}</span>} />
            <Field label="Slug" value={profile.slug ? <span className="font-mono text-xs">{profile.slug}</span> : null} />
            <Field label="组织类型" value={profile.orgType} />
            <Field label="组织状态" value={profile.status} />
            <Field label="成员数" value={`${profile.memberCount} 人`} />
            <Field label="实名认证" value={<StatusBadge map={IDENTITY_STATUS} value={profile.identityStatus} />} />
            <Field label="企业认证" value={<StatusBadge map={VERIFICATION_STATUS} value={profile.enterpriseVerificationStatus} />} />
            <Field label="经销状态" value={<StatusBadge map={MERCHANT_STATUS} value={profile.merchantStatus} />} />
            <Field label="创建时间" value={profile.createdAt} />
          </dl>
        </CardContent>
      </Card>

      {application ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Contact className="size-4 text-muted-foreground" />
                入驻主体资料
              </CardTitle>
              <CardDescription>
                来自入驻申请 v{application.version}
                <StatusBadge map={APPLICATION_STATUS} value={application.status} />
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <Field label="主体类型" value={application.subjectType === 'enterprise' ? '企业' : '个人'} />
                <Field label="企业 / 主体名称" value={application.companyName} />
                <Field
                  label={application.subjectType === 'enterprise' ? '注册号' : '证件号'}
                  value={application.registrationNo}
                />
                <Field label="国家 / 地区" value={application.countryCode} />
                <Field
                  label="办理方式"
                  value={
                    application.handlerType === 'authorized_agent' ? '授权代理人办理' : '法定代表人本人办理'
                  }
                />
                <Field
                  label="营业执照 / 证件"
                  value={application.licenseFileName || (application.licenseFileKey ? '已上传' : null)}
                />
              </dl>

              <Separator />

              {application.subjectType === 'enterprise' ? (
                <section className="space-y-3">
                  <h3 className="text-sm font-medium">法定代表人 / 代理人</h3>
                  {application.handlerType === 'authorized_agent' ? (
                    <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="法定代表人" value={application.legalRepresentative} />
                      <Field label="授权代理人" value={application.agentName} />
                      <Field
                        label="代理人证件号"
                        value={application.agentIdNo ? <span className="font-mono text-xs">{application.agentIdNo}</span> : null}
                      />
                    </dl>
                  ) : (
                    <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      <Field label="法定代表人" value={application.legalRepresentative} />
                      <Field
                        label="法人身份证号"
                        value={application.legalRepIdNo ? <span className="font-mono text-xs">{application.legalRepIdNo}</span> : null}
                      />
                    </dl>
                  )}
                </section>
              ) : null}

              <section className="space-y-3">
                <h3 className="text-sm font-medium">联系人</h3>
                <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="联系人姓名" value={application.contactName} />
                  <Field label="联系电话" value={application.contactPhone} />
                  <Field label="联系邮箱" value={application.contactEmail} />
                </dl>
              </section>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck2 className="size-4 text-muted-foreground" />
                审核记录
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Field label="申请状态" value={<StatusBadge map={APPLICATION_STATUS} value={application.status} />} />
                <Field label="提交时间" value={application.submittedAt} />
                <Field label="审核时间" value={application.reviewedAt} />
                <Field label="入驻通过" value={profile.entryApproved ? '是' : '否'} />
              </dl>
              {application.reviewNote ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
                  <p className="font-medium text-destructive">审核意见</p>
                  <p className="mt-1 text-muted-foreground">{application.reviewNote}</p>
                </div>
              ) : null}
              {application.status === 'draft' || application.status === 'rejected' ? (
                <Button asChild variant="outline" size="sm">
                  <LocaleLink href="/onboarding">继续编辑入驻资料</LocaleLink>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" />
              入驻主体资料
            </CardTitle>
            <CardDescription>当前组织还没有入驻申请记录。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <LocaleLink href="/onboarding">开始入驻</LocaleLink>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
