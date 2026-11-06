import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as logsDa from '@/lib/server/dataaccess/integration-logs'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({
      code: /不存在/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST',
      message,
    })
  })
}

export const integrationLogsRouter = createTRPCRouter({
  list: tenantProcedure
    .input(
      z
        .object({
          page: z.number().optional(),
          pageSize: z.number().optional(),
          q: z.string().optional(),
          requestId: z.string().optional(),
          shopId: z.string().optional(),
          status: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => logsDa.listIntegrationLogs(ctx.db, ctx.organizationId, input ?? {})),

  get: tenantProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const row = await logsDa.getIntegrationLog(ctx.db, ctx.organizationId, input.id)
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到接口日志 ${input.id}` })
    return row
  }),

  retry: tenantProcedure
    .input(z.object({ id: z.string().min(1), actor: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        logsDa.retryIntegrationLog(ctx.db, ctx.organizationId, {
          id: input.id,
          actor: input.actor || ctx.user?.name || ctx.user?.email || ctx.user?.id,
        }),
      ),
    ),

  meta: tenantProcedure.query(async () => ({
    note: '读 integration_logs（经 shops 组织隔离）；payload 脱敏；重试仅当关联真实 sync_tasks，走 sync router。',
  })),
})
