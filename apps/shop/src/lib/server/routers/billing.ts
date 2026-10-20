import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "../trpc"
import { db } from "@/lib/db"
import { getOrCreateTenantBalance } from "@workspace/billing"
import { eq, and, desc, count } from "drizzle-orm"
import { balanceTransaction, gpuCoupon, gpuCouponTemplate, tenantBill } from "@workspace/db"
import { resolveTenantId } from "@/lib/server/services/billing"

export const billingRouter = createTRPCRouter({
  /**
   * Get current balance for the tenant
   */
  balanceGet: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = await resolveTenantId(db, ctx.organizationId)
    const balance = await getOrCreateTenantBalance(
      db,
      tenantId,
      ctx.organizationId,
    )
    return {
      availableBalance: Number(balance.availableBalance),
      reservedBalance: Number(balance.reservedBalance),
      currency: balance.currency,
    }
  }),

  /**
   * Get balance transaction history
   */
  balanceHistory: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const page = Math.max(1, input.page)
      const pageSize = Math.min(100, Math.max(1, input.pageSize))
      const offset = (page - 1) * pageSize

      const tenantId = await resolveTenantId(db, ctx.organizationId)
      const where = eq(balanceTransaction.tenantId, tenantId)

      const [totalRow] = await db
        .select({ total: count() })
        .from(balanceTransaction)
        .where(where)

      const total = Number(totalRow?.total ?? 0)

      const rows = await db
        .select()
        .from(balanceTransaction)
        .where(where)
        .orderBy(desc(balanceTransaction.createdAt))
        .limit(pageSize)
        .offset(offset)

      return { items: rows, total, page, pageSize }
    }),

  /**
   * List available vouchers/coupons for the tenant
   */
  vouchersList: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        id: gpuCoupon.id,
        templateId: gpuCoupon.templateId,
        status: gpuCoupon.status,
        originalValue: gpuCoupon.originalValue,
        remainingValue: gpuCoupon.remainingValue,
        grantedAt: gpuCoupon.grantedAt,
        expiredAt: gpuCoupon.expiredAt,
        templateName: gpuCouponTemplate.name,
        applicableResources: gpuCouponTemplate.applicableResources,
      })
      .from(gpuCoupon)
      .leftJoin(gpuCouponTemplate, eq(gpuCoupon.templateId, gpuCouponTemplate.id))
      .where(eq(gpuCoupon.organizationId, ctx.organizationId))

    return rows.map((r) => ({
      id: r.id,
      name: r.templateName ?? "代金券",
      balance: Number(r.remainingValue ?? 0),
      expiresAt: r.expiredAt?.toISOString() ?? null,
      effectiveDate: r.grantedAt?.toISOString() ?? null,
      total: Number(r.originalValue ?? 0),
      products: r.applicableResources ?? "",
      status: r.status as "available" | "used" | "expired" | "revoked",
    }))
  }),

  /**
   * List monthly bills for the tenant
   */
  monthlyBillsList: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(12),
      }),
    )
    .query(async ({ ctx, input }) => {
      const page = Math.max(1, input.page)
      const pageSize = Math.min(100, Math.max(1, input.pageSize))
      const offset = (page - 1) * pageSize

      const tenantId = await resolveTenantId(db, ctx.organizationId)
      const where = eq(tenantBill.tenantId, tenantId)

      const [totalRow] = await db
        .select({ total: count() })
        .from(tenantBill)
        .where(where)

      const total = Number(totalRow?.total ?? 0)

      const rows = await db
        .select()
        .from(tenantBill)
        .where(where)
        .orderBy(desc(tenantBill.billMonth))
        .limit(pageSize)
        .offset(offset)

      return {
        items: rows.map((r) => ({
          id: r.id,
          periodLabel: r.billMonth,
          totalUsage: Number(r.totalAmount),
          appliedCoupons: Number(r.couponAmount),
          appliedBalance: Number(r.balanceAmount),
          tax: 0,
          totalAmount: Number(r.totalAmount),
          amountDue: Number(r.totalAmount) - Number(r.balanceAmount) - Number(r.couponAmount),
          amountPaid: r.paidAt ? Number(r.totalAmount) : 0,
          status: r.status as "upcoming" | "paid" | "unpaid",
          invoice: null,
        })),
        total,
        page,
        pageSize,
      }
    }),
})
