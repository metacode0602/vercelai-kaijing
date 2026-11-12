import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as oceanDa from '@/lib/server/dataaccess/ocean'
import { UI_OCEAN_STATUSES } from '@/lib/server/mappers/ocean'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  status: z.string().optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    const notFound = /不存在/.test(message)
    throw new TRPCError({ code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const oceanRouter = createTRPCRouter({
  list: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return oceanDa.listOceanShipments(ctx.db, ctx.organizationId, input)
  }),

  stats: tenantProcedure.query(async ({ ctx }) => {
    return oceanDa.oceanStats(ctx.db, ctx.organizationId)
  }),

  meta: tenantProcedure.query(() => oceanDa.oceanMeta()),

  get: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await oceanDa.getOceanShipment(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到柜次 ${input.id}` })
      return row
    }),

  create: tenantProcedure
    .input(
      z.object({
        lotCode: z.string().optional(),
        containerNo: z.string().optional(),
        containerType: z.string().optional(),
        freightMode: z.string().optional(),
        carrierId: z.string().nullable().optional(),
        platform: z.string().optional(),
        originPort: z.string().optional(),
        destPort: z.string().optional(),
        warehouse: z.string().optional(),
        etd: z.string().optional(),
        etaPort: z.string().optional(),
        etaWarehouse: z.string().optional(),
        notes: z.string().optional(),
        packingDetails: z.record(z.string(), z.unknown()).optional(),
        lines: z
          .array(z.object({ sku: z.string().min(1), qtyShipped: z.number() }))
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => oceanDa.createOceanShipment(ctx.db, ctx.organizationId, input)),
    ),

  update: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        containerNo: z.string().optional(),
        containerType: z.string().optional(),
        freightMode: z.string().optional(),
        carrierId: z.string().nullable().optional(),
        platform: z.string().optional(),
        originPort: z.string().optional(),
        destPort: z.string().optional(),
        warehouse: z.string().optional(),
        etd: z.string().optional(),
        etaPort: z.string().optional(),
        etaWarehouse: z.string().optional(),
        notes: z.string().optional(),
        packingDetails: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input
      return wrap(() => oceanDa.updateOceanShipment(ctx.db, ctx.organizationId, id, patch))
    }),

  upsertLine: tenantProcedure
    .input(
      z.object({
        shipmentId: z.string().min(1),
        sku: z.string().min(1),
        qtyShipped: z.number(),
        qtyReceived: z.number().optional(),
        qtyDamaged: z.number().optional(),
        cartonCount: z.number().int().nullable().optional(),
        cbm: z.number().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { shipmentId, ...line } = input
      return wrap(() => oceanDa.upsertOceanLine(ctx.db, ctx.organizationId, shipmentId, line))
    }),

  removeLine: tenantProcedure
    .input(z.object({ shipmentId: z.string().min(1), lineId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => oceanDa.removeOceanLine(ctx.db, ctx.organizationId, input.shipmentId, input.lineId)),
    ),

  upsertBox: tenantProcedure
    .input(
      z.object({
        shipmentId: z.string().min(1),
        id: z.string().optional(),
        boxNo: z.string().min(1),
        cartonSpecCode: z.string().optional(),
        leadRef: z.string().optional(),
        cbm: z.number().nullable().optional(),
        weightKg: z.number().nullable().optional(),
        sealNo: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { shipmentId, ...box } = input
      return wrap(() => oceanDa.upsertOceanBox(ctx.db, ctx.organizationId, shipmentId, box))
    }),

  removeBox: tenantProcedure
    .input(z.object({ shipmentId: z.string().min(1), boxId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => oceanDa.removeOceanBox(ctx.db, ctx.organizationId, input.shipmentId, input.boxId)),
    ),

  advance: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        toStatus: z.string().optional(),
        operator: z.string().optional(),
        lineReceipts: z
          .array(
            z.object({
              lineId: z.string().optional(),
              sku: z.string().optional(),
              qtyReceived: z.number(),
              qtyDamaged: z.number().optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        oceanDa.advanceOceanShipment(ctx.db, ctx.organizationId, input.id, {
          toStatus: input.toStatus,
          operator: input.operator ?? ctx.user?.id,
          lineReceipts: input.lineReceipts,
        }),
      ),
    ),

  cancel: tenantProcedure
    .input(z.object({ id: z.string().min(1), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => oceanDa.cancelOceanShipment(ctx.db, ctx.organizationId, input.id, input.reason)),
    ),

  saveCost: tenantProcedure
    .input(
      z.object({
        shipmentId: z.string().min(1),
        sku: z.string().min(1),
        kind: z.string().optional(),
        amount: z.number(),
        currency: z.string().optional(),
        landedUnitCost: z.number().optional(),
        feeTemplateVersionId: z.string().nullable().optional(),
        taxTemplateCode: z.string().nullable().optional(),
        taxBreakdown: z.record(z.string(), z.unknown()).optional(),
        calculatorSnapshot: z.record(z.string(), z.unknown()).optional(),
        note: z.string().optional(),
        fxRateId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => oceanDa.saveOceanLotCost(ctx.db, ctx.organizationId, input)),
    ),

  inventoryBuckets: tenantProcedure
    .input(z.object({ warehouse: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return oceanDa.listOceanInventoryBuckets(ctx.db, ctx.organizationId, input?.warehouse)
    }),

  uiStatuses: tenantProcedure.query(() => [...UI_OCEAN_STATUSES]),
})
