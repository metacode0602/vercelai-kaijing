import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as notificationsDa from '@/lib/server/dataaccess/notifications'
import { UI_NOTIFICATION_CATEGORIES } from '@/lib/server/mappers/notifications'

export const notificationsRouter = createTRPCRouter({
  list: tenantProcedure
    .input(
      z
        .object({
          page: z.number().int().min(1).optional(),
          pageSize: z.number().int().min(1).max(100).optional(),
          unreadOnly: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return notificationsDa.listNotifications(
        ctx.db,
        ctx.organizationId,
        ctx.user?.id ?? null,
        input ?? {},
      )
    }),

  unreadCount: tenantProcedure.query(async ({ ctx }) => {
    return notificationsDa.unreadCount(ctx.db, ctx.organizationId, ctx.user?.id ?? null)
  }),

  markRead: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const row = await notificationsDa.markRead(
        ctx.db,
        ctx.organizationId,
        ctx.user?.id ?? null,
        input.id,
      )
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到通知 ${input.id}` })
      return row
    }),

  markAllRead: tenantProcedure.mutation(async ({ ctx }) => {
    return notificationsDa.markAllRead(ctx.db, ctx.organizationId, ctx.user?.id ?? null)
  }),

  meta: tenantProcedure.query(async () => ({
    categories: [...UI_NOTIFICATION_CATEGORIES],
    note: '站内信仅落库，不自动外传到飞书/邮件/短信',
  })),
})
