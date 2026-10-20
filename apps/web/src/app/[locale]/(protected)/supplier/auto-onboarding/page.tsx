import { Suspense } from 'react'
import { AutoOnboardingConfigClient } from './_components/auto-onboarding-config-client'

export default async function AutoOnboardingConfigPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">加载中…</div>}>
      <AutoOnboardingConfigClient />
    </Suspense>
  )
}
