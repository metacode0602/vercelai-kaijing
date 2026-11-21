import { eq } from "drizzle-orm"
import type { AppDatabase } from "./client"

type PlatformSettingsDb = Pick<AppDatabase, "select" | "insert" | "update">
import {
  DEFAULT_ONBOARDING_DOCUMENT_REQUIREMENTS,
  onboardingDocumentRequirementsSchema,
  PLATFORM_SETTINGS_GLOBAL_ID,
  type OnboardingDocumentRequirements,
} from "./onboarding-document-requirements"
import { platformSettings } from "./commerce-schema"

export async function getOnboardingDocumentRequirements(
  db: PlatformSettingsDb,
): Promise<OnboardingDocumentRequirements> {
  const [row] = await db
    .select({
      requirements: platformSettings.onboardingDocumentRequirements,
    })
    .from(platformSettings)
    .where(eq(platformSettings.id, PLATFORM_SETTINGS_GLOBAL_ID))
    .limit(1)

  if (!row) {
    return { ...DEFAULT_ONBOARDING_DOCUMENT_REQUIREMENTS }
  }

  const parsed = onboardingDocumentRequirementsSchema.safeParse(row.requirements)
  return parsed.success ? parsed.data : { ...DEFAULT_ONBOARDING_DOCUMENT_REQUIREMENTS }
}

export async function updateOnboardingDocumentRequirements(
  db: PlatformSettingsDb,
  input: OnboardingDocumentRequirements,
  updatedBy?: string | null,
): Promise<OnboardingDocumentRequirements> {
  const requirements = onboardingDocumentRequirementsSchema.parse(input)
  const now = new Date()

  const [existing] = await db
    .select({ id: platformSettings.id })
    .from(platformSettings)
    .where(eq(platformSettings.id, PLATFORM_SETTINGS_GLOBAL_ID))
    .limit(1)

  if (!existing) {
    await db.insert(platformSettings).values({
      id: PLATFORM_SETTINGS_GLOBAL_ID,
      onboardingDocumentRequirements: requirements,
      updatedBy: updatedBy ?? null,
      updatedAt: now,
    })
  } else {
    await db
      .update(platformSettings)
      .set({
        onboardingDocumentRequirements: requirements,
        updatedBy: updatedBy ?? null,
        updatedAt: now,
      })
      .where(eq(platformSettings.id, PLATFORM_SETTINGS_GLOBAL_ID))
  }

  return requirements
}