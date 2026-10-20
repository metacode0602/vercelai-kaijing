import { db } from '@/lib/db'
import { toNumber } from '@/lib/server/mappers/crm'
import type {
  TenantMonthlyBillDetailItem,
  TenantMonthlyBillListItem,
  TenantRechargeListItem,
  TenantRechargeListResult,
  TenantBareMetalOrderListItem,
  TenantBareMetalOrderListResult,
} from '@/lib/types/tenant-billing-list'
import { listBareMetalOrdersForTenant } from './bare-metal-order-list'
import { recharge, tenantBill, tenantBillDetail } from '@workspace/db/schema'
import { count, desc, eq } from 'drizzle-orm'

export const TENANT_METAL_PRODUCT_LINE = 'bare_metal'
export const TENANT_RESERVED_PACK_PRODUCT_LINE = 'reserved_resource_pack'

function toIso(value: Date | null | undefined): string | undefined {
  return value ? value.toISOString() : undefined
}

function mapRechargeListItem(row: typeof recharge.$inferSelect): TenantRechargeListItem {
  return {
    id: row.id,
    transactionId: row.transactionId ?? '',
    amount: toNumber(row.amount),
    paymentMethod: row.paymentMethod,
    status: row.status,
    source: row.source,
    remark: row.remark ?? undefined,
    createdAt: row.createdAt.toISOString(),
    completedAt: toIso(row.completedAt),
  }
}

export const tenantBillingListsDataAccess = {
  async listRecharges(input: {
    tenantId: string
    page: number
    pageSize: number
  }): Promise<TenantRechargeListResult> {
    const page = Math.max(1, input.page)
    const pageSize = Math.min(100, Math.max(1, input.pageSize))
    const offset = (page - 1) * pageSize
    const whereClause = eq(recharge.tenantId, input.tenantId)

    const [totalRow] = await db
      .select({ total: count() })
      .from(recharge)
      .where(whereClause)

    const rows = await db
      .select()
      .from(recharge)
      .where(whereClause)
      .orderBy(desc(recharge.createdAt))
      .limit(pageSize)
      .offset(offset)

    return {
      items: rows.map((row) => mapRechargeListItem(row)),
      total: Number(totalRow?.total ?? 0),
      page,
      pageSize,
    }
  },

  async listMonthlyBills(tenantId: string): Promise<TenantMonthlyBillListItem[]> {
    const rows = await db
      .select()
      .from(tenantBill)
      .where(eq(tenantBill.tenantId, tenantId))
      .orderBy(desc(tenantBill.billMonth))

    return rows.map((row) => ({
      id: row.id,
      billMonth: row.billMonth,
      totalAmount: toNumber(row.totalAmount),
      balanceAmount: toNumber(row.balanceAmount),
      couponAmount: toNumber(row.couponAmount),
      status: row.status,
      dueDate: String(row.dueDate),
      paidAt: toIso(row.paidAt),
    }))
  },

  async getMonthlyBillDetails(billId: string): Promise<TenantMonthlyBillDetailItem[]> {
    const rows = await db
      .select()
      .from(tenantBillDetail)
      .where(eq(tenantBillDetail.billId, billId))

    return rows.map((row) => ({
      id: row.id,
      productLine: row.productLine ?? '',
      resourceName: row.resourceName ?? '',
      amount: toNumber(row.amount),
      balanceAmount: toNumber(row.balanceAmount),
      couponAmount: toNumber(row.couponAmount),
      type: row.type,
    }))
  },

  async listMetalOrders(input: {
    tenantId: string
    page: number
    pageSize: number
  }): Promise<TenantBareMetalOrderListResult> {
    return listBareMetalOrdersForTenant(input)
  },

  /** 预留资源包尚无独立订单表；原 commerce_order 已合并至 bare_metal_order，此处返回空列表 */
  async listReservedPackOrders(_tenantId: string): Promise<TenantBareMetalOrderListItem[]> {
    return []
  },
}
