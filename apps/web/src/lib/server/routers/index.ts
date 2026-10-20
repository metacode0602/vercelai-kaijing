
import { router } from './trpc'
import { authRouter } from './auth'
import { apiKeysRouter } from './web/apiKeys'
import { dashboardRouter } from './web/dashboard'
import { firstLoginRouter } from './web/first-login'
import { invitationRouter } from './invitation'
import { newslettersRouter } from './web/newsletters'
import { crmRouter } from './crm'
import { financeRouter } from './finance'
import { merchantRouter } from './merchant'
import { supplierRouter } from './supplier'
import { schedulingRouter } from './scheduling'
import { siteMessagesRouter } from './web/site-messages'
import { integrationFeishuRouter } from './integration/feishu'
import { customImageRouter } from './admin/custom-image'
import { baseImageRouter } from './admin/base-image'
import { baseImageVersionRouter } from './admin/base-image-version'
import { applicationTemplateRouter } from './admin/application-template'
import { preloadTaskRouter } from './admin/preload-task'
import { contactBindingRouter } from './contact-binding'

export * from './trpc'
export type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

export const appRouter = router({
  auth: authRouter,
  contactBinding: contactBindingRouter,
  apiKeys: apiKeysRouter,
  dashboard: dashboardRouter,
  firstLogin: firstLoginRouter,
  invitation: invitationRouter,
  newsletters: newslettersRouter,
  crm: crmRouter,
  finance: financeRouter,
  merchant: merchantRouter,
  supplier: supplierRouter,
  scheduling: schedulingRouter,
  siteMessages: siteMessagesRouter,
  integration: router({
    feishu: integrationFeishuRouter,
  }),
  // Admin routes
  admin: router({
    customImage: customImageRouter,
    baseImage: baseImageRouter,
    baseImageVersion: baseImageVersionRouter,
    applicationTemplate: applicationTemplateRouter,
    preloadTask: preloadTaskRouter,
  }),
})

// export type definition of API
export type AppRouter = typeof appRouter
