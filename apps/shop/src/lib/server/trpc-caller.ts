import { createTRPCContext, createCallerFactory } from '@/lib/server/trpc'
import { appRouter } from '@/lib/server/routers'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

/**
 * Create a server-side tRPC caller for use in Server Components.
 * Resolves the auth session from request headers and creates a context
 * with the active organization ID.
 */
export const createServerCaller = async () => {
  const headersList = await headers()
  const authSession = await auth.api.getSession({ headers: headersList })

  const ctx = await createTRPCContext({ headers: headersList })

  const callerFactory = createCallerFactory(appRouter)
  return callerFactory(ctx)
}
