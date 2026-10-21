import type { Metadata } from 'next'
import { OtpLoginForm } from '@/components/auth/otp-login-form'

export const metadata: Metadata = {
  title: '登录 / 注册',
  description: '手机号或邮箱验证码登录',
}

export default function LoginPage() {
  return (
    <div className="w-full rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <OtpLoginForm />
    </div>
  )
}
