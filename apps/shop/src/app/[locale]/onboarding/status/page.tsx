'use client'

import { trpc } from '@/lib/trpc/client'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
import { Spinner } from '@workspace/ui/components/spinner'

const STATUS: Record<string, { label: string; description: string; variant: 'outline' | 'secondary' | 'destructive' }> = {
  not_started: {
    label: '未开始',
    description: '请先完成主体资料填写。',
    variant: 'outline',
  },
  draft: {
    label: '草稿',
    description: '资料尚未提交，可继续编辑。',
    variant: 'outline',
  },
  submitted: {
    label: '审核中',
    description: '资料已提交，可进入控制台；店铺绑定权限以平台配置为准。',
    variant: 'secondary',
  },
  approved: {
    label: '已通过',
    description: '入驻已通过，可以新增店铺并授权 Daraz / Lazada。',
    variant: 'secondary',
  },
  rejected: {
    label: '已驳回',
    description: '请根据审核意见修改资料后重新提交。',
    variant: 'destructive',
  },
  suspended: {
    label: '已暂停',
    description: '当前入驻状态已暂停，请联系平台运营。',
    variant: 'destructive',
  },
}

export default function OnboardingStatusPage() {
  const stateQuery = trpc.onboarding.getState.useQuery()
  const state = stateQuery.data

  if (stateQuery.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner /> 加载中…
      </div>
    )
  }

  const status = state?.status ?? 'not_started'
  const meta = STATUS[status] ?? STATUS.not_started
  const application = state?.application

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Open Shop · 入驻状态
        </p>
        <h1 className="mt-1 text-2xl font-semibold">入驻申请</h1>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{application?.companyName || state?.organizationName || '尚未创建申请'}</CardTitle>
              <CardDescription>{meta.description}</CardDescription>
            </div>
            <Badge variant={meta.variant}>{meta.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {application ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">主体类型</dt>
                <dd>{application.subjectType === 'enterprise' ? '企业' : '个人'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">国家 / 地区</dt>
                <dd>{application.countryCode}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">注册号 / 证件号</dt>
                <dd>{application.registrationNo || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">联系人</dt>
                <dd>
                  {application.contactName} {application.contactPhone}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">申请版本</dt>
                <dd>v{application.version}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">提交时间</dt>
                <dd>
                  {application.submittedAt
                    ? new Intl.DateTimeFormat('zh-CN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(application.submittedAt))
                    : '—'}
                </dd>
              </div>
              {application.subjectType === 'enterprise' ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">办理方式</dt>
                  <dd>
                    {application.handlerType === 'authorized_agent'
                      ? `授权 ${application.agentName || '他人'} 办理`
                      : '法定代表人本人办理'}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              还没有入驻申请。完成资料填写并提交后，可在这里查看审核状态。
            </p>
          )}

          {application?.reviewNote ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">审核意见</p>
              <p className="mt-1 text-muted-foreground">{application.reviewNote}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            {state?.canEdit ? (
              <Button asChild>
                <LocaleLink href="/onboarding">
                  {application ? '继续编辑资料' : '开始入驻'}
                </LocaleLink>
              </Button>
            ) : null}
            {state?.bindingAllowed ? (
              <Button asChild>
                <LocaleLink href="/settings/shops/new">新增店铺</LocaleLink>
              </Button>
            ) : null}
            {status === 'submitted' || status === 'approved' ? (
              <Button asChild variant="outline">
                <LocaleLink href="/console">进入控制台</LocaleLink>
              </Button>
            ) : null}
            <Button asChild variant="ghost">
              <LocaleLink href="/settings/shops">店铺管理</LocaleLink>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
