/**
 * Recharge data access layer for apps/gpus.
 *
 * Replaces the mock data in lib/recharge-data.ts with real database queries.
 * Uses @workspace/billing for business logic and @workspace/db for schema.
 */

import { eq, and, desc, count } from "drizzle-orm"
import { db } from "@/lib/db"
import { getSession } from "@/lib/server/auth-utils"
import {
  paymentOrder,
  tenantBalance,
  bankAccount,
} from "@workspace/db"
import {
  createRechargeOrder,
  handlePaymentCallback,
  listPaymentOrders,
  listBalanceTransactions,
} from "@workspace/billing"
import type {
  PaymentOrder,
  BalanceTransaction,
  PaginatedResult,
} from "@workspace/billing"

// ---------------------------------------------------------------------------
// Re-export shared types for convenience
// ---------------------------------------------------------------------------

import type {
  RechargeTransactionType,
  RechargePaymentMethod,
  RechargeTransactionStatus,
  RechargeTransaction,
  RechargePageData,
} from "@/lib/recharge-shared"

export type {
  RechargeTransactionType,
  RechargePaymentMethod,
  RechargeTransactionStatus,
  RechargeTransaction,
  RechargePageData,
}

// ---------------------------------------------------------------------------
// Auth helper — get tenant ID from session
// ---------------------------------------------------------------------------

async function getTenantId(): Promise<string> {
  const session = await getSession()
  if (!session?.session?.activeOrganizationId) {
    throw new Error("Unauthorized")
  }
  return session.session.activeOrganizationId
}

// ---------------------------------------------------------------------------
// Map payment order to UI transaction
// ---------------------------------------------------------------------------

function mapPaymentOrderToTransaction(
  order: PaymentOrder,
): RechargeTransaction {
  const statusMap: Record<string, RechargeTransactionStatus> = {
    paid: "completed",
    pending: "pending",
    failed: "failed",
    expired: "failed",
    refunded: "completed",
    partial_refunded: "completed",
  }

  const methodMap: Record<string, RechargePaymentMethod> = {
    wechat: "wechat",
    alipay: "alipay",
    bank_transfer: "bank_transfer",
  }

  const amount = Number(order.amount)

  return {
    id: order.id,
    date: order.createdAt?.toISOString() ?? order.paidAt?.toISOString() ?? "",
    type: "top_up",
    note: order.scene === "recharge" ? "账户充值" : order.scene,
    paymentMethod: methodMap[order.paymentMethod] ?? "bank_transfer",
    status: statusMap[order.status] ?? "pending",
    amount,
    tax: 0,
    totalAmount: amount,
    receipt: order.channelOrderNo ?? null,
  }
}

// ---------------------------------------------------------------------------
// Get recharge page data (Server Component data loader)
// ---------------------------------------------------------------------------

export async function getRechargePageData(): Promise<RechargePageData> {
  try {
    const tenantId = await getTenantId()

    // Fetch balance
    const [balRow] = await db
      .select()
      .from(tenantBalance)
      .where(eq(tenantBalance.tenantId, tenantId))
      .limit(1)

    const balance = balRow ? Number(balRow.availableBalance) : 0

    // Fetch recent recharge orders
    const [totalRow] = await db
      .select({ total: count() })
      .from(paymentOrder)
      .where(
        and(
          eq(paymentOrder.tenantId, tenantId),
          eq(paymentOrder.scene, "recharge"),
        ),
      )

    const total = Number(totalRow?.total ?? 0)

    const rows = total > 0
      ? await db
          .select()
          .from(paymentOrder)
          .where(
            and(
              eq(paymentOrder.tenantId, tenantId),
              eq(paymentOrder.scene, "recharge"),
            ),
          )
          .orderBy(desc(paymentOrder.createdAt))
          .limit(50)
      : []

    const transactions = rows.map(mapPaymentOrderToTransaction)

    return { transactions, balance }
  } catch {
    // Fallback for unauthenticated or error states
    return { transactions: [], balance: 0 }
  }
}

// ---------------------------------------------------------------------------
// Get bank accounts for bank transfer
// ---------------------------------------------------------------------------

export async function getBankAccounts(): Promise<
  Array<{
    id: string
    accountName: string
    accountNo: string
    bankName: string
    bankBranch: string | null
  }>
> {
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
  }))
}

// ---------------------------------------------------------------------------
// Get balance info
// ---------------------------------------------------------------------------

export async function getBalanceInfo(): Promise<{
  available: number
  reserved: number
  total: number
}> {
  try {
    const tenantId = await getTenantId()
    const [balRow] = await db
      .select()
      .from(tenantBalance)
      .where(eq(tenantBalance.tenantId, tenantId))
      .limit(1)

    if (!balRow) return { available: 0, reserved: 0, total: 0 }

    const available = Number(balRow.availableBalance)
    const reserved = Number(balRow.reservedBalance)
    return { available, reserved, total: available + reserved }
  } catch {
    return { available: 0, reserved: 0, total: 0 }
  }
}

// ---------------------------------------------------------------------------
// Get balance transactions (for billing detail page)
// ---------------------------------------------------------------------------

export async function getBalanceTransactions(params: {
  page?: number
  pageSize?: number
  type?: string
}): Promise<PaginatedResult<BalanceTransaction>> {
  const tenantId = await getTenantId()
  return listBalanceTransactions(db, { tenantId, ...params })
}
