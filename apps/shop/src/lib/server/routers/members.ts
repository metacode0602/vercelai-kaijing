import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, protectedProcedure, tenantProcedure } from '@/lib/server/trpc'
import * as membersDa from '@/lib/server/dataaccess/members'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const membersRouter = createTRPCRouter({
  list: tenantProcedure
    .input(z.object({ q: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => membersDa.listMembers(ctx.db, ctx.organizationId, input?.q)),
  invite: protectedProcedure
    .input(z.object({ email: z.string().email(), role: z.string().optional(), name: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        membersDa.createInvitation(ctx.db, ctx.organizationId, {
          ...input,
          inviterUserId: ctx.user.id,
        }),
      ),
    ),
  updateRole: tenantProcedure
    .input(z.object({ id: z.string().min(1), role: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => wrap(() => membersDa.updateMemberRole(ctx.db, ctx.organizationId, input))),
})
