'use client'

import { AuthCard } from '@/components/auth/auth-card'
import { FormError } from '@/components/auth/form-error'
import { FormSuccess } from '@/components/auth/form-success'
import { Button } from '@workspace/ui/components/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@workspace/ui/components/field'
import { Input } from '@workspace/ui/components/input'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Routes } from '@/lib/routes'
import { cn } from '@workspace/ui/lib/utils'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'

export interface ForgotPasswordFormProps {
  className?: string
}

export function ForgotPasswordForm({ className }: ForgotPasswordFormProps) {
  const t = useTranslations('Auth.forgotPassword')
  const [error, setError] = useState<string | undefined>('')
  const [success, setSuccess] = useState<string | undefined>('')
  const [isPending, setIsPending] = useState(false)
  const formId = useId()

  const forgotSchema = useMemo(
    () =>
      z.object({
        email: z.string().email({ message: t('emailRequired') }),
      }),
    [t]
  )

  const form = useForm<z.infer<typeof forgotSchema>>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = async (values: z.infer<typeof forgotSchema>) => {
    setIsPending(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/auth/realm-forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? t('sendFailed'))
        return
      }

      setSuccess(t('checkEmail'))
    } catch {
      setError(t('networkError'))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <AuthCard
      headerLabel={t('title')}
      description={t('description')}
      className={cn('w-full', className)}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-2">
        <FieldGroup className="gap-4">
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-email`}>{t('email')}</FieldLabel>
                <Input
                  {...field}
                  id={`${formId}-email`}
                  disabled={isPending}
                  placeholder={t('emailPlaceholder')}
                  type="email"
                  aria-invalid={fieldState.invalid}
                  autoComplete="email"
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </FieldGroup>
        <FormError message={error} />
        <FormSuccess message={success} />
        <Button
          disabled={isPending}
          size="lg"
          type="submit"
          className="flex w-full cursor-pointer items-center justify-center gap-2"
        >
          {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
          <span>{t('send')}</span>
        </Button>
      </form>
      <div className="mt-4 text-center">
        <Button variant="link" asChild className="text-muted-foreground text-sm hover:text-primary">
          <LocaleLink href={Routes.Login}>{t('backToLogin')}</LocaleLink>
        </Button>
      </div>
    </AuthCard>
  )
}