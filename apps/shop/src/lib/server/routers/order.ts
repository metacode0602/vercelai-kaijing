import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as orderDa from '@/lib/server/dataaccess/order'
import {
  UI_ORDER_STATUSES,
  UI_OUTBOUND_STATUSES,
  UI_OUTBOUND_TYPES,
} from '@/lib/server/mappers/order'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  status: z.string().optional(),
  shopId: z.string().optional(),
  platform: z.string().optional(),
})

const syncLineInput = z.object({
  externalLineId: z.string().optional(),
  sellerSku: z.string().min(1),
  shopSku: z.string().optional(),
  sku: z.string().optional(),
  title: z.string().optional(),
  qty: z.number().int().positive(),
  unitPrice: z.number().optional(),
  paidPrice: z.number().optional(),
  platformStatus: z.string().optional(),
  warehouseCode: z.string().optional(),
  binCode: z.string().optional(),
})

const syncOrderInput = z.object({
  externalOrderId: z.string().min(1),
  orderNumber: z.string().optional(),
  shopId: z.string().optional(),
  externalShopId: z.string().optional(),
  platform: z.string().optional(),
  status: z.string().optional(),
  platformStatus: z.string().optional(),
  fulfillmentStatus: z.string().optional(),
  currency: z.string().optional(),
  totalAmount: z.number().optional(),
  shippingFee: z.number().optional(),
  voucherAmount: z.number().optional(),
  buyerRegion: z.string().optional(),
  paymentMethod: z.string().optional(),
  buyerNote: z.string().optional(),
  placedAt: z.string().optional(),
  paidAt: z.string().optional(),
  platformUpdatedAt: z.string().optional(),
  warehouseCode: z.string().optional(),
  lines: z.array(syncLineInput).min(1),
  autoReserve: z.boolean().optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    const notFound = /不存在/.test(message)
    throw new TRPCError({ code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const orderRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return orderDa.listOrders(ctx.db, ctx.organizationId, input)
  }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    return orderDa.orderStats(ctx.db, ctx.organizationId)
  }),

  get: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await orderDa.getOrder(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到订单 ${input.id}` })
      return row
    }),

  /** 人工触发增量同步：apps/api 真实 OpenAPI → DB upsert + 映射确认后占库。 */
  syncIncremental: tenantProcedure
    .input(
      z
        .object({
          shopId: z.string().optional(),
          limit: z.number().int().min(1).max(50).optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => orderDa.syncOrdersIncremental(ctx.db, ctx.organizationId, input ?? {})),
    ),

  importOrders: tenantProcedure
    .input(z.object({ orders: z.array(syncOrderInput).min(1).max(50) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => orderDa.importOrders(ctx.db, ctx.organizationId, input.orders)),
    ),

  upsert: tenantProcedure.input(syncOrderInput).mutation(async ({ ctx, input }) =>
    wrap(() => orderDa.upsertOrderFromSync(ctx.db, ctx.organizationId, input)),
  ),

  confirmReserve: tenantProcedure
    .input(z.object({ id: z.string().min(1), operator: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        orderDa.confirmReserveOrder(ctx.db, ctx.organizationId, input.id, input.operator),
      ),
    ),

  releaseReserve: tenantProcedure
    .input(z.object({ id: z.string().min(1), operator: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        orderDa.releaseOrderReservations(
          ctx.db,
          ctx.organizationId,
          input.id,
          input.operator,
        ),
      ),
    ),

  createOutbound: tenantProcedure
    .input(
      z.object({
        orderId: z.string().min(1),
        picker: z.string().optional(),
        remark: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        orderDa.createOutboundFromOrder(ctx.db, ctx.organizationId, input.orderId, {
          picker: input.picker,
          remark: input.remark,
        }),
      ),
    ),

  listOutbounds: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return orderDa.listOutbounds(ctx.db, ctx.organizationId, input)
  }),

  outboundStats: tenantProcedure.query(async ({ ctx }) => {
    return orderDa.outboundStats(ctx.db, ctx.organizationId)
  }),

  getOutbound: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await orderDa.getOutbound(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到出库单 ${input.id}` })
      return row
    }),

  advanceOutbound: tenantProcedure
    .input(z.object({ id: z.string().min(1), operator: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        orderDa.advanceOutbound(ctx.db, ctx.organizationId, input.id, input.operator),
      ),
    ),

  postOutbound: tenantProcedure
    .input(z.object({ id: z.string().min(1), operator: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => orderDa.postOutbound(ctx.db, ctx.organizationId, input.id, input.operator)),
    ),

  cancelOutbound: tenantProcedure
    .input(z.object({ id: z.string().min(1), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        orderDa.cancelOutbound(ctx.db, ctx.organizationId, input.id, input.reason),
      ),
    ),

  meta: tenantProcedure.query(() => ({
    orderStatuses: UI_ORDER_STATUSES,
    outboundStatuses: UI_OUTBOUND_STATUSES,
    outboundTypes: UI_OUTBOUND_TYPES,
    reserveMode: process.env.ORDER_RESERVE_MODE || 'auto_on_paid',
    deductNode: process.env.ORDER_DEDUCT_NODE || 'outbound_post',
    q07Note:
      'C12 默认：paid/ready_to_ship 自动占库 + 人工补锁；扣减在出库过账。ORDER_RESERVE_MODE=manual_only 可关闭自动锁。',
  })),
})
