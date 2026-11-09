import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { createContextFromRequest } from '@/lib/server/context'
import { appRouter } from '@/lib/server/routers'

export const runtime = 'nodejs'

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: async () => createContextFromRequest(req),
  })

export { handler as GET, handler as POST }
