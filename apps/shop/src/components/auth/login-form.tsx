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
import { useAuthStore } from '@/lib/stores/auth-store'
import { zodResolver } from '@hookform/resolvers/zod'
import { EyeIcon, EyeOffIcon, Loader2Icon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useId, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import * as z from 'zod'

export interface LoginFormProps {
  className?: string
  callbackUrl?: string
}

export function LoginForm({ className, callbackUrl: propCallbackUrl }: LoginFormProps) {
  const t = useTranslations('Auth.login')
  const searchParams = useSearchParams()
  const urlError = searchParams.get('error')
  const paramCallbackUrl = searchParams.get('callbackUrl')
  const callbackUrl = propCallbackUrl || paramCallbackUrl || Routes.Dashboard
  const { setAuthMode } = useAuthStore()

  const [error, setError] = useState<string | undefined>('')
  const [success, setSuccess] = useState<string | undefined>('')
  const [isPending, setIsPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const formId = useId()

  const loginSchema = useMemo(
    () =>
      z.object({
        email: z.string().email({ message: t('emailRequired') }),
        password: z.string().min(1, { message: t('passwordRequired') }),
      }),
    [t]
  )

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    setIsPending(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/auth/realm-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? '登录失败')
        return
      }

      window.location.assign(callbackUrl)
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <AuthCard
      headerLabel={t('welcomeBack')}
      description={t('description')}
      bottomButtonLabel={t('signUpHint')}
      bottomButtonHref={Routes.Register}
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
                  placeholder="name@example.com"
                  type="email"
                  aria-invalid={fieldState.invalid}
                  autoComplete="email"
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor={`${formId}-password`}>{t('password')}</FieldLabel>
                  <Button
                    size="sm"
                    variant="link"
                    asChild
                    className="shrink-0 px-0 font-normal text-muted-foreground"
                  >
                    <LocaleLink
                      href={Routes.ForgotPassword}
                      className="text-xs hover:text-primary hover:underline hover:underline-offset-4"
                    >
                      {t('forgotPassword')}
                    </LocaleLink>
                  </Button>
                </div>
                <div className="relative">
                  <Input
                    {...field}
                    id={`${formId}-password`}
                    disabled={isPending}
                    placeholder="******"
                    type={showPassword ? 'text' : 'password'}
                    className="pr-10"
                    aria-invalid={fieldState.invalid}
                    autoComplete="current-password"
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
        </FieldGroup>
        <FormError message={error || urlError || undefined} />
        <FormSuccess message={success} />
        <Button
          disabled={isPending}
          size="lg"
          type="submit"
          className="flex w-full cursor-pointer items-center justify-center gap-2"
        >
          {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
          <span>{t('signIn')}</span>
        </Button>
      </form>
      <div className="mt-4 text-center">
        <Button
          variant="link"
          className="text-muted-foreground text-sm hover:text-primary"
          onClick={() => setAuthMode('phone')}
        >
          {t('switchToPhone')}
        </Button>
      </div>
    </AuthCard>
  )
}
