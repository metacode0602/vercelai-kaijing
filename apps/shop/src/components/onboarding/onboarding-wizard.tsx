'use client'

import * as React from 'react'
import { trpc } from '@/lib/trpc/client'
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'
import type { OnboardingApplicationDto } from '@/lib/server/dataaccess/onboarding'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import { Separator } from '@workspace/ui/components/separator'
import { Spinner } from '@workspace/ui/components/spinner'
import { cn } from '@workspace/ui/lib/utils'

type SubjectType = 'enterprise' | 'individual'
type HandlerType = 'legal_rep' | 'authorized_agent'

type UploadValue = { key: string; name: string }

type FormState = {
  subjectType: SubjectType
  companyName: string
  registrationNo: string
  countryCode: string
  handlerType: HandlerType
  legalRepresentative: string
  legalRepIdNo: string
  legalRepIdFront: UploadValue | null
  legalRepIdBack: UploadValue | null
  authorizationFile: UploadValue | null
  agentName: string
  agentIdNo: string
  agentIdFront: UploadValue | null
  agentIdBack: UploadValue | null
  contactName: string
  contactPhone: string
  contactEmail: string
  licenseFile: UploadValue | null
}

const initialForm: FormState = {
  subjectType: 'enterprise',
  companyName: '',
  registrationNo: '',
  countryCode: 'LK',
  handlerType: 'legal_rep',
  legalRepresentative: '',
  legalRepIdNo: '',
  legalRepIdFront: null,
  legalRepIdBack: null,
  authorizationFile: null,
  agentName: '',
  agentIdNo: '',
  agentIdFront: null,
  agentIdBack: null,
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  licenseFile: null,
}

const COUNTRIES = [
  { value: 'LK', label: '斯里兰卡（LK）' },
  { value: 'MY', label: '马来西亚（MY）' },
  { value: 'PH', label: '菲律宾（PH）' },
  { value: 'TH', label: '泰国（TH）' },
  { value: 'SG', label: '新加坡（SG）' },
  { value: 'VN', label: '越南（VN）' },
  { value: 'ID', label: '印度尼西亚（ID）' },
]

const STATUS_LABEL: Record<string, string> = {
  not_started: '未开始',
  draft: '草稿',
  submitted: '审核中',
  approved: '已通过',
  rejected: '已驳回',
  suspended: '已暂停',
}

function uploadValue(key: string | null | undefined, name?: string | null): UploadValue | null {
  if (!key) return null
  return { key, name: name || key.split('/').pop() || '已上传文件' }
}

function formFromApplication(application: OnboardingApplicationDto): FormState {
  return {
    subjectType: application.subjectType === 'individual' ? 'individual' : 'enterprise',
    companyName: application.companyName,
    registrationNo: application.registrationNo ?? '',
    countryCode: application.countryCode || 'LK',
    handlerType: application.handlerType === 'authorized_agent' ? 'authorized_agent' : 'legal_rep',
    legalRepresentative: application.legalRepresentative ?? '',
    legalRepIdNo: application.legalRepIdNo ?? '',
    legalRepIdFront: uploadValue(application.legalRepIdFrontKey),
    legalRepIdBack: uploadValue(application.legalRepIdBackKey),
    authorizationFile: uploadValue(application.authorizationFileKey),
    agentName: application.agentName ?? '',
    agentIdNo: application.agentIdNo ?? '',
    agentIdFront: uploadValue(application.agentIdFrontKey),
    agentIdBack: uploadValue(application.agentIdBackKey),
    contactName: application.contactName,
    contactPhone: application.contactPhone,
    contactEmail: application.contactEmail ?? '',
    licenseFile: uploadValue(application.licenseFileKey, application.licenseFileName),
  }
}

async function uploadFile(file: File): Promise<UploadValue> {
  const body = new FormData()
  body.append('file', file)
  const response = await fetch('/api/onboarding/upload', { method: 'POST', body })
  const data = (await response.json()) as { key?: string; name?: string; error?: string }
  if (!response.ok || !data.key) {
    throw new Error(data.error || '上传失败')
  }
  return { key: data.key, name: data.name || file.name }
}

function StepIndicator({ step }: { step: number }) {
  const steps = ['选择主体', '填写资料', '确认提交']
  return (
    <ol className="flex flex-wrap items-center gap-3 text-sm">
      {steps.map((label, index) => {
        const number = index + 1
        const active = number === step
        const done = number < step
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full border text-xs',
                active && 'border-primary bg-primary text-primary-foreground',
                done && 'border-primary text-primary',
              )}
            >
              {done ? '✓' : number}
            </span>
            <span className={cn(!active && !done && 'text-muted-foreground')}>{label}</span>
            {number < steps.length ? <span className="text-muted-foreground">→</span> : null}
          </li>
        )
      })}
    </ol>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  type?: string
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function FileField({
  label,
  value,
  onChange,
  required,
  hint,
  onError,
}: {
  label: string
  value: UploadValue | null
  onChange: (value: UploadValue | null) => void
  required?: boolean
  hint?: string
  onError: (message: string) => void
}) {
  const [uploading, setUploading] = React.useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      onChange(await uploadFile(file))
    } catch (error) {
      onError(error instanceof Error ? error.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        disabled={uploading}
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {uploading ? <Spinner className="size-3" /> : null}
        {value ? <span className="truncate">已上传：{value.name}</span> : <span>支持 JPG / PNG / PDF，最大 10MB</span>}
        {value ? (
          <button type="button" className="underline" onClick={() => onChange(null)}>
            移除
          </button>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function SectionTitle({ children, description }: { children: React.ReactNode; description?: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{children}</h3>
      {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
    </div>
  )
}

export function OnboardingWizard() {
  const trpcUtils = trpc.useUtils()
  const router = useLocaleRouter()
  const stateQuery = trpc.onboarding.getState.useQuery()
  const [step, setStep] = React.useState(1)
  const [form, setForm] = React.useState<FormState>(initialForm)
  const [agreement, setAgreement] = React.useState(false)
  const [bindNow, setBindNow] = React.useState(false)
  const [error, setError] = React.useState('')
  const hydratedId = React.useRef<string | null>(null)

  const application = stateQuery.data?.application ?? null
  const status = stateQuery.data?.status ?? 'not_started'

  React.useEffect(() => {
    if (status === 'submitted' || status === 'approved' || status === 'suspended') {
      router.replace('/onboarding/status')
    }
  }, [router, status])

  React.useEffect(() => {
    if (!application || hydratedId.current === application.id) return
    hydratedId.current = application.id
    setForm(formFromApplication(application))
    setStep(2)
  }, [application])

  const start = trpc.onboarding.start.useMutation({
    onSuccess: async () => {
      setError('')
      setStep(2)
      await trpcUtils.onboarding.getState.invalidate()
    },
    onError: (mutationError) => setError(mutationError.message),
  })
  const save = trpc.onboarding.saveStep.useMutation({
    onSuccess: async () => {
      setError('')
      setStep(3)
      await trpcUtils.onboarding.getState.invalidate()
    },
    onError: (mutationError) => setError(mutationError.message),
  })
  const submit = trpc.onboarding.submit.useMutation({
    onSuccess: () => {
      router.push(bindNow ? '/console/settings/shops/new' : '/onboarding/status')
    },
    onError: (mutationError) => setError(mutationError.message),
  })

  function handleSubmit() {
    setError('')
    if (!agreement) {
      setError('请先阅读并同意《卖家服务协议》和《隐私政策》')
      return
    }
    submit.mutate({ agreement: true })
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function validateStep2() {
    if (form.companyName.trim().length < 2) return '请输入有效的主体名称'
    const registrationMin = form.subjectType === 'enterprise' ? 8 : 4
    if (form.registrationNo.trim().length < registrationMin) {
      return form.subjectType === 'enterprise'
        ? '企业注册号需为 8–32 位字母数字'
        : '证件号需为 4–32 位字母数字'
    }
    if (!form.contactName.trim() || !form.contactPhone.trim()) return '请填写联系人姓名和电话'
    if (!form.licenseFile) return '请上传营业执照 / 证件照片'
    if (form.subjectType === 'enterprise') {
      if (!form.legalRepresentative.trim()) return '请填写法定代表人'
      if (form.handlerType === 'legal_rep') {
        if (!form.legalRepIdNo.trim() || !form.legalRepIdFront || !form.legalRepIdBack) {
          return '本人办理需填写法人身份证号并上传身份证正反面'
        }
      } else if (
        !form.authorizationFile ||
        !form.agentName.trim() ||
        !form.agentIdNo.trim() ||
        !form.agentIdFront ||
        !form.agentIdBack
      ) {
        return '授权办理需上传授权书、填写授权人信息并上传身份证正反面'
      }
    }
    return ''
  }

  function goNext() {
    setError('')
    if (step === 1) {
      start.mutate({
        subjectType: form.subjectType,
        countryCode: form.countryCode,
      })
      return
    }
    if (step === 2) {
      const message = validateStep2()
      if (message) {
        setError(message)
        return
      }
      save.mutate({
        subjectType: form.subjectType,
        companyName: form.companyName,
        registrationNo: form.registrationNo,
        countryCode: form.countryCode,
        handlerType: form.handlerType,
        legalRepresentative: form.legalRepresentative,
        legalRepIdNo: form.legalRepIdNo,
        legalRepIdFrontKey: form.legalRepIdFront?.key,
        legalRepIdBackKey: form.legalRepIdBack?.key,
        authorizationFileKey: form.authorizationFile?.key,
        agentName: form.agentName,
        agentIdNo: form.agentIdNo,
        agentIdFrontKey: form.agentIdFront?.key,
        agentIdBackKey: form.agentIdBack?.key,
        contactName: form.contactName,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail || null,
        licenseFileKey: form.licenseFile?.key,
        licenseFileName: form.licenseFile?.name,
      })
    }
  }

  const isEnterprise = form.subjectType === 'enterprise'
  const busy = start.isPending || save.isPending || submit.isPending

  if (stateQuery.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner /> 加载中…
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Open Shop · 租户入驻
          </p>
          <h1 className="mt-1 text-2xl font-semibold">完成主体认证，开始连接店铺</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            完成资料提交后可创建店铺并授权 Daraz / Lazada，数据按租户隔离。
          </p>
        </div>
        <Badge variant={status === 'rejected' ? 'destructive' : 'outline'}>
          {STATUS_LABEL[status] ?? status}
        </Badge>
      </div>

      <StepIndicator step={step} />

      {status === 'rejected' && application?.reviewNote ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">申请已驳回</p>
          <p className="mt-1 text-muted-foreground">{application.reviewNote}</p>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {step === 1 ? '选择入驻主体' : step === 2 ? '填写主体资料' : '确认并提交'}
          </CardTitle>
          <CardDescription>
            {step === 1
              ? '企业与个人入驻都需要真实联系人信息。'
              : step === 2
                ? '材料仅用于平台审核，请确保清晰完整。'
                : '提交后资料不可编辑，审核结果会显示在状态页。'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ['enterprise', '企业入驻', '营业执照 + 法人信息'],
                    ['individual', '个人入驻', '个人证件 + 联系方式'],
                  ] as const
                ).map(([value, title, description]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => update('subjectType', value)}
                    className={cn(
                      'rounded-lg border p-4 text-left transition-colors',
                      form.subjectType === value
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50',
                    )}
                  >
                    <p className="font-medium">{title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                  </button>
                ))}
              </div>
              <div className="max-w-sm space-y-2">
                <Label>国家 / 地区</Label>
                <Select
                  value={form.countryCode}
                  onValueChange={(value) => update('countryCode', value)}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((country) => (
                      <SelectItem key={country.value} value={country.value}>
                        {country.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                提交入驻即表示你确认所填信息真实有效，并同意平台进行资质审核。
              </p>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <section className="space-y-4">
                <SectionTitle description="营业执照上的名称，个人入驻填写姓名。">
                  {isEnterprise ? '企业信息' : '个人信息'}
                </SectionTitle>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label={isEnterprise ? '企业名称' : '姓名'}
                    value={form.companyName}
                    onChange={(value) => update('companyName', value)}
                    required
                  />
                  <TextField
                    label={isEnterprise ? '统一社会信用代码 / 注册号' : '身份证号 / 证件号'}
                    value={form.registrationNo}
                    onChange={(value) => update('registrationNo', value)}
                    required
                  />
                  <TextField
                    label="联系人姓名"
                    value={form.contactName}
                    onChange={(value) => update('contactName', value)}
                    required
                  />
                  <TextField
                    label="联系人电话"
                    value={form.contactPhone}
                    onChange={(value) => update('contactPhone', value)}
                    required
                  />
                  <TextField
                    label="联系人邮箱"
                    value={form.contactEmail}
                    onChange={(value) => update('contactEmail', value)}
                    type="email"
                  />
                  <div className="space-y-2">
                    <Label>国家 / 地区</Label>
                    <Select
                      value={form.countryCode}
                      onValueChange={(value) => update('countryCode', value)}
                    >
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((country) => (
                          <SelectItem key={country.value} value={country.value}>
                            {country.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <FileField
                  label={isEnterprise ? '营业执照' : '证件照片'}
                  value={form.licenseFile}
                  onChange={(value) => update('licenseFile', value)}
                  onError={setError}
                  required
                />
              </section>

              {isEnterprise ? (
                <>
                  <Separator />
                  <section className="space-y-4">
                    <SectionTitle description="请选择由法定代表人本人办理，或授权他人办理。">
                      法人信息与办理方式
                    </SectionTitle>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <TextField
                        label="法定代表人姓名"
                        value={form.legalRepresentative}
                        onChange={(value) => update('legalRepresentative', value)}
                        required
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={form.handlerType === 'legal_rep' ? 'default' : 'outline'}
                        onClick={() => update('handlerType', 'legal_rep')}
                      >
                        法定代表人本人办理
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={form.handlerType === 'authorized_agent' ? 'default' : 'outline'}
                        onClick={() => update('handlerType', 'authorized_agent')}
                      >
                        授权他人办理
                      </Button>
                    </div>

                    {form.handlerType === 'legal_rep' ? (
                      <div className="space-y-4">
                        <TextField
                          label="法人身份证号"
                          value={form.legalRepIdNo}
                          onChange={(value) => update('legalRepIdNo', value)}
                          required
                        />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <FileField
                            label="法人身份证人像面"
                            value={form.legalRepIdFront}
                            onChange={(value) => update('legalRepIdFront', value)}
                            onError={setError}
                            required
                          />
                          <FileField
                            label="法人身份证国徽面"
                            value={form.legalRepIdBack}
                            onChange={(value) => update('legalRepIdBack', value)}
                            onError={setError}
                            required
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <TextField
                            label="授权人姓名"
                            value={form.agentName}
                            onChange={(value) => update('agentName', value)}
                            required
                          />
                          <TextField
                            label="授权人身份证号"
                            value={form.agentIdNo}
                            onChange={(value) => update('agentIdNo', value)}
                            required
                          />
                        </div>
                        <FileField
                          label="授权书"
                          value={form.authorizationFile}
                          onChange={(value) => update('authorizationFile', value)}
                          onError={setError}
                          required
                          hint="请下载模板填写并加盖企业公章后上传扫描件。"
                        />
                        <div className="flex flex-wrap gap-3 text-xs">
                          <a
                            className="underline"
                            href="/templates/enterprise-authorization-letter.pdf"
                            target="_blank"
                            rel="noreferrer"
                          >
                            下载授权书 PDF
                          </a>
                          <a
                            className="underline"
                            href="/templates/enterprise-authorization-letter.docx"
                          >
                            下载授权书 DOCX
                          </a>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <FileField
                            label="授权人身份证人像面"
                            value={form.agentIdFront}
                            onChange={(value) => update('agentIdFront', value)}
                            onError={setError}
                            required
                          />
                          <FileField
                            label="授权人身份证国徽面"
                            value={form.agentIdBack}
                            onChange={(value) => update('agentIdBack', value)}
                            onError={setError}
                            required
                          />
                        </div>
                      </div>
                    )}
                  </section>
                </>
              ) : null}
            </>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <p className="font-medium">{form.companyName}</p>
                <p className="mt-1 text-muted-foreground">
                  {isEnterprise ? '企业' : '个人'} · {form.countryCode} · 注册号 / 证件号：
                  {form.registrationNo}
                </p>
                <p className="mt-1 text-muted-foreground">
                  联系人：{form.contactName} {form.contactPhone}
                  {form.contactEmail ? ` · ${form.contactEmail}` : ''}
                </p>
                {isEnterprise ? (
                  <p className="mt-1 text-muted-foreground">
                    办理方式：
                    {form.handlerType === 'legal_rep'
                      ? '法定代表人本人办理'
                      : `授权 ${form.agentName} 办理`}
                  </p>
                ) : null}
              </div>
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-muted-foreground">
                提交后资料不可编辑。审核结果会显示在状态页，店铺绑定权限以平台配置为准。
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={agreement}
                  onChange={(event) => setAgreement(event.target.checked)}
                />
                <span>
                  我已阅读并同意《卖家服务协议》和《隐私政策》，并确认所填信息真实有效。
                </span>
              </label>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">提交后</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="binding-after-submit"
                    checked={!bindNow}
                    onChange={() => setBindNow(false)}
                  />
                  稍后绑定店铺，先查看审核状态
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="binding-after-submit"
                    checked={bindNow}
                    onChange={() => setBindNow(true)}
                  />
                  立即添加并授权店铺
                </label>
              </fieldset>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {step > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setError('')
                    setStep(step - 1)
                  }}
                  disabled={busy}
                >
                  上一步
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <LocaleLink
                href="/console"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                暂不处理
              </LocaleLink>
              {step < 3 ? (
                <Button type="button" onClick={goNext} disabled={busy}>
                  {busy ? <Spinner className="size-4" /> : null}
                  {step === 1 ? '开始填写' : '保存并继续'}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={busy || !agreement}
                >
                  {submit.isPending ? <Spinner className="size-4" /> : null}
                  提交审核
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
