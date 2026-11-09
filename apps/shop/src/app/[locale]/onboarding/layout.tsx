import type { ReactNode } from 'react'
import { requireAuth } from '@/lib/server/auth-utils'

export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  await requireAuth('/signin?callbackUrl=%2Fonboarding')
  return <div className="min-h-svh bg-muted/30">{children}</div>
}
