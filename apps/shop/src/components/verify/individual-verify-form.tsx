'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@workspace/ui/components/field'
import { Loader2Icon, CheckCircle2Icon } from 'lucide-react'
import { useId } from 'react'
import { trpc } from '@/trpc/client'

interface Props {
  onSubmitted?: () => void
}

export function IndividualVerifyForm({ onSubmitted }: Props) {
  const t = useTranslations('Verify')
  const formId = useId()
  const [realName, setRealName] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [mobile, setMobile] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const sendSms = trpc.identity.sendSmsCode.useMutation({
    onSuccess: (data) => {
      setCooldown(data.cooldownSec)
      const timer = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            clearInterval(timer)
            return 0
          }
          return c - 1
        })
      }, 1000)
    },
    onError: (e) => setError(e.message),
  })

  const submit = trpc.identity.submitIndividual.useMutation({
    onSuccess: () => {
      setSuccess(true)
      onSubmitted?.()
    },
    onError: (e) => setError(e.message),
  })

  const isPending = submit.isPending || sendSms.isPending

  if (success) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2Icon className="size-6 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{t('submittedTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('submittedDesc')}</p>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setError('')
        submit.mutate({ realName, idNumber, mobile, smsCode })
      }}
      className="space-y-4"
    >
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor={`${formId}-name`}>{t('realName')}</FieldLabel>
          <Input
            id={`${formId}-name`}
            value={realName}
            onChange={(e) => setRealName(e.target.value)}
            disabled={isPending}
            placeholder={t('realNamePlaceholder')}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-id`}>{t('idNumber')}</FieldLabel>
          <Input
            id={`${formId}-id`}
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            disabled={isPending}
            placeholder={t('idNumberPlaceholder')}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-mobile`}>{t('mobile')}</FieldLabel>
          <div className="flex gap-2">
            <Input
              id={`${formId}-mobile`}
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              disabled={isPending}
              placeholder={t('mobilePlaceholder')}
              required
            />
            <Button
              type="button"
              variant="outline"
              disabled={isPending || cooldown > 0 || mobile.length !== 11}
              onClick={() => {
                setError('')
                sendSms.mutate({ mobile })
              }}
              className="shrink-0"
            >
              {cooldown > 0 ? `${cooldown}s` : t('getSmsCode')}
            </Button>
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-code`}>{t('smsCode')}</FieldLabel>
          <Input
            id={`${formId}-code`}
            value={smsCode}
            onChange={(e) => setSmsCode(e.target.value)}
            disabled={isPending}
            placeholder={t('smsCodePlaceholder')}
            required
          />
        </Field>
      </FieldGroup>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button
        type="submit"
        disabled={isPending}
        className="w-full cursor-pointer"
      >
        {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
        {t('submit')}
      </Button>
    </form>
  )
}
