import { initTRPC } from '@trpc/server'
import { transformer } from './transformer'

export const t = initTRPC.context<{ user: { id: string } | null }>().create({
  transformer,
})

export const createTRPCRouter = t.router
export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new Error('Unauthorized')
  return next({ ctx: { ...ctx, user: ctx.user } })
})
export const adminProcedure = protectedProcedure
export const sharedReadProcedure = protectedProcedure
