import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as logisticsDa from '@/lib/server/dataaccess/logistics'
import {
  SHIPMENT_PROVIDER_OPTIONS,
  TRACKING_EVENT_TYPES,
  UI_BATCH_STATUSES,
  UI_PROVIDER_TYPES,
  UI_SHIPMENT_STATUSES,
  UI_TRACKING_SOURCES,
} from '@/lib/server/mappers/logistics'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  status: z.string().optional(),
  shopId: z.string().optional(),
  providerType: z.string().optional(),
  platform: z.string().optional(),
  channel: z.string().optional(),
  site: z.string().optional(),
})

const trackingSourceSchema = z.enum(['api', 'manual', 'import'])

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    const notFound = /不存在/.test(message)
    throw new TRPCError({ code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const logisticsRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return logisticsDa.listShipments(ctx.db, ctx.organizationId, input)
  }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    return logisticsDa.shipmentStats(ctx.db, ctx.organizationId)
  }),

  get: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await logisticsDa.getShipment(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到包裹 ${input.id}` })
      return row
    }),

  createFromOrder: tenantProcedure
    .input(
      z.object({
        orderId: z.string().min(1),
        externalPackageId: z.string().optional(),
        trackingNumber: z.string().optional(),
        providerType: z.string().optional(),
        providerCode: z.string().optional(),
        providerName: z.string().optional(),
        warehouseCode: z.string().optional(),
        orderLineIds: z.array(z.string()).optional(),
        weight: z.string().optional(),
        picker: z.string().optional(),
        remark: z.string().optional(),
        itemsHint: z.number().int().optional(),
        skusHint: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => logisticsDa.createShipmentFromOrder(ctx.db, ctx.organizationId, input)),
    ),

  updateStatus: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        status: z.string().min(1),
        trackingNumber: z.string().optional(),
        platformStatus: z.string().optional(),
        providerCode: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        logisticsDa.updateShipmentStatus(ctx.db, ctx.organizationId, input.id, input.status, {
          trackingNumber: input.trackingNumber,
          platformStatus: input.platformStatus,
          providerCode: input.providerCode,
        }),
      ),
    ),

  appendTracking: tenantProcedure
    .input(
      z.object({
        shipmentId: z.string().min(1),
        statusCode: z.string().min(1),
        title: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        eventTime: z.string().optional(),
        source: trackingSourceSchema,
        advanceStatus: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => logisticsDa.appendTrackingEvent(ctx.db, ctx.organizationId, input)),
    ),

  /** 人工触发物流轨迹同步（apps/api → 平台 OpenAPI） */
  syncFromPlatform: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => logisticsDa.syncShipmentFromPlatformStub(ctx.db, ctx.organizationId, input.id)),
    ),

  /** JSB 等无 API 场景：批量导入轨迹 source=import */
  importTracking: tenantProcedure
    .input(
      z.object({
        shipmentId: z.string().min(1),
        events: z
          .array(
            z.object({
              statusCode: z.string().min(1),
              title: z.string().optional(),
              description: z.string().optional(),
              location: z.string().optional(),
              eventTime: z.string().optional(),
            }),
          )
          .min(1)
          .max(100),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => logisticsDa.importTrackingEvents(ctx.db, ctx.organizationId, input)),
    ),

  listBatches: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return logisticsDa.listBatches(ctx.db, ctx.organizationId, input)
  }),

  getBatch: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await logisticsDa.getBatch(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到批次 ${input.id}` })
      return row
    }),

  createBatch: tenantProcedure
    .input(
      z.object({
        batchNo: z.string().optional(),
        channel: z.string().min(1),
        site: z.string().optional(),
        country: z.string().optional(),
        warehouseCode: z.string().optional(),
        carrier: z.string().optional(),
        trackingSummary: z.string().optional(),
        shipmentIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => logisticsDa.createBatch(ctx.db, ctx.organizationId, input)),
    ),

  addPackageToBatch: tenantProcedure
    .input(z.object({ batchId: z.string().min(1), shipmentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        logisticsDa.addShipmentToBatch(
          ctx.db,
          ctx.organizationId,
          input.batchId,
          input.shipmentId,
        ),
      ),
    ),

  submitBatch: tenantProcedure
    .input(z.object({ id: z.string().min(1), operator: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => logisticsDa.submitBatch(ctx.db, ctx.organizationId, input.id, input.operator)),
    ),

  closeBatch: tenantProcedure
    .input(z.object({ id: z.string().min(1), operator: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => logisticsDa.closeBatch(ctx.db, ctx.organizationId, input.id, input.operator)),
    ),

  appendBatchEvent: tenantProcedure
    .input(
      z.object({
        batchId: z.string().min(1),
        event: z.string().min(1),
        eventAt: z.string().optional(),
        operator: z.string().optional(),
        tracking: z.string().optional(),
        carrier: z.string().optional(),
        exception: z.string().optional(),
        status: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => logisticsDa.appendBatchEvent(ctx.db, ctx.organizationId, input)),
    ),

  meta: tenantProcedure.query(() => ({
    shipmentStatuses: UI_SHIPMENT_STATUSES,
    providerTypes: UI_PROVIDER_TYPES,
    providerOptions: SHIPMENT_PROVIDER_OPTIONS,
    trackingEventTypes: TRACKING_EVENT_TYPES,
    trackingSources: UI_TRACKING_SOURCES,
    batchStatuses: UI_BATCH_STATUSES,
    note: '轨迹同步经 apps/api；包裹/交接批次写入 PostgreSQL。LGS 提交交运经 apps/api → 平台 OpenAPI；JSB 无 API 走人工/import。平台回复/刊登写入本轮不做。',
  })),
})
