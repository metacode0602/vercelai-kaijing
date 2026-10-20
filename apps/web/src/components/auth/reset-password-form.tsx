'use client'

import { AuthCard } from '@/components/auth/auth-card'
import { FormError } from '@/components/shared/form-error'
import { FormSuccess } from '@/components/shared/form-success'
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
import { EyeIcon, EyeOffIcon, Loader2Icon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { useId, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'

export interface ResetPasswordFormProps {
  className?: string
}

export const ResetPasswordForm = ({ className }: ResetPasswordFormProps) => {
  const t = useTranslations('AuthPage.resetPassword')
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [error, setError] = useState<string | undefined>('')
  const [success, setSuccess] = useState<string | undefined>('')
  const [isPending, setIsPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const formId = useId()

  const resetSchema = useMemo(
    () =>
      z.object({
        password: z.string().min(8, { message: t('minLength') }),
        confirmPassword: z.string().min(8, { message: t('minLength') }),
      }),
    [t]
  )

  const form = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  const onSubmit = async (values: z.infer<typeof resetSchema>) => {
    if (values.password !== values.confirmPassword) {
      setError(t('passwordMismatch'))
      return
    }
    if (!token) {
      setError(t('invalidToken'))
      return
    }

    setIsPending(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: values.password, token }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.message ?? t('resetFailed'))
        return
      }

      setSuccess(t('success'))
      setTimeout(() => router.push(Routes.Login), 1500)
    } catch {
      setError(t('networkError'))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <AuthCard
      headerLabel={t('title')}
      className={cn('w-full', className)}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-2">
        <FieldGroup className="gap-4">
          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-password`}>{t('password')}</FieldLabel>
                <div className="relative">
                  <Input
                    {...field}
                    id={`${formId}-password`}
                    disabled={isPending}
                    placeholder="******"
                    type={showPassword ? 'text' : 'password'}
                    className="pr-10"
                    aria-invalid={fieldState.invalid}
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute top-0 right-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword((prev) => !prev)}
                    disabled={isPending}
                  >
                    {showPassword ? (
                      <EyeOffIcon className="size-4 text-muted-foreground" />
                    ) : (
                      <EyeIcon className="size-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="confirmPassword"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-confirm`}>{t('confirmPassword')}</FieldLabel>
                <div className="relative">
                  <Input
                    {...field}
                    id={`${formId}-confirm`}
                    disabled={isPending}
                    placeholder="******"
                    type={showPassword ? 'text' : 'password'}
                    className="pr-10"
                    aria-invalid={fieldState.invalid}
                    autoComplete="new-password"
                  />
                </div>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
        </FieldGroup>
        <FormError message={error || undefined} />
        <FormSuccess message={success} />
        <Button
          disabled={isPending || !token}
          size="lg"
          type="submit"
          className="flex w-full cursor-pointer items-center justify-center gap-2"
        >
          {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
          <span>{t('reset')}</span>
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