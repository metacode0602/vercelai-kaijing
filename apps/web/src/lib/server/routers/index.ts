import { router } from './trpc'
import { apiKeysRouter } from './apiKeys'

export * from './trpc'
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

export const appRouter = router({
  apiKeys: apiKeysRouter,
})

export type AppRouter = typeof appRouter
