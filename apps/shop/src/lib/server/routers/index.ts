import { router } from '@/lib/server/trpc'
import { productsRouter } from './products'
import { purchaseRouter } from './purchase'
import { orderRouter } from './order'
import { logisticsRouter } from './logistics'
import { feeTemplatesRouter } from './fee-templates'
import { aftersaleRouter } from './aftersale'
import { oceanRouter } from './ocean'
import { wmsRouter } from './wms'
import { listingsRouter } from './listings'
import { mappingsRouter } from './mappings'
import { suppliersRouter } from './suppliers'
import { orderExceptionsRouter } from './order-exceptions'
import { syncRouter } from './sync'
import { financeRouter } from './finance'
import { dashboardRouter } from './dashboard'
import { candidatesRouter } from './candidates'
import { notificationsRouter } from './notifications'
import { reviewsRouter } from './reviews'
import { carriersRouter } from './carriers'
import { categoriesRouter } from './categories'
import { dictionariesRouter } from './dictionaries'
import { importTemplatesRouter } from './import-templates'
import { auditRouter } from './audit'
import { membersRouter } from './members'
import { shopsRouter } from './shops'
import { onboardingRouter } from './onboarding'
import { cartonSpecsRouter } from './carton-specs'
import { pendingRouter } from './pending'
import { reportsRouter } from './reports'
import { fxRatesRouter } from './fx-rates'
import { integrationLogsRouter } from './integration-logs'

export * from '@/lib/server/trpc'
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

export const appRouter = router({
  products: productsRouter,
  purchase: purchaseRouter,
  order: orderRouter,
  logistics: logisticsRouter,
  feeTemplates: feeTemplatesRouter,
  aftersale: aftersaleRouter,
  ocean: oceanRouter,
  wms: wmsRouter,
  listings: listingsRouter,
  mappings: mappingsRouter,
  suppliers: suppliersRouter,
  orderExceptions: orderExceptionsRouter,
  sync: syncRouter,
  finance: financeRouter,
  dashboard: dashboardRouter,
  candidates: candidatesRouter,
  notifications: notificationsRouter,
  reviews: reviewsRouter,
  carriers: carriersRouter,
  categories: categoriesRouter,
  dictionaries: dictionariesRouter,
  importTemplates: importTemplatesRouter,
  audit: auditRouter,
  members: membersRouter,
  shops: shopsRouter,
  onboarding: onboardingRouter,
  cartonSpecs: cartonSpecsRouter,
  pending: pendingRouter,
  reports: reportsRouter,
  fxRates: fxRatesRouter,
  integrationLogs: integrationLogsRouter,
})

export type AppRouter = typeof appRouter
