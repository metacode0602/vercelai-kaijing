import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as membersDa from '@/lib/server/dataaccess/members'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

function requireUserId(ctx: { user?: { id?: string } | null }): string {
  if (!ctx.user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '请先登录' })
  }
  return ctx.user.id
}

export const membersRouter = createTRPCRouter({
  list: tenantProcedure
    .input(z.object({ q: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => membersDa.listMembers(ctx.db, ctx.organizationId, input?.q)),

  /** 写入 invitation pending；不发送真实邮件。 */
  invite: tenantProcedure
    .input(z.object({ email: z.string().email(), role: z.string().optional(), name: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const inviterUserId = requireUserId(ctx)
      if (input.role === 'owner') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '不可通过邀请设为 owner' })
      }
      return wrap(() =>
        membersDa.createInvitation(ctx.db, ctx.organizationId, {
          ...input,
          inviterUserId,
        }),
      )
    }),

  updateRole: tenantProcedure
    .input(z.object({ id: z.string().min(1), role: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      requireUserId(ctx)
      if (input.role === 'owner') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '不可通过此接口设为 owner' })
      }
      return wrap(() => membersDa.updateMemberRole(ctx.db, ctx.organizationId, input))
    }),

  /** 仅 owner：pending → canceled */
  cancelInvitation: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actorUserId = requireUserId(ctx)
      return wrap(() =>
        membersDa.cancelInvitation(ctx.db, ctx.organizationId, { id: input.id, actorUserId }),
      )
    }),
})
