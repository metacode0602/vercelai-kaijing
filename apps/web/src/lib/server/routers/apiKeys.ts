import { z } from 'zod'

import { createTRPCRouter, protectedProcedure } from './trpc'

export const apiKeysRouter = createTRPCRouter({
  list: protectedProcedure.query(async () => {
    return []
  }),
})
