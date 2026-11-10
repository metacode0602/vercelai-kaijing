import { router } from './trpc'
import { apiKeysRouter } from './apiKeys'
import { platformOnboardingRouter } from './platformOnboarding'
import { platformOpsRouter } from './platformOps'
import { platformBasicsRouter } from './platformBasics'
import { platformShopsRouter } from './platformShops'
import { platformUsersRouter } from './platformUsers'

export * from './trpc'
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

export const appRouter = router({
  apiKeys: apiKeysRouter,
  platformOnboarding: platformOnboardingRouter,
  platformOps: platformOpsRouter,
  platformBasics: platformBasicsRouter,
  platformShops: platformShopsRouter,
  platformUsers: platformUsersRouter,
})

export type AppRouter = typeof appRouter
