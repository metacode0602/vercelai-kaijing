import { onboardingDocumentRequirementsSchema } from '@workspace/db/onboarding-document-requirements'
import {
  getPlatformOnboardingDocumentRequirements,
  updatePlatformOnboardingDocumentRequirements,
} from '@/lib/server/dataaccess/platform-settings'
import { createTRPCRouter, protectedProcedure } from './trpc'

export const platformSettingsRouter = createTRPCRouter({
  getOnboardingDocumentRequirements: protectedProcedure.query(() =>
    getPlatformOnboardingDocumentRequirements(),
  ),

  updateOnboardingDocumentRequirements: protectedProcedure
    .input(onboardingDocumentRequirementsSchema)
    .mutation(({ ctx, input }) =>
      updatePlatformOnboardingDocumentRequirements(input, ctx.user.id),
    ),
})