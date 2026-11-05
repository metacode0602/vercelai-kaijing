import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { createTRPCRouter, tenantProcedure } from '@/lib/server/trpc'
import * as purchaseDa from '@/lib/server/dataaccess/purchase'
import {
  UI_PURCHASE_ORDER_STATUSES,
  UI_PURCHASE_RECEIPT_STATUSES,
  UI_PURCHASE_REQUEST_STATUSES,
  UI_STOCK_INBOUND_STATUSES,
} from '@/lib/server/mappers/purchase'

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

export const purchaseRouter = createTRPCRouter({
  listRequests: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return purchaseDa.listPurchaseRequests(ctx.db, ctx.organizationId, input)
  }),

  requestStats: tenantProcedure.query(async ({ ctx }) => {
    return purchaseDa.purchaseRequestStats(ctx.db, ctx.organizationId)
  }),

  getRequest: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await purchaseDa.getPurchaseRequest(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到采购申请 ${input.id}` })
      return row
    }),

  createRequest: tenantProcedure
    .input(
      z.object({
        reason: z.string().min(1),
        supplier: z.string().min(1),
        warehouse: z.string().min(1),
        currency: z.string().min(1),
        expectedAt: z.string().min(1),
        remark: z.string().optional(),
        applicant: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        purchaseDa.createPurchaseRequestHeader(ctx.db, ctx.organizationId, input, ctx.user?.id),
      ),
    ),

  updateRequest: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        reason: z.string().optional(),
        supplier: z.string().optional(),
        warehouse: z.string().optional(),
        currency: z.string().optional(),
        expectedAt: z.string().optional(),
        remark: z.string().optional(),
        applicant: z.string().optional(),
        approver: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input
      return wrap(() => purchaseDa.updatePurchaseRequestHeader(ctx.db, ctx.organizationId, id, patch))
    }),

  addRequestLine: tenantProcedure
    .input(
      z.object({
        requestId: z.string().min(1),
        sku: z.string().min(1),
        supplierSku: z.string().optional(),
        qty: z.number(),
        unitPrice: z.number(),
        remark: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { requestId, ...line } = input
      return wrap(() => purchaseDa.addPurchaseRequestLine(ctx.db, ctx.organizationId, requestId, line))
    }),

  submitRequest: tenantProcedure
    .input(z.object({ id: z.string().min(1), approver: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        purchaseDa.submitPurchaseRequest(ctx.db, ctx.organizationId, input.id, input.approver),
      ),
    ),

  withdrawRequest: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => purchaseDa.withdrawPurchaseRequest(ctx.db, ctx.organizationId, input.id)),
    ),

  cancelRequest: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => purchaseDa.cancelPurchaseRequest(ctx.db, ctx.organizationId, input.id)),
    ),

  approveAndConvert: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        opinion: z.string().optional(),
        approver: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        purchaseDa.approveAndConvertPurchaseRequest(ctx.db, ctx.organizationId, input.id, {
          opinion: input.opinion,
          approver: input.approver,
        }),
      ),
    ),

  rejectRequest: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        opinion: z.string().min(1),
        approver: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        purchaseDa.rejectPurchaseRequest(ctx.db, ctx.organizationId, input.id, {
          opinion: input.opinion,
          approver: input.approver,
        }),
      ),
    ),

  listOrders: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return purchaseDa.listPurchaseOrders(ctx.db, ctx.organizationId, input)
  }),

  getOrder: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await purchaseDa.getPurchaseOrder(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到采购单 ${input.id}` })
      return row
    }),

  listReceipts: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return purchaseDa.listPurchaseReceipts(ctx.db, ctx.organizationId, input)
  }),

  getReceipt: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await purchaseDa.getPurchaseReceipt(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到收货单 ${input.id}` })
      return row
    }),

  registerReceipt: tenantProcedure
    .input(
      z.object({
        purchaseOrderId: z.string().min(1),
        receivedBy: z.string().optional(),
        deliveryNote: z.string().optional(),
        remark: z.string().optional(),
        lines: z
          .array(
            z.object({
              poLineId: z.string().min(1),
              sku: z.string().min(1),
              qtyArrived: z.number(),
              note: z.string().optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => purchaseDa.registerPurchaseReceipt(ctx.db, ctx.organizationId, input)),
    ),

  submitQc: tenantProcedure
    .input(
      z.object({
        receiptId: z.string().min(1),
        inspector: z.string().optional(),
        lines: z
          .array(
            z.object({
              lineId: z.string().min(1),
              qtyPassed: z.number(),
              qtyFailed: z.number(),
              suggestedBin: z.string().optional(),
              note: z.string().optional(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      wrap(() => purchaseDa.submitPurchaseReceiptQc(ctx.db, ctx.organizationId, input)),
    ),

  cancelReceipt: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      wrap(() => purchaseDa.cancelPurchaseReceipt(ctx.db, ctx.organizationId, input.id)),
    ),

  listInbounds: tenantProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    return purchaseDa.listStockInbounds(ctx.db, ctx.organizationId, input)
  }),

  getInbound: tenantProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const row = await purchaseDa.getStockInbound(ctx.db, ctx.organizationId, input.id)
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: `未找到入库单 ${input.id}` })
      return row
    }),

  updateInbound: tenantProcedure
    .input(
      z.object({
        id: z.string().min(1),
        bin: z.string().optional(),
        operator: z.string().optional(),
        remark: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input
      return wrap(() => purchaseDa.updateStockInboundDraft(ctx.db, ctx.organizationId, id, patch))
    }),

  confirmShelve: tenantProcedure
    .input(z.object({ id: z.string().min(1), operator: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        purchaseDa.confirmStockInboundShelve(ctx.db, ctx.organizationId, input.id, input.operator),
      ),
    ),

  cancelInbound: tenantProcedure
    .input(z.object({ id: z.string().min(1), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      wrap(() =>
        purchaseDa.cancelStockInbound(ctx.db, ctx.organizationId, input.id, input.reason),
      ),
    ),

  listSkuCodes: tenantProcedure.query(async ({ ctx }) => {
    return purchaseDa.listSkuCodesForPurchase(ctx.db, ctx.organizationId)
  }),

  meta: tenantProcedure.query(() => ({
    requestStatuses: UI_PURCHASE_REQUEST_STATUSES,
    orderStatuses: UI_PURCHASE_ORDER_STATUSES,
    receiptStatuses: UI_PURCHASE_RECEIPT_STATUSES,
    inboundStatuses: UI_STOCK_INBOUND_STATUSES,
  })),
})
