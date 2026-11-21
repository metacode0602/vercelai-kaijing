import type { OnboardingDocumentRequirements } from '@workspace/db/onboarding-document-requirements'
import {
  getOnboardingDocumentRequirements as getRequirements,
  updateOnboardingDocumentRequirements as persistRequirements,
} from '@workspace/db/platform-settings'
import { db } from '@/lib/db'

export async function getPlatformOnboardingDocumentRequirements(): Promise<OnboardingDocumentRequirements> {
  return getRequirements(db)
}

export async function updatePlatformOnboardingDocumentRequirements(
  requirements: OnboardingDocumentRequirements,
  updatedBy: string,
): Promise<OnboardingDocumentRequirements> {
  return persistRequirements(db, requirements, updatedBy)
}