import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as wmsDa from '@/lib/server/dataaccess/wms'
import * as inventoryPoolsDa from '@/lib/server/dataaccess/inventory-pools'

const paginationInput = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
})

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    const notFound = /不存在/.test(message)
    throw new TRPCError({ code: notFound ? 'NOT_FOUND' : 'BAD_REQUEST', message })
  })
}

export const wmsRouter = createTRPCRouter({
  meta: tenantProcedure.query(() => wmsDa.wmsMeta()),

  // ---- warehouses / bins ----
  listWarehouses: tenantProcedure
    .input(paginationInput.extend({ status: z.string().optional() }))
    .query(async ({ ctx, input }) => wmsDa.listWarehouses(ctx.db, ctx.organizationId, input)),

  warehouseStats: tenantProcedure.query(async ({ ctx }) =>
    wmsDa.warehouseStats(ctx.db, ctx.organizationId),
  ),

  getWarehouse: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await wmsDa.getWarehouse(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到仓库 ${input.id}` })
      return row
    }),

  createWarehouse: tenantProcedure
    .input(
      z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        type: z.string().optional(),
        country: z.string().optional(),
        timezone: z.string().optional(),
        currency: z.string().optional(),
        address: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => wmsDa.createWarehouse(ctx.db, ctx.organizationId, input)),
    ),

  updateWarehouse: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().optional(),
        type: z.string().optional(),
        country: z.string().optional(),
        timezone: z.string().optional(),
        currency: z.string().optional(),
        address: z.string().optional(),
        note: z.string().optional(),
        status: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input
      return wrap(() => wmsDa.updateWarehouse(ctx.db, ctx.organizationId, id, patch))
    }),

  listBins: tenantProcedure
    .input(
      paginationInput.extend({
        warehouse: z.string().optional(),
        status: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => wmsDa.listBins(ctx.db, ctx.organizationId, input)),

  createBin: tenantProcedure
    .input(
      z.object({
        warehouseCode: z.string().min(1),
        code: z.string().min(1),
        zoneCode: z.string().optional(),
        name: z.string().optional(),
        boundSku: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => wmsDa.createBin(ctx.db, ctx.organizationId, input, ctx.user?.id)),
    ),

  updateBin: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        zoneCode: z.string().optional(),
        name: z.string().optional(),
        boundSku: z.string().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input
      return wrap(() => wmsDa.updateBin(ctx.db, ctx.organizationId, id, patch, ctx.user?.id))
    }),

  listBinBindings: tenantProcedure
    .input(
      paginationInput.extend({
        binId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) =>
      wmsDa.listBinBindings(ctx.db, ctx.organizationId, input),
    ),

  // ---- zones (commerce_warehouse_zones) ----
  listZones: tenantProcedure
    .input(
      paginationInput.extend({
        warehouse: z.string().optional(),
        status: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => wmsDa.listZones(ctx.db, ctx.organizationId, input)),

  zoneStats: tenantProcedure.query(async ({ ctx }) => wmsDa.zoneStats(ctx.db, ctx.organizationId)),

  getZone: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await wmsDa.getZone(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到库区 ${input.id}` })
      return row
    }),

  createZone: tenantProcedure
    .input(
      z.object({
        warehouseCode: z.string().min(1),
        code: z.string().min(1),
        name: z.string().optional(),
        purpose: z.string().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => wrap(() => wmsDa.createZone(ctx.db, ctx.organizationId, input))),

  updateZone: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().optional(),
        purpose: z.string().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input
      return wrap(() => wmsDa.updateZone(ctx.db, ctx.organizationId, id, patch))
    }),

  // ---- inventory pools ----
  listInventoryPools: tenantProcedure
    .input(paginationInput.extend({ status: z.string().optional() }))
    .query(async ({ ctx, input }) =>
      inventoryPoolsDa.listInventoryPools(ctx.db, ctx.organizationId, input),
    ),

  getInventoryPool: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await inventoryPoolsDa.getInventoryPool(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到库存池 ${input.id}` })
      return row
    }),

  createInventoryPool: tenantProcedure
    .input(
      z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        warehouseId: z.string().min(1),
        status: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        inventoryPoolsDa.createInventoryPool(ctx.db, ctx.organizationId, input),
      ),
    ),

  updateInventoryPool: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().optional(),
        warehouseId: z.string().optional(),
        status: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input
      return wrap(() =>
        inventoryPoolsDa.updateInventoryPool(ctx.db, ctx.organizationId, id, patch),
      )
    }),

  assignShopInventoryPool: tenantProcedure
    .input(
      z.object({
        shopId: z.string().min(1),
        poolId: z.string().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        inventoryPoolsDa.assignShopInventoryPool(
          ctx.db,
          ctx.organizationId,
          input.shopId,
          input.poolId,
        ),
      ),
    ),

  // ---- balances / ledger ----
  listBalances: tenantProcedure
    .input(
      paginationInput.extend({
        warehouse: z.string().optional(),
        sku: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => wmsDa.listBalances(ctx.db, ctx.organizationId, input)),

  balanceStats: tenantProcedure.query(async ({ ctx }) =>
    wmsDa.balanceStats(ctx.db, ctx.organizationId),
  ),

  getBalance: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await wmsDa.getBalance(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到余额 ${input.id}` })
      return row
    }),

  listMovements: tenantProcedure
    .input(
      paginationInput.extend({
        warehouse: z.string().optional(),
        sku: z.string().optional(),
        movementType: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => wmsDa.listMovements(ctx.db, ctx.organizationId, input)),

  movementStats: tenantProcedure.query(async ({ ctx }) =>
    wmsDa.movementStats(ctx.db, ctx.organizationId),
  ),

  getMovement: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await wmsDa.getMovement(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到流水 ${input.id}` })
      return row
    }),

  // ---- non-order outbound ----
  listOutbounds: tenantProcedure
    .input(
      paginationInput.extend({
        status: z.string().optional(),
        outboundType: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => wmsDa.listWmsOutbounds(ctx.db, ctx.organizationId, input)),

  outboundStats: tenantProcedure.query(async ({ ctx }) =>
    wmsDa.wmsOutboundStats(ctx.db, ctx.organizationId),
  ),

  getOutbound: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await wmsDa.getWmsOutbound(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到出库单 ${input.id}` })
      return row
    }),

  createOutbound: tenantProcedure
    .input(
      z.object({
        outboundType: z.string().min(1),
        warehouse: z.string().min(1),
        reason: z.string().optional(),
        remark: z.string().optional(),
        picker: z.string().optional(),
        lines: z
          .array(
            z.object({
              sku: z.string().min(1),
              quantity: z.number(),
              bin: z.string().min(1),
              note: z.string().optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => wmsDa.createWmsOutbound(ctx.db, ctx.organizationId, input)),
    ),

  advanceOutbound: tenantProcedure
    .input(z.object({ id: z.string().min(1), operator: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => wmsDa.advanceWmsOutbound(ctx.db, ctx.organizationId, input.id, input.operator)),
    ),

  postOutbound: tenantProcedure
    .input(z.object({ id: z.string().min(1), operator: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => wmsDa.postWmsOutbound(ctx.db, ctx.organizationId, input.id, input.operator)),
    ),

  cancelOutbound: tenantProcedure
    .input(z.object({ id: z.string().min(1), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => wmsDa.cancelWmsOutbound(ctx.db, ctx.organizationId, input.id, input.reason)),
    ),

  // ---- adjustments ----
  listAdjustments: tenantProcedure
    .input(
      paginationInput.extend({
        status: z.string().optional(),
        kind: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => wmsDa.listAdjustments(ctx.db, ctx.organizationId, input)),

  adjustmentStats: tenantProcedure.query(async ({ ctx }) =>
    wmsDa.adjustmentStats(ctx.db, ctx.organizationId),
  ),

  getAdjustment: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await wmsDa.getAdjustment(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到调整单 ${input.id}` })
      return row
    }),

  createAdjustment: tenantProcedure
    .input(
      z.object({
        kind: z.string().min(1),
        warehouse: z.string().min(1),
        reason: z.string().min(1),
        applicant: z.string().optional(),
        remark: z.string().optional(),
        lines: z
          .array(
            z.object({
              sku: z.string().min(1),
              bin: z.string().min(1),
              qtySystem: z.number(),
              qtyCounted: z.number(),
              note: z.string().optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => wmsDa.createAdjustment(ctx.db, ctx.organizationId, input)),
    ),

  approveAdjustment: tenantProcedure
    .input(z.object({ id: z.string().min(1), approver: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => wmsDa.approveAdjustment(ctx.db, ctx.organizationId, input.id, input.approver)),
    ),

  rejectAdjustment: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        rejectReason: z.string().min(1),
        approver: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        wmsDa.rejectAdjustment(
          ctx.db,
          ctx.organizationId,
          input.id,
          input.rejectReason,
          input.approver,
        ),
      ),
    ),

  postAdjustment: tenantProcedure
    .input(z.object({ id: z.string().min(1), operator: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => wmsDa.postAdjustment(ctx.db, ctx.organizationId, input.id, input.operator)),
    ),


  listInventoryAlerts: tenantProcedure
    .input(paginationInput.extend({ alert: z.string().optional() }))
    .query(async ({ ctx, input }) => wmsDa.listInventoryAlerts(ctx.db, ctx.organizationId, input)),

  getInventoryAlertBySku: tenantProcedure
    .input(z.object({ sku: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await wmsDa.getInventoryAlertBySku(ctx.db, ctx.organizationId, input.sku)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到库存预警 ${input.sku}` })
      return row
    }),
})
