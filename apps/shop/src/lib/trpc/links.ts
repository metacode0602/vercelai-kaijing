'use client'

import { httpBatchLink, loggerLink } from '@trpc/client'
import superjson from 'superjson'

export const trpcLinks = [
  loggerLink({
    enabled: (opts) =>
      process.env.NODE_ENV === 'development' ||
      (opts.direction === 'down' && opts.result instanceof Error),
  }),
  httpBatchLink({
    url: '/api/trpc',
    maxURLLength: 14000,
    transformer: superjson,
    headers() {
      return { 'x-trpc-source': 'shop-client' }
    },
  }),
]
