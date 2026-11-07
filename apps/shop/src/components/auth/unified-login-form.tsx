'use client'

import { FormSuccess } from '@/components/auth/form-success'
import { LoginForm } from '@/components/auth/login-form'
import { PhoneLoginForm } from '@/components/auth/phone-login-form'
import { useAuthStore } from '@/lib/stores/auth-store'
import { cn } from '@workspace/ui/lib/utils'
import { useSearchParams } from 'next/navigation'

export interface UnifiedLoginFormProps {
  className?: string
  callbackUrl?: string
}

export function UnifiedLoginForm({ className, callbackUrl }: UnifiedLoginFormProps) {
  const { authMode } = useAuthStore()
  const searchParams = useSearchParams()
  const notice = searchParams.get('notice')?.trim() || ''

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {notice ? <FormSuccess message={notice} /> : null}
      {authMode === 'phone' && <PhoneLoginForm callbackUrl={callbackUrl} />}
      {authMode === 'email' && <LoginForm callbackUrl={callbackUrl} />}
    </div>
  )
}
