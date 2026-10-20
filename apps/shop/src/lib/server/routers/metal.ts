import { z } from "zod"
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc"
import {
  listMetalOrders,
  getMetalOrderById,
  createMetalOrder,
  renewMetalOrder,
  toggleAutoRenew,
  getOrderLogs,
} from "@/lib/server/metal-order-data"
import {
  stopOrder,
  cancelOrder,
  recoverOverdueOrder,
} from "@/lib/server/services/metal-order"
import {
  listMetalDevices,
  getMetalDeviceById as getMetalDeviceFromDb,
} from "@/lib/server/dataaccess/metal-market"
import { assertOrganizationVerified } from "@/lib/server/identity/assert-verified"

export const metalRouter = createTRPCRouter({
  /**
   * List available bare metal devices for marketplace browsing (public)
   */
  deviceList: publicProcedure.query(async () => {
    return listMetalDevices()
  }),

  /**
   * Get single bare metal device by DB ID (public)
   */
  deviceGetById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return getMetalDeviceFromDb(input.id)
    }),
  /**
   * List bare metal orders for current tenant
   */
  orderList: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        status: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      return listMetalOrders({
        page: input.page,
        pageSize: input.pageSize,
        status: input.status,
      })
    }),

  /**
   * Get single bare metal order by ID
   */
  orderGetById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return getMetalOrderById(input.id)
    }),

  /**
   * Create a new bare metal order (full purchase flow)
   */
  orderCreate: protectedProcedure
    .input(
      z.object({
        dataCenterId: z.string().min(1),
        gpuCardTypeId: z.string().min(1),
        workspaceId: z.string().optional(),
        description: z.string().max(255).optional(),
        billingUnit: z.string().default("hour"),
        deviceCount: z.number().int().min(1).default(1),
        gpuCount: z.number().int().min(1),
        unitPricePerCardHour: z.number().positive(),
        durationHours: z.number().int().min(1),
        couponId: z.string().optional(),
        autoRenew: z.boolean().default(false),
        sshEnabled: z.boolean().default(false),
        sshPublicKey: z.string().optional(),
        envTemplateId: z.string().optional(),
        ports: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOrganizationVerified(ctx.organizationId)
      return createMetalOrder(input)
    }),

  /**
   * Renew a bare metal order
   */
  orderRenew: protectedProcedure
    .input(
      z.object({
        orderId: z.string().min(1),
        months: z.number().int().min(1).max(36),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOrganizationVerified(ctx.organizationId)
      return renewMetalOrder(input)
    }),

  /**
   * Toggle auto-renew for an order
   */
  orderToggleAutoRenew: protectedProcedure
    .input(
      z.object({
        orderId: z.string().min(1),
        autoRenew: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      return toggleAutoRenew(input.orderId, input.autoRenew)
    }),

  /**
   * Get order audit log
   */
  orderLogs: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ input }) => {
      return getOrderLogs(input.orderId)
    }),

  /**
   * Stop a running bare metal order
   */
  orderStop: protectedProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await assertOrganizationVerified(ctx.organizationId)
      return stopOrder(input.orderId, ctx.organizationId)
    }),

  /**
   * Cancel a bare metal order (pending/stopped/reserved)
   */
  orderCancel: protectedProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await assertOrganizationVerified(ctx.organizationId)
      return cancelOrder(input.orderId, ctx.organizationId)
    }),

  /**
   * Recover an overdue order after topping up balance
   */
  orderRecoverOverdue: protectedProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await assertOrganizationVerified(ctx.organizationId)
      return recoverOverdueOrder(input.orderId, ctx.organizationId)
    }),
})
