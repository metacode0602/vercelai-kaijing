import { router } from '@/lib/server/trpc'
import { productsRouter } from './products'
import { purchaseRouter } from './purchase'
import { orderRouter } from './order'

export * from '@/lib/server/trpc'
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

export const appRouter = router({
  products: productsRouter,
  purchase: purchaseRouter,
  order: orderRouter,
})

export type AppRouter = typeof appRouter
