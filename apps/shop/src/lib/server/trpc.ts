import { TRPCError, initTRPC } from '@trpc/server'
import { ZodError } from 'zod'
import { auth } from '@/lib/auth'
import { transformer } from './routers/transformer'
import type { Session, User } from 'better-auth'

type SessionWithOrg = Session & { activeOrganizationId?: string | null }

interface CreateContextOptions {
  headers: Headers
  user: User | null
  session: SessionWithOrg | null
}

export const createInnerTRPCContext = (opts: CreateContextOptions) => {
  return { ...opts }
}

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const authSession = await auth.api.getSession({ headers: opts.headers })
  return createInnerTRPCContext({
    user: authSession?.user ?? null,
    session: (authSession?.session as SessionWithOrg) ?? null,
    headers: opts.headers,
  })
}

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

export const createTRPCRouter = t.router
export const router = t.router
export const createCallerFactory = t.createCallerFactory
export const publicProcedure = t.procedure

/**
 * 要求用户已登录且有 active organization（tenant）
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const orgId = ctx.session?.activeOrganizationId
  if (!orgId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: '请先登录并加入组织',
    })
  }
  return next({
    ctx: {
      user: ctx.user as User,
      session: ctx.session as Session,
      organizationId: orgId,
    },
  })
})

export type AppRouter = ReturnType<typeof createTRPCRouter>
