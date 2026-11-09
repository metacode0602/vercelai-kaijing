import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as syncDa from '@/lib/server/dataaccess/sync'
import * as mappingsDa from '@/lib/server/dataaccess/mappings'
import { UI_SYNC_TASK_STATUSES, UI_SYNC_TASK_TYPES } from '@/lib/server/mappers/sync'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  shopId: z.string().optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    const notFound = /不存在/.test(message)
    throw new TRPCError({ code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const syncRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return syncDa.listSyncTasks(ctx.db, ctx.organizationId, input)
  }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    return syncDa.syncTaskStats(ctx.db, ctx.organizationId)
  }),

  meta: tenantProcedure.query(async ({ ctx }) => {
    const shops = await mappingsDa.listShopsForSelect(ctx.db, ctx.organizationId)
    return {
      types: [...UI_SYNC_TASK_TYPES],
      statuses: [...UI_SYNC_TASK_STATUSES],
      shops,
    }
  }),

  get: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await syncDa.getSyncTask(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到同步任务 ${input.id}` })
      return row
    }),

  enqueue: tenantProcedure
    .input(
      z.object({
        type: z.string().min(1),
        target: z.string().optional(),
        shopId: z.string().optional(),
        actor: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        syncDa.enqueueOrRetrySyncTask(ctx.db, ctx.organizationId, {
          type: input.type,
          target: input.target,
          shopId: input.shopId,
          actor: input.actor,
          note: input.note,
        }),
      ),
    ),

  retry: tenantProcedure
    .input(z.object({ id: z.string().min(1), actor: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => syncDa.retrySyncTask(ctx.db, ctx.organizationId, input.id, input.actor)),
    ),
})
