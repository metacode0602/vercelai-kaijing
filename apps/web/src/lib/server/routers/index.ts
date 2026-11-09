import { router } from './trpc'
import { apiKeysRouter } from './apiKeys'
import { platformOnboardingRouter } from './platformOnboarding'
import { platformOpsRouter } from './platformOps'

export * from './trpc'
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

export const appRouter = router({
  apiKeys: apiKeysRouter,
  platformOnboarding: platformOnboardingRouter,
  platformOps: platformOpsRouter,
})

export type AppRouter = typeof appRouter
