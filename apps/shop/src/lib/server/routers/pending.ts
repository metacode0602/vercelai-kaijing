import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as pendingDa from '@/lib/server/dataaccess/pending'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  kind: z.string().optional(),
  status: z.string().optional(),
  shopId: z.string().optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const pendingRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return pendingDa.listPendingActions(ctx.db, ctx.organizationId, input)
  }),
  stats: tenantProcedure.query(async ({ ctx }) => pendingDa.pendingStats(ctx.db, ctx.organizationId)),
  get: tenantProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const row = await pendingDa.getPendingAction(ctx.db, ctx.organizationId, input.id)
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到待审单 ${input.id}` })
    return row
  }),
  confirm: tenantProcedure
    .input(z.object({ id: z.string().min(1), actor: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => pendingDa.confirmPendingAction(ctx.db, ctx.organizationId, input.id, input.actor ?? ctx.user?.id)),
    ),
  reject: tenantProcedure
    .input(z.object({ id: z.string().min(1), reason: z.string().optional(), actor: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        pendingDa.rejectPendingAction(
          ctx.db,
          ctx.organizationId,
          input.id,
          input.reason,
          input.actor ?? ctx.user?.id,
        ),
      ),
    ),
})
