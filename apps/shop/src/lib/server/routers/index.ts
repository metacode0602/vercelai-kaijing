import { router } from '@/lib/server/trpc'
import { productsRouter } from './products'
import { purchaseRouter } from './purchase'
import { orderRouter } from './order'
import { logisticsRouter } from './logistics'
import { feeTemplatesRouter } from './fee-templates'
import { aftersaleRouter } from './aftersale'
import { csInboxRouter } from './cs-inbox'
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
import { freightRateCardsRouter } from './freight-rate-cards'
import { categoriesRouter } from './categories'
import { brandsRouter } from './brands'
import { dictionariesRouter } from './dictionaries'
import { importTemplatesRouter } from './import-templates'
import { auditRouter } from './audit'
import { membersRouter } from './members'
import { organizationRouter } from './organization'
import { shopsRouter } from './shops'
import { marketplaceAppsRouter } from './marketplace-apps'
import { onboardingRouter } from './onboarding'
import { cartonSpecsRouter } from './carton-specs'
import { pendingRouter } from './pending'
import { reportsRouter } from './reports'
import { fxRatesRouter } from './fx-rates'
import { integrationLogsRouter } from './integration-logs'
import { stockAlertsRouter } from './stock-alerts'
import { rolesRouter } from './roles'
import { platformBasicsRouter } from './platform-basics'
import { complianceRouter } from './compliance'
import { pricingRouter } from './pricing'
import { hsTariffsRouter } from './hs-tariffs'

export * from '@/lib/server/trpc'
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

export const appRouter = router({
  products: productsRouter,
  purchase: purchaseRouter,
  order: orderRouter,
  logistics: logisticsRouter,
  feeTemplates: feeTemplatesRouter,
  aftersale: aftersaleRouter,
  csInbox: csInboxRouter,
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
  freightRateCards: freightRateCardsRouter,
  carriers: carriersRouter,
  categories: categoriesRouter,
  brands: brandsRouter,
  dictionaries: dictionariesRouter,
  importTemplates: importTemplatesRouter,
  audit: auditRouter,
  members: membersRouter,
  organization: organizationRouter,
  shops: shopsRouter,
  marketplaceApps: marketplaceAppsRouter,
  onboarding: onboardingRouter,
  cartonSpecs: cartonSpecsRouter,
  pending: pendingRouter,
  reports: reportsRouter,
  fxRates: fxRatesRouter,
  integrationLogs: integrationLogsRouter,
  stockAlerts: stockAlertsRouter,
  roles: rolesRouter,
  platformBasics: platformBasicsRouter,
  compliance: complianceRouter,
  pricing: pricingRouter,
  hsTariffs: hsTariffsRouter,
})

export type AppRouter = typeof appRouter
