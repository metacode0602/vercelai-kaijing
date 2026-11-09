'use client'

import * as React from 'react'
import { LocaleLink } from '@/lib/i18n/navigation'
import { trpc } from '@/lib/trpc/client'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Textarea } from '@workspace/ui/components/textarea'

const HANDLER_LABELS: Record<string, string> = {
  legal_rep: '法定代表人本人办理',
  authorized_agent: '授权代理人办理',
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

  const approve = trpc.platformOnboarding.approve.useMutation({
    onSuccess: async () => {
      setNotice('已通过审核，租户现在可以绑定店铺。')
      await utils.platformOnboarding.get.invalidate({ id })
      await utils.platformOnboarding.list.invalidate()
      await utils.platformOnboarding.tenants.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const reject = trpc.platformOnboarding.reject.useMutation({
    onSuccess: async () => {
      setNotice('已驳回，租户可修改后重新提交。')
      await utils.platformOnboarding.get.invalidate({ id })
      await utils.platformOnboarding.list.invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">加载中…</p>
  }
  if (!query.data) {
    return <p className="text-sm text-muted-foreground">入驻申请不存在。</p>
  }

  const { application: app, organization, files } = query.data
  const pending = app.status === 'submitted'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            <LocaleLink className="underline" href="/crossborder/onboarding">
              入驻审核
            </LocaleLink>{' '}
            / 申请详情
          </p>
          <h2 className="text-lg font-medium">{app.companyName}</h2>
          <p className="text-sm text-muted-foreground">
            租户 {organization.name} · 提交版本 v{app.version}
          </p>
        </div>
        <Badge variant={pending ? 'default' : app.status === 'approved' ? 'secondary' : 'destructive'}>
          {app.status}
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

      <section className="space-y-2">
        <h3 className="font-medium">审核记录</h3>
        <dl>
          <Field
            label="提交时间"
            value={app.submittedAt ? new Date(app.submittedAt).toLocaleString() : null}
          />
          <Field
            label="审核时间"
            value={app.reviewedAt ? new Date(app.reviewedAt).toLocaleString() : null}
          />
          <Field label="审核人" value={app.reviewedBy} />
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
              onClick={() => {
                if (window.confirm('确认通过该入驻申请？通过后租户可绑定店铺。')) {
                  approve.mutate({ id, note: note.trim() || undefined })
                }
              }}
            >
              通过
            </Button>
            <Button
              variant="destructive"
              disabled={approve.isPending || reject.isPending}
              onClick={() => {
                if (!note.trim()) {
                  setNotice('驳回时请填写原因。')
                  return
                }
                reject.mutate({ id, note: note.trim() })
              }}
            >
              驳回
            </Button>
          </div>
        </section>
      ) : null}

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
    </div>
  )
}
