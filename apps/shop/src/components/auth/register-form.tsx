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
import { Routes } from '@/lib/routes'
import { cn } from '@workspace/ui/lib/utils'
import { setPromoCodeCookie, getPromoCodeCookie } from '@/lib/promo-code'
import { zodResolver } from '@hookform/resolvers/zod'
import { EyeIcon, EyeOffIcon, Loader2Icon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useMemo, useState, useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useSearchParams } from 'next/navigation'
import * as z from 'zod'

export interface RegisterFormProps {
  className?: string
}

export function RegisterForm({ className }: RegisterFormProps) {
  const searchParams = useSearchParams()
  const promoCodeParam = searchParams?.get('r') || undefined
  const t = useTranslations('Auth.register')
  const [error, setError] = useState<string | undefined>('')
  const [success, setSuccess] = useState<string | undefined>('')
  const [isPending, setIsPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const formId = useId()

  // Persist promo code to cookie when URL param is present
  useEffect(() => {
    if (promoCodeParam) {
      setPromoCodeCookie(promoCodeParam)
    }
  }, [promoCodeParam])

  const registerSchema = useMemo(
    () =>
      z
        .object({
          name: z.string().min(2, { message: t('nameRequired') }),
          email: z.string().email({ message: t('emailRequired') }),
          password: z
            .string()
            .min(8, { message: t('passwordMinLength') })
            .regex(/[A-Z]/, { message: t('passwordUppercase') })
            .regex(/[a-z]/, { message: t('passwordLowercase') })
            .regex(/[0-9]/, { message: t('passwordNumber') }),
          confirmPassword: z.string().min(1, { message: t('confirmPasswordRequired') }),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: t('passwordMismatch'),
          path: ['confirmPassword'],
        }),
    [t]
  )

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  })

  const onSubmit = async (values: z.infer<typeof registerSchema>) => {
    setIsPending(true)
    setError('')
    setSuccess('')

    try {
      // Use promo code from URL param or fallback to cookie
      const promoCode = promoCodeParam || getPromoCodeCookie()
      
      const res = await fetch('/api/auth/realm-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          password: values.password,
          promoCode,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? '注册失败')
        return
      }

      window.location.assign(Routes.Onboarding)
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <AuthCard
      headerLabel={t('title')}
      description={t('description')}
      bottomButtonLabel={t('signInHint')}
      bottomButtonHref={Routes.Login}
      className={cn('w-full', className)}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pb-2">
        <FieldGroup className="gap-4">
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={`${formId}-name`}>{t('name')}</FieldLabel>
                <Input
                  {...field}
                  id={`${formId}-name`}
                  disabled={isPending}
                  placeholder={t('namePlaceholder')}
                  type="text"
                  aria-invalid={fieldState.invalid}
                  autoComplete="name"
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
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
                  placeholder="name@company.com"
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
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword((prev) => !prev)}
                    disabled={isPending}
                    tabIndex={-1}
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
                <FieldLabel htmlFor={`${formId}-confirmPassword`}>{t('confirmPassword')}</FieldLabel>
                <div className="relative">
                  <Input
                    {...field}
                    id={`${formId}-confirmPassword`}
                    disabled={isPending}
                    placeholder="******"
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="pr-10"
                    aria-invalid={fieldState.invalid}
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    disabled={isPending}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? (
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
        <FormError message={error} />
        <FormSuccess message={success} />
        <Button
          disabled={isPending}
          size="lg"
          type="submit"
          className="flex w-full cursor-pointer items-center justify-center gap-2"
        >
          {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
          <span>{t('signUp')}</span>
        </Button>
      </form>
    </AuthCard>
  )
}
