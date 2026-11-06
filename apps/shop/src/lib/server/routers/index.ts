import { router } from '@/lib/server/trpc'
import { productsRouter } from './products'
import { purchaseRouter } from './purchase'
import { orderRouter } from './order'
import { logisticsRouter } from './logistics'
import { feeTemplatesRouter } from './fee-templates'
import { aftersaleRouter } from './aftersale'

export * from '@/lib/server/trpc'
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

export const appRouter = router({
  products: productsRouter,
  purchase: purchaseRouter,
  order: orderRouter,
  logistics: logisticsRouter,
  feeTemplates: feeTemplatesRouter,
  aftersale: aftersaleRouter,
})

export type AppRouter = typeof appRouter
