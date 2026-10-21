'use client'

import { cn } from '@workspace/ui/lib/utils'
import { useAuthStore } from '@/lib/stores/auth-store'
import { LoginForm } from '@/components/auth/login-form'
import { PhoneLoginForm } from '@/components/auth/phone-login-form'

export interface UnifiedLoginFormProps {
  className?: string
  callbackUrl?: string
}

export function UnifiedLoginForm({ className, callbackUrl }: UnifiedLoginFormProps) {
  const { authMode } = useAuthStore()
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {authMode === 'phone' && <PhoneLoginForm callbackUrl={callbackUrl} />}
      {authMode === 'email' && <LoginForm callbackUrl={callbackUrl} />}
    </div>
  )
}
