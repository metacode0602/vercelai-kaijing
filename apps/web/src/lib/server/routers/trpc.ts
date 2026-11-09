import { initTRPC } from '@trpc/server'
import { transformer } from './transformer'

export const t = initTRPC
  .context<{ user: { id: string } | null; isPlatformAdmin: boolean }>()
  .create({
    transformer,
  })

export const createTRPCRouter = t.router
export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new Error('Unauthorized')
  // 会话级平台管理员校验（web_auth 组织成员），与 (protected)/layout 同口径
  if (!ctx.isPlatformAdmin) throw new Error('Forbidden')
  return next({ ctx: { ...ctx, user: ctx.user, isPlatformAdmin: true } })
})
export const adminProcedure = protectedProcedure
export const sharedReadProcedure = protectedProcedure
