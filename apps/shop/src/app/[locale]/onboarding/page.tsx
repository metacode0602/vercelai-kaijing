import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard'
import { requireOnboardingEntry } from '@/lib/server/auth-utils'

export default async function OnboardingPage() {
  await requireOnboardingEntry('/signin?callbackUrl=%2Fonboarding')
  return <OnboardingWizard />
}
