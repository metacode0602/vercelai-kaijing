/**
 * Server-side billing data loader for the billing page.
 * Replaces the mock data in lib/billing-data.ts with real DB queries.
 */

import { eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { getSession } from "@/lib/server/auth-utils"
import {
  tenantBalance,
  gpuCoupon,
  gpuCouponTemplate,
  tenantBill,
} from "@workspace/db"

async function getTenantId(): Promise<string | null> {
  try {
    const session = await getSession()
    return session?.session?.activeOrganizationId ?? null
  } catch {
    return null
  }
}

export async function getBillingPageData(): Promise<{
  balance: number
  vouchers: Array<{
    id: string
    name: string
    balance: number
    expiresAt: string | null
  }>
  coupons: Array<{
    id: string
    name: string
    effectiveDate: string | null
    expiryDate: string | null
    balance: number
    total: number
    products: string
    status: string
  }>
  monthlyBills: Array<{
    id: string
    periodLabel: string
    totalUsage: number
    appliedCoupons: number
    appliedBalance: number
    tax: number
    totalAmount: number
    amountDue: number
    amountPaid: number
    status: string
    invoice: string | null
  }>
}> {
  const tenantId = await getTenantId()
  if (!tenantId) {
    return { balance: 0, vouchers: [], coupons: [], monthlyBills: [] }
  }

  // Fetch balance
  const [balRow] = await db
    .select()
    .from(tenantBalance)
    .where(eq(tenantBalance.tenantId, tenantId))
    .limit(1)

  const balance = balRow ? Number(balRow.availableBalance) : 0

  // Fetch coupons/vouchers with template info
  const couponRows = await db
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
    .where(eq(gpuCoupon.organizationId, tenantId))

  const vouchers = couponRows.map((r) => ({
    id: r.id,
    name: r.templateName ?? "代金券",
    balance: Number(r.remainingValue ?? 0),
    expiresAt: r.expiredAt?.toISOString() ?? null,
  }))

  const coupons = couponRows.map((r) => ({
    id: r.id,
    name: r.templateName ?? "优惠券",
    effectiveDate: r.grantedAt?.toISOString() ?? null,
    expiryDate: r.expiredAt?.toISOString() ?? null,
    balance: Number(r.remainingValue ?? 0),
    total: Number(r.originalValue ?? 0),
    products: r.applicableResources ?? "",
    status: r.status,
  }))

  // Fetch monthly bills
  const billRows = await db
    .select()
    .from(tenantBill)
    .where(eq(tenantBill.tenantId, tenantId))
    .orderBy(desc(tenantBill.billMonth))
    .limit(12)

  const monthlyBills = billRows.map((r) => ({
    id: r.id,
    periodLabel: r.billMonth,
    totalUsage: Number(r.totalAmount),
    appliedCoupons: Number(r.couponAmount),
    appliedBalance: Number(r.balanceAmount),
    tax: 0,
    totalAmount: Number(r.totalAmount),
    amountDue:
      Number(r.totalAmount) -
      Number(r.balanceAmount) -
      Number(r.couponAmount),
    amountPaid: r.paidAt ? Number(r.totalAmount) : 0,
    status: r.status,
    invoice: null,
  }))

  return { balance, vouchers, coupons, monthlyBills }
}
