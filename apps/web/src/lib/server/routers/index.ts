import { router } from './trpc'
import { apiKeysRouter } from './apiKeys'
import { platformOnboardingRouter } from './platformOnboarding'
import { platformOpsRouter } from './platformOps'
import { platformBasicsRouter } from './platformBasics'
import { platformShopsRouter } from './platformShops'
import { platformUsersRouter } from './platformUsers'
import { platformInvitationsRouter } from './platformInvitations'
import { siteMessagesRouter } from './site-messages'

export * from './trpc'
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

export const appRouter = router({
  apiKeys: apiKeysRouter,
  platformOnboarding: platformOnboardingRouter,
  platformOps: platformOpsRouter,
  platformBasics: platformBasicsRouter,
  platformShops: platformShopsRouter,
  platformUsers: platformUsersRouter,
  platformInvitations: platformInvitationsRouter,
  siteMessages: siteMessagesRouter,
})

export type AppRouter = typeof appRouter
