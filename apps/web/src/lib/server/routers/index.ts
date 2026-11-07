import { router } from './trpc'
import { apiKeysRouter } from './apiKeys'
import { platformOnboardingRouter } from './platformOnboarding'

export * from './trpc'
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

export const appRouter = router({
  apiKeys: apiKeysRouter,
  platformOnboarding: platformOnboardingRouter,
})

export type AppRouter = typeof appRouter
