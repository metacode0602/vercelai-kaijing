import { router } from '@/lib/server/trpc'
import { productsRouter } from './products'

export * from '@/lib/server/trpc'
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

export const appRouter = router({
  products: productsRouter,
})

export type AppRouter = typeof appRouter
