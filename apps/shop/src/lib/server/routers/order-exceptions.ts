import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as exceptionsDa from '@/lib/server/dataaccess/order-exceptions'
import * as mappingsDa from '@/lib/server/dataaccess/mappings'
import {
  UI_ORDER_EXCEPTION_KINDS,
  UI_ORDER_EXCEPTION_STATUSES,
} from '@/lib/server/mappers/order-exceptions'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  status: z.string().optional(),
  kind: z.string().optional(),
  shopId: z.string().optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    const notFound = /不存在/.test(message)
    throw new TRPCError({ code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const orderExceptionsRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return exceptionsDa.listOrderExceptions(ctx.db, ctx.organizationId, input)
  }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    return exceptionsDa.orderExceptionStats(ctx.db, ctx.organizationId)
  }),

  meta: tenantProcedure.query(async ({ ctx }) => {
    const shops = await mappingsDa.listShopsForSelect(ctx.db, ctx.organizationId)
    return {
      kinds: [...UI_ORDER_EXCEPTION_KINDS],
      statuses: [...UI_ORDER_EXCEPTION_STATUSES],
      shops,
    }
  }),

  get: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await exceptionsDa.getOrderException(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到异常案件 ${input.id}` })
      return row
    }),

  scan: tenantProcedure.mutation(async ({ ctx }) =>
    wrap(() => exceptionsDa.scanOrderExceptions(ctx.db, ctx.organizationId)),
  ),

  /** 与 scan 同义：Dashboard 今日预警 / 运维同步入口 */
  sync: tenantProcedure.mutation(async ({ ctx }) =>
    wrap(() => exceptionsDa.scanOrderExceptions(ctx.db, ctx.organizationId)),
  ),

  start: tenantProcedure
    .input(z.object({ id: z.string().min(1), actor: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        exceptionsDa.startException(ctx.db, ctx.organizationId, input.id, input.actor),
      ),
    ),

  resolve: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        resolution: z.string().optional(),
        actor: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        exceptionsDa.resolveException(
          ctx.db,
          ctx.organizationId,
          input.id,
          input.resolution ?? '',
          input.actor,
        ),
      ),
    ),

  ignore: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        reason: z.string().optional(),
        actor: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        exceptionsDa.ignoreException(
          ctx.db,
          ctx.organizationId,
          input.id,
          input.reason ?? '',
          input.actor,
        ),
      ),
    ),
})
