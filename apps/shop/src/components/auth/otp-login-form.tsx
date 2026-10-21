'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { websiteConfig } from '@/lib/config/website'
import { LocaleLink, useLocaleRouter } from '@/lib/i18n/navigation'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@workspace/ui/components/input-otp'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs'
import { cn } from '@workspace/ui/lib/utils'

type Channel = 'phone' | 'email'

const COOLDOWN_SECONDS = 60
const OTP_LENGTH = 6

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length > 11 && digits.startsWith('86')) {
    const rest = digits.slice(2)
    if (rest.length === 11) return rest
  }
  return digits
}

function isValidPhone(value: string) {
  return /^1\d{10}$/.test(normalizePhone(value))
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function mapAuthError(message: string | undefined, fallback: string) {
  if (!message) return fallback
  const lower = message.toLowerCase()
  if (message.includes('RATE_LIMITED') || message.includes('过于频繁') || message.includes('上限')) {
    return message.replace(/^Error:\s*/, '')
  }
  if (lower.includes('too many') || lower.includes('rate')) {
    return '请求过于频繁，请稍后再试'
  }
  if (lower.includes('expired')) return '验证码已过期，请重新获取'
  if (lower.includes('invalid') && lower.includes('otp')) return '验证码错误，请重试'
  if (lower.includes('invalid') && lower.includes('phone')) return '手机号格式不正确'
  if (lower.includes('attempt')) return '验证码尝试次数过多，请重新获取验证码'
  return message
}

async function readErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') return fallback
  const err = error as {
    message?: string
    status?: number
    error?: { message?: string; code?: string }
  }
  const msg = err.error?.message || err.message
  return mapAuthError(msg, fallback)
}

export function OtpLoginForm({ className }: { className?: string }) {
  const t = useTranslations('Auth')
  const tPage = useTranslations('AuthPage')
  const router = useLocaleRouter()
  const redirectTo = websiteConfig.routes.defaultLoginRedirect

  const [channel, setChannel] = useState<Channel>('phone')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = window.setInterval(() => {
      setCooldown((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [cooldown])

  const identifierReady = useMemo(() => {
    return channel === 'phone' ? isValidPhone(phone) : isValidEmail(email)
  }, [channel, phone, email])

  const resetFeedback = useCallback(() => {
    setError(null)
    setInfo(null)
  }, [])

  const onSendCode = useCallback(async () => {
    resetFeedback()
    setDevCode(null)
    if (channel === 'phone' && !isValidPhone(phone)) {
      setError(t('phoneLogin.invalidPhone'))
      return
    }
    if (channel === 'email' && !isValidEmail(email)) {
      setError(t('otp.invalidEmail'))
      return
    }
    setSending(true)
    try {
      if (channel === 'phone') {
        const phoneNumber = normalizePhone(phone)
        const { error: sendError, data } = await authClient.phoneNumber.sendOtp({
          phoneNumber,
        })
        if (sendError) {
          setError(await readErrorMessage(sendError, t('phoneLogin.sendCodeFailed')))
          return
        }
        const code = (data as { devCode?: string } | undefined)?.devCode
        if (code) setDevCode(code)
      } else {
        const { error: sendError, data } = await authClient.emailOtp.sendVerificationOtp({
          email: email.trim().toLowerCase(),
          type: 'sign-in',
        })
        if (sendError) {
          setError(await readErrorMessage(sendError, t('otp.sendCodeFailed')))
          return
        }
        const code = (data as { devCode?: string } | undefined)?.devCode
        if (code) setDevCode(code)
      }
      setInfo(t('otp.codeSent'))
      setCooldown(COOLDOWN_SECONDS)
    } catch (e) {
      setError(await readErrorMessage(e, t('otp.sendCodeFailed')))
    } finally {
      setSending(false)
    }
  }, [channel, phone, email, resetFeedback, t])

  const onSubmit = useCallback(async () => {
    resetFeedback()
    if (otp.length !== OTP_LENGTH) {
      setError(t('phoneLogin.codeRequired'))
      return
    }
    setSubmitting(true)
    try {
      if (channel === 'phone') {
        const phoneNumber = normalizePhone(phone)
        const { error: verifyError } = await authClient.phoneNumber.verify({
          phoneNumber,
          code: otp,
        })
        if (verifyError) {
          setError(await readErrorMessage(verifyError, t('phoneLogin.verifyFailed')))
          return
        }
      } else {
        const { error: signInError } = await authClient.signIn.emailOtp({
          email: email.trim().toLowerCase(),
          otp,
        })
        if (signInError) {
          setError(await readErrorMessage(signInError, t('otp.verifyFailed')))
          return
        }
      }
      setInfo(t('otp.success'))
      router.replace(redirectTo)
      router.refresh()
    } catch (e) {
      setError(await readErrorMessage(e, t('otp.verifyFailed')))
    } finally {
      setSubmitting(false)
    }
  }, [channel, phone, email, otp, redirectTo, resetFeedback, router, t])

  return (
    <div className={cn('mx-auto w-full max-w-md space-y-6', className)}>
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t('otp.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('otp.description')}</p>
      </div>

      <Tabs
        value={channel}
        onValueChange={(v) => {
          setChannel(v as Channel)
          setOtp('')
          setDevCode(null)
          resetFeedback()
        }}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="phone">{t('otp.tabPhone')}</TabsTrigger>
          <TabsTrigger value="email">{t('otp.tabEmail')}</TabsTrigger>
        </TabsList>

        <TabsContent value="phone" className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">{t('phoneLogin.phoneNumber')}</Label>
            <Input
              id="phone"
              inputMode="numeric"
              autoComplete="tel"
              placeholder={t('phoneLogin.phonePlaceholder')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={sending || submitting}
            />
          </div>
        </TabsContent>

        <TabsContent value="email" className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t('otp.email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder={t('otp.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sending || submitting}
            />
          </div>
        </TabsContent>
      </Tabs>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="otp">{t('phoneLogin.verificationCode')}</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            disabled={!identifierReady || sending || cooldown > 0}
            onClick={onSendCode}
          >
            {sending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {t('otp.sending')}
              </>
            ) : cooldown > 0 ? (
              t('phoneLogin.countdown', { seconds: cooldown })
            ) : (
              t('otp.getCode')
            )}
          </Button>
        </div>
        <InputOTP
          id="otp"
          maxLength={OTP_LENGTH}
          value={otp}
          onChange={setOtp}
          disabled={submitting}
          containerClassName="justify-between"
        >
          <InputOTPGroup className="w-full justify-between gap-2">
            {Array.from({ length: OTP_LENGTH }).map((_, i) => (
              <InputOTPSlot key={i} index={i} className="size-10 sm:size-11" />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="text-sm text-muted-foreground" role="status">
          {info}
        </p>
      ) : null}
      {devCode ? (
        <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
          {t('otp.devCodeHint', { code: devCode })}
        </p>
      ) : null}

      <Button
        type="button"
        className="w-full"
        size="lg"
        disabled={submitting || otp.length !== OTP_LENGTH || !identifierReady}
        onClick={onSubmit}
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t('otp.submitting')}
          </>
        ) : (
          t('otp.submit')
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        {tPage('common.byClickingContinue')}{' '}
        <LocaleLink href="/terms" className="underline underline-offset-2">
          {tPage('common.termsOfService')}
        </LocaleLink>{' '}
        {tPage('common.and')}{' '}
        <LocaleLink href="/privacy" className="underline underline-offset-2">
          {tPage('common.privacyPolicy')}
        </LocaleLink>
      </p>
    </div>
  )
}
