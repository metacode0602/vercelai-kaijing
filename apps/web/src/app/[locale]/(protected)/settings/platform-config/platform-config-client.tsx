'use client'

import { trpc } from '@/lib/trpc/client'
import type { OnboardingDocumentRequirements } from '@workspace/db/onboarding-document-requirements'
import { Button } from '@workspace/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@workspace/ui/components/card'
import { Label } from '@workspace/ui/components/label'
import { Spinner } from '@workspace/ui/components/spinner'
import { Switch } from '@workspace/ui/components/switch'
import { useEffect, useState } from 'react'

type RequirementKey = keyof OnboardingDocumentRequirements

const REQUIREMENT_ITEMS: Array<{
  key: RequirementKey
  title: string
  description: string
}> = [
  {
    key: 'requireLicenseFile',
    title: '营业执照 / 证件照片',
    description: '企业营业执照或个人证件照片是否在提交入驻时必填。',
  },
  {
    key: 'requireLegalRepIdImages',
    title: '法人身份证照片',
    description: '企业「法定代表人本人办理」时，是否必须上传身份证正反面。',
  },
  {
    key: 'requireAuthorizationFile',
    title: '企业授权书',
    description: '企业「授权他人办理」时，是否必须上传加盖公章的授权书。',
  },
  {
    key: 'requireAgentIdImages',
    title: '授权人身份证照片',
    description: '企业「授权他人办理」时，是否必须上传授权人身份证正反面。',
  },
]

export function PlatformConfigClient() {
  const query = trpc.platformSettings.getOnboardingDocumentRequirements.useQuery()
  const updateMutation = trpc.platformSettings.updateOnboardingDocumentRequirements.useMutation({
    onSuccess: async () => {
      await query.refetch()
    },
  })

  const [draft, setDraft] = useState<OnboardingDocumentRequirements | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (query.data) {
      setDraft(query.data)
    }
  }, [query.data])

  const dirty =
    draft != null &&
    query.data != null &&
    REQUIREMENT_ITEMS.some(({ key }) => draft[key] !== query.data[key])

  if (query.isLoading || !draft) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        加载平台配置…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">入驻证件上传</CardTitle>
          <CardDescription>
            控制租户端入驻向导中各类证件附件是否为必填项；关闭后租户仍可上传，但提交时不再强制校验。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {REQUIREMENT_ITEMS.map((item) => (
            <div
              key={item.key}
              className="flex items-start justify-between gap-4 rounded-md border px-4 py-3"
            >
              <div className="space-y-0.5">
                <Label htmlFor={`req-${item.key}`} className="text-sm">
                  {item.title}
                  {item.key !== 'requireLicenseFile' ? (
                    <span className="text-muted-foreground font-normal">（企业）</span>
                  ) : null}
                </Label>
                <p className="text-muted-foreground text-xs">{item.description}</p>
              </div>
              <Switch
                id={`req-${item.key}`}
                checked={draft[item.key]}
                disabled={updateMutation.isPending}
                onCheckedChange={(checked) => {
                  setMessage('')
                  setDraft((current) =>
                    current ? { ...current, [item.key]: checked } : current,
                  )
                }}
              />
            </div>
          ))}

          {message ? <p className="text-sm text-destructive">{message}</p> : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={!dirty || updateMutation.isPending}
              onClick={() => {
                setMessage('')
                updateMutation.mutate(draft, {
                  onError: (error) => setMessage(error.message),
                })
              }}
            >
              {updateMutation.isPending ? <Spinner className="size-4" /> : null}
              保存入驻证件规则
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!dirty || updateMutation.isPending}
              onClick={() => {
                setMessage('')
                if (query.data) setDraft(query.data)
              }}
            >
              撤销修改
            </Button>
            {updateMutation.isSuccess && !dirty ? (
              <span className="text-muted-foreground text-xs">已保存</span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}