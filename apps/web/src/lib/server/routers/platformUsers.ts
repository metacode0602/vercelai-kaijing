import { z } from 'zod'
import {
  banPlatformUser,
  getPlatformUser,
  listPlatformUsers,
  unbanPlatformUser,
} from '@/lib/server/dataaccess/platform-users'
import { createTRPCRouter, protectedProcedure } from './trpc'

export const platformUsersRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
        q: z.string().max(120).optional(),
        status: z.enum(['all', 'active', 'banned']).optional(),
      }),
    )
    .query(({ input }) => listPlatformUsers(input)),
  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const row = await getPlatformUser(input.id)
      if (!row) throw new Error('用户不存在')
      return row
    }),
  ban: protectedProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        reason: z.string().trim().min(2).max(500),
        banExpiresAt: z.string().datetime().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      banPlatformUser({
        userId: input.userId,
        operatorId: ctx.user.id,
        reason: input.reason,
        expiresAt: input.banExpiresAt ? new Date(input.banExpiresAt) : null,
      }),
    ),
  unban: protectedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      unbanPlatformUser({ userId: input.userId, operatorId: ctx.user.id }),
    ),
})
