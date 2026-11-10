import { z } from 'zod'
import {
  disablePlatformShop,
  getPlatformShop,
  listPlatformShops,
  restorePlatformShop,
} from '@/lib/server/dataaccess/platform-shops'
import { createTRPCRouter, protectedProcedure } from './trpc'

export const platformShopsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        q: z.string().max(120).optional(),
        platform: z.string().max(32).optional(),
        status: z.string().max(32).optional(),
      }),
    )
    .query(({ input }) => listPlatformShops(input)),
  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const row = await getPlatformShop(input.id)
      if (!row) throw new Error('店铺不存在')
      return row
    }),
  disable: protectedProcedure
    .input(
      z.object({
        shopId: z.string().min(1),
        reason: z.string().max(500).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      disablePlatformShop({
        shopId: input.shopId,
        operatorId: ctx.user.id,
        reason: input.reason,
      }),
    ),
  restore: protectedProcedure
    .input(z.object({ shopId: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      restorePlatformShop({ shopId: input.shopId, operatorId: ctx.user.id }),
    ),
})
