'use client'

import { useEffect, useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { SmsSliderCaptcha } from '@/components/auth/sms-slider-captcha'
import { trpc } from '@/lib/trpc/client'
import { toast } from 'sonner'

/**
 * 账号绑定卡片：仅在对应渠道未绑定时展示绑定入口。
 * 绑定全部走服务端 tRPC，userId 取自会话，客户端无法指定目标用户。
 */
export function ContactBindingCard() {
  const utils = trpc.useUtils()
  const status = trpc.contactBinding.status.useQuery()

  const [email, setEmail] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [captchaOpen, setCaptchaOpen] = useState(false)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown((v) => v - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const sendEmailCode = trpc.contactBinding.sendEmailCode.useMutation({
    onSuccess: () => {
      toast.success('验证码已发送到该邮箱')
      setCountdown(60)
    },
    onError: (err) => toast.error(err.message),
  })

  const bindEmail = trpc.contactBinding.bindEmail.useMutation({
    onSuccess: async () => {
      toast.success('邮箱绑定成功')
      setEmail('')
      setEmailCode('')
      await utils.contactBinding.status.invalidate()
    },
    onError: (err) => toast.error(err.message),
  })

  const sendPhoneCode = trpc.contactBinding.sendPhoneCode.useMutation({
    onSuccess: () => {
      toast.success('验证码已发送到该手机号')
      setCountdown(60)
      setCaptchaOpen(false)
    },
    onError: (err) => toast.error(err.message),
  })

  const bindPhone = trpc.contactBinding.bindPhone.useMutation({
    onSuccess: async () => {
      toast.success('手机号绑定成功')
      setPhone('')
      setPhoneCode('')
      await utils.contactBinding.status.invalidate()
    },
    onError: (err) => toast.error(err.message),
  })

  if (status.isLoading) return null

  const { emailBound, phoneBound, email: currentEmail, phoneNumber: currentPhone } =
    status.data ?? { emailBound: true, phoneBound: true, email: null, phoneNumber: null }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">邮箱绑定</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {emailBound ? '邮箱已绑定，用于接收账单与系统通知。' : '绑定邮箱后可接收账单与系统通知。'}
        </p>

        {emailBound ? (
          <p className="mt-4 text-sm">{currentEmail}</p>
        ) : (
          <div className="mt-4 space-y-3">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="请输入要绑定的邮箱"
              type="email"
              disabled={sendEmailCode.isPending || bindEmail.isPending}
            />
            <div className="flex items-center gap-2">
              <Input
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 位验证码"
                inputMode="numeric"
                maxLength={6}
                className="flex-1"
                disabled={bindEmail.isPending}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={!email || countdown > 0 || sendEmailCode.isPending}
                onClick={() => sendEmailCode.mutate({ email })}
              >
                {sendEmailCode.isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                {countdown > 0 ? `${countdown}s` : '发送验证码'}
              </Button>
              <Button
                type="button"
                disabled={emailCode.length !== 6 || bindEmail.isPending}
                onClick={() => bindEmail.mutate({ email, code: emailCode })}
              >
                {bindEmail.isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                绑定
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">手机号绑定</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {phoneBound ? '手机号已绑定。' : '绑定手机号后可接收短信通知。'}
        </p>

        {phoneBound ? (
          <p className="mt-4 text-sm">{currentPhone}</p>
        ) : (
          <div className="mt-4 space-y-3">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="请输入要绑定的手机号"
              type="tel"
              disabled={sendPhoneCode.isPending || bindPhone.isPending}
            />
            <div className="flex items-center gap-2">
              <Input
                value={phoneCode}
                onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 位验证码"
                inputMode="numeric"
                maxLength={6}
                className="flex-1"
                disabled={bindPhone.isPending}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={!phone || countdown > 0 || sendPhoneCode.isPending}
                onClick={() => setCaptchaOpen(true)}
              >
                {sendPhoneCode.isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                {countdown > 0 ? `${countdown}s` : '发送验证码'}
              </Button>
              <Button
                type="button"
                disabled={phoneCode.length !== 6 || bindPhone.isPending}
                onClick={() => bindPhone.mutate({ phone, code: phoneCode })}
              >
                {bindPhone.isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                绑定
              </Button>
            </div>
          </div>
        )}
      </div>

      <SmsSliderCaptcha
        open={captchaOpen}
        onOpenChange={setCaptchaOpen}
        onVerified={(token) => {
          void sendPhoneCode.mutateAsync({ phone, captchaToken: token }).catch(() => undefined)
        }}
      />
    </div>
  )
}
