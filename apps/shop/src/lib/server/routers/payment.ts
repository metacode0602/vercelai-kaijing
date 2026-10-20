import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, protectedProcedure } from "../trpc"
import { db } from "@/lib/db"
import {
  MerchantRechargeBlockedError,
  createRechargeOrder,
  listPaymentOrders,
  getPaymentOrderById,
} from "@workspace/billing"
import { bankAccount, recharge } from "@workspace/db"
import { eq, desc, sql } from "drizzle-orm"
import { assertOrganizationVerified } from "@/lib/server/identity/assert-verified"

export const paymentRouter = createTRPCRouter({
  /**
   * Create a recharge payment order (WeChat / Alipay).
   * Returns the order so the client can display a QR code or redirect.
   */
  createRechargeOrder: protectedProcedure
    .input(
      z.object({
        amount: z.number().positive("充值金额必须大于 0"),
        paymentMethod: z.enum(["wechat", "alipay"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOrganizationVerified(ctx.organizationId)

      // 商户准入（DEC-F4）。断言放在 billing 的 createRechargeOrder 里是唯一收口，
      // 这里只需把领域错误翻成用户能看懂的提示 —— 区分「商户额度见底」与
      // 「你自己账户问题」，否则用户只会反复重试。
      const expiredAt = new Date()
      expiredAt.setMinutes(expiredAt.getMinutes() + 30)

      let order: Awaited<ReturnType<typeof createRechargeOrder>>["order"]
      try {
        ;({ order } = await createRechargeOrder(db, {
          tenantId: ctx.organizationId,
          scene: "recharge",
          amount: input.amount,
          paymentMethod: input.paymentMethod,
          expiredAt,
          createdBy: ctx.user.id,
        }))
      } catch (error) {
        if (error instanceof MerchantRechargeBlockedError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "商户额度不足，暂无法充值，请稍后再试或联系客服",
            cause: {
              reason: "MERCHANT_RECHARGE_BLOCKED",
              merchantId: error.merchantId,
              availableTotal: error.availableTotal,
              threshold: error.threshold,
              thresholdSource: error.thresholdSource,
            },
          })
        }
        throw error
      }

      return {
        orderId: order.id,
        orderNo: order.orderNo,
        amount: Number(order.amount),
        paymentMethod: order.paymentMethod,
        status: order.status,
        expiredAt: order.expiredAt?.toISOString() ?? null,
      }
    }),

  /**
   * List payment orders for the current tenant (paginated).
   * Used by the recharge transactions table.
   */
  listOrders: protectedProcedure
    .input(
      z.object({
        scene: z.string().optional(),
        status: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listPaymentOrders(db, {
        tenantId: ctx.organizationId,
        scene: input.scene,
        status: input.status,
        page: input.page,
        pageSize: input.pageSize,
      })
    }),

  /**
   * Get a single payment order by ID.
   */
  getOrder: protectedProcedure
    .input(z.object({ orderId: z.string().min(1) }))
    .query(async ({ input }) => {
      const order = await getPaymentOrderById(db, input.orderId)
      if (!order) return null
      return {
        ...order,
        amount: Number(order.amount),
        expiredAt: order.expiredAt?.toISOString() ?? null,
        paidAt: order.paidAt?.toISOString() ?? null,
      }
    }),

  /**
   * List active bank accounts for bank transfer.
   */
  listBankAccounts: protectedProcedure.query(async () => {
    const rows = await db
      .select()
      .from(bankAccount)
      .where(eq(bankAccount.isActive, true))
      .orderBy(bankAccount.sortOrder)

    return rows.map((r) => ({
      id: r.id,
      accountName: r.accountName,
      accountNo: r.accountNo,
      bankName: r.bankName,
      bankBranch: r.bankBranch,
      bankCode: r.bankCode,
      remark: r.remark,
    }))
  }),

  /**
   * List recharge records from the CRM recharge table (includes offline/manual recharges).
   */
  listRechargeRecords: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const page = Math.max(1, input.page)
      const pageSize = Math.min(100, Math.max(1, input.pageSize))
      const offset = (page - 1) * pageSize

      const totalRow = await db
        .select({ total: sql<number>`count(*)` })
        .from(recharge)
        .where(eq(recharge.tenantId, ctx.organizationId))

      const total = Number(totalRow[0]?.total ?? 0)

      const rows = await db
        .select()
        .from(recharge)
        .where(eq(recharge.tenantId, ctx.organizationId))
        .orderBy(desc(recharge.createdAt))
        .limit(pageSize)
        .offset(offset)

      return {
        items: rows.map((r) => ({
          id: r.id,
          date: r.createdAt?.toISOString() ?? r.completedAt?.toISOString() ?? "",
          type: "top_up" as const,
          note: r.source === "manual" ? (r.remark ?? "线下充值") : "账户充值",
          paymentMethod: (r.paymentMethod === "bank_transfer" || r.paymentMethod === "wechat" || r.paymentMethod === "alipay" ? r.paymentMethod : "bank_transfer") as "wechat" | "alipay" | "bank_transfer",
          status: (r.status === "paid" ? "completed" : r.status === "pending" ? "pending" : "failed") as "completed" | "pending" | "failed",
          amount: Number(r.amount),
          tax: 0,
          totalAmount: Number(r.amount),
          receipt: r.transactionId ?? null,
          source: r.source,
        })),
        total,
        page,
        pageSize,
      }
    }),
})
