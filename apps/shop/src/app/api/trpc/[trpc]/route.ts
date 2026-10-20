import { createTRPCContext } from '@/lib/server/trpc'
import { appRouter } from '@/lib/server/routers'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: async (opts) => {
      return await createTRPCContext({ headers: new Headers(opts.req.headers) })
    },
  })

export { handler as GET, handler as POST }
