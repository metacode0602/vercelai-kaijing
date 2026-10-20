import { createTRPCRouter } from '../trpc'
import { computeRouter } from './compute'
import { metalRouter } from './metal'
import { billingRouter } from './billing'
import { paymentRouter } from './payment'
import { identityRouter } from './identity'
import { registryRouter } from './registry'
import { imageRouter } from './image'
import { baseImageRouter } from './base-image'
import { applicationTemplateRouter } from './application-template'
import { contactBindingRouter } from './contact-binding'

export const appRouter = createTRPCRouter({
  compute: computeRouter,
  metal: metalRouter,
  billing: billingRouter,
  payment: paymentRouter,
  identity: identityRouter,
  registry: registryRouter,
  image: imageRouter,
  baseImage: baseImageRouter,
  applicationTemplate: applicationTemplateRouter,
  contactBinding: contactBindingRouter,
})

export type AppRouter = typeof appRouter
