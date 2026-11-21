import { router } from './trpc'
import { apiKeysRouter } from './apiKeys'
import { platformOnboardingRouter } from './platformOnboarding'
import { platformOpsRouter } from './platformOps'
import { platformBasicsRouter } from './platformBasics'
import { platformDictionariesRouter } from './platformDictionaries'
import { platformCategoriesRouter } from './platformCategories'
import { platformCarriersRouter } from './platformCarriers'
import { platformImportTemplatesRouter } from './platformImportTemplates'
import { platformHsTariffsRouter } from './platformHsTariffs'
import { platformFeeTemplatesRouter } from './platformFeeTemplates'
import { platformShopsRouter } from './platformShops'
import { platformUsersRouter } from './platformUsers'
import { platformInvitationsRouter } from './platformInvitations'
import { siteMessagesRouter } from './site-messages'
import { platformSettingsRouter } from './platformSettings'

export * from './trpc'
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

export const appRouter = router({
  apiKeys: apiKeysRouter,
  platformOnboarding: platformOnboardingRouter,
  platformOps: platformOpsRouter,
  platformBasics: platformBasicsRouter,
  platformDictionaries: platformDictionariesRouter,
  platformCategories: platformCategoriesRouter,
  platformCarriers: platformCarriersRouter,
  platformImportTemplates: platformImportTemplatesRouter,
  platformHsTariffs: platformHsTariffsRouter,
  platformFeeTemplates: platformFeeTemplatesRouter,
  platformShops: platformShopsRouter,
  platformUsers: platformUsersRouter,
  platformInvitations: platformInvitationsRouter,
  siteMessages: siteMessagesRouter,
  platformSettings: platformSettingsRouter,
})

export type AppRouter = typeof appRouter
