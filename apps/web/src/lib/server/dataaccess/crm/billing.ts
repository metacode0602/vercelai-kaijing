import { db } from '@/lib/db'
import type {
  Activity,
  Bill,
  BillDetail,
  Consumption,
  Coupon,
  DailyConsumption,
  DailyConsumptionDetail,
  Order,
  OrderItem,
  PlatformTenant,
  Recharge,
  Task,
} from '@/lib/data/types'
import {
  mapBillRow,
  mapCouponRow,
  mapOrderRow,
  mapRechargeRow,
  mapTaskRow,
  toNumber,
} from '@/lib/server/mappers/crm'
import { mapBillingTenantRow } from '@/lib/server/mappers/crm'
import { projectsDataAccess } from './projects'
import { projectActivitiesDataAccess } from './project-activities'
import type {
  TenantMonthlyBillListItem,
  TenantRechargeListResult,
} from '@/lib/types/tenant-billing-list'
import {
  billingTenant,
  computeTask,
  consumptionUsageDaily,
  merchant,
  tenantConsumptionDailyDetail,
  coupon,
  recharge,
  tenantBill,
  tenantBillDetail,
} from '@workspace/db/schema'
import {
  lastNShanghaiUsageMonths,
  shanghaiUsageMonth,
} from '@/lib/crm/balance-snapshot-utils'
import { and, count, desc, eq, inArray, sql, sum } from 'drizzle-orm'

async function tenantIdsForCustomer(customerId: string): Promise<string[]> {
  const rows = await db
    .select({ id: billingTenant.id })
    .from(billingTenant)
    .where(eq(billingTenant.customerId, customerId))
  return rows.map((r) => r.id)
}

function mapDailyDetailToConsumption(row: {
  id: string
  tenantId: string
  productLine: string
  dataCenterName: string
  gpuCardTypeName: string | null
  gpuCardTypeCode: string
  taskName: string | null
  totalAmount: string | number
  totalCardHours: string | number | null
  usageDate: string | Date
}): Consumption {
  const resourceName =
    row.taskName?.trim() ||
    `${row.dataCenterName} · ${row.gpuCardTypeName ?? row.gpuCardTypeCode}`
  const usageDate = String(row.usageDate).slice(0, 10)
  return {
    id: row.id,
    tenantId: row.tenantId,
    projectId: '',
    productLine: row.productLine as Consumption['productLine'],
    resourceName,
    amount: toNumber(row.totalAmount),
    duration: row.totalCardHours != null ? toNumber(row.totalCardHours) : 0,
    unit: 'hour',
    createdAt: `${usageDate}T00:00:00.000Z`,
  }
}

export const billingDataAccess = {
  async listTenantsByCustomer(customerId: string): Promise<PlatformTenant[]> {
    const rows = await db
      .select({ tenant: billingTenant, merch: merchant })
      .from(billingTenant)
      .innerJoin(merchant, eq(merchant.id, billingTenant.merchantId))
      .where(eq(billingTenant.customerId, customerId))
      .orderBy(billingTenant.isDefault)
    return rows.map((r) =>
      mapBillingTenantRow(r.tenant, { id: r.merch.id, name: r.merch.name }),
    )
  },

  async listRechargesByCustomer(input: {
    customerId: string
    page: number
    pageSize: number
  }): Promise<TenantRechargeListResult> {
    const page = Math.max(1, input.page)
    const pageSize = Math.min(100, Math.max(1, input.pageSize))
    const offset = (page - 1) * pageSize

    const tenantIds = await tenantIdsForCustomer(input.customerId)
    if (tenantIds.length === 0) {
      return { items: [], total: 0, page, pageSize }
    }

    const whereClause = inArray(recharge.tenantId, tenantIds)

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
      items: rows.map((row) => {
        const mapped = mapRechargeRow(row)
        return {
          id: mapped.id,
          transactionId: mapped.transactionId,
          amount: mapped.amount,
          paymentMethod: mapped.paymentMethod,
          status: mapped.status,
          source: row.source,
          createdAt: mapped.createdAt,
          completedAt: mapped.completedAt,
        }
      }),
      total: Number(totalRow?.total ?? 0),
      page,
      pageSize,
    }
  },

  async listConsumptionsByCustomer(customerId: string): Promise<Consumption[]> {
    const tenantIds = await tenantIdsForCustomer(customerId)
    if (tenantIds.length === 0) return []
    const rows = await db
      .select({
        id: tenantConsumptionDailyDetail.id,
        tenantId: tenantConsumptionDailyDetail.tenantId,
        productLine: tenantConsumptionDailyDetail.productLine,
        dataCenterName: tenantConsumptionDailyDetail.dataCenterName,
        gpuCardTypeName: tenantConsumptionDailyDetail.gpuCardTypeName,
        gpuCardTypeCode: tenantConsumptionDailyDetail.gpuCardTypeCode,
        taskName: tenantConsumptionDailyDetail.taskName,
        totalAmount: tenantConsumptionDailyDetail.totalAmount,
        totalCardHours: tenantConsumptionDailyDetail.totalCardHours,
        usageDate: tenantConsumptionDailyDetail.usageDate,
      })
      .from(tenantConsumptionDailyDetail)
      .where(inArray(tenantConsumptionDailyDetail.tenantId, tenantIds))
      .orderBy(
        desc(tenantConsumptionDailyDetail.usageDate),
        desc(tenantConsumptionDailyDetail.createdAt),
      )
      .limit(200)
    return rows.map(mapDailyDetailToConsumption)
  },

  async listCouponsByCustomer(customerId: string): Promise<Coupon[]> {
    const tenantIds = await tenantIdsForCustomer(customerId)
    if (tenantIds.length === 0) return []
    const rows = await db
      .select()
      .from(coupon)
      .where(inArray(coupon.tenantId, tenantIds))
      .orderBy(desc(coupon.issuedAt))
    return rows.map(mapCouponRow)
  },

  async listRechargesByProject(projectId: string): Promise<Recharge[]> {
    const tenantIds = await projectsDataAccess.getBillingTenantIdsForProject(projectId)
    if (tenantIds.length === 0) return []
    const rows = await db
      .select()
      .from(recharge)
      .where(
        and(inArray(recharge.tenantId, tenantIds), eq(recharge.projectId, projectId)),
      )
      .orderBy(desc(recharge.createdAt))
    const fallback =
      rows.length > 0
        ? rows
        : await db
            .select()
            .from(recharge)
            .where(inArray(recharge.tenantId, tenantIds))
            .orderBy(desc(recharge.createdAt))
    return fallback.map(mapRechargeRow)
  },

  async listConsumptionsByProject(projectId: string): Promise<Consumption[]> {
    const tenantIds = await projectsDataAccess.getBillingTenantIdsForProject(projectId)
    if (tenantIds.length === 0) return []
    const rows = await db
      .select({
        id: tenantConsumptionDailyDetail.id,
        tenantId: tenantConsumptionDailyDetail.tenantId,
        productLine: tenantConsumptionDailyDetail.productLine,
        dataCenterName: tenantConsumptionDailyDetail.dataCenterName,
        gpuCardTypeName: tenantConsumptionDailyDetail.gpuCardTypeName,
        gpuCardTypeCode: tenantConsumptionDailyDetail.gpuCardTypeCode,
        taskName: tenantConsumptionDailyDetail.taskName,
        totalAmount: tenantConsumptionDailyDetail.totalAmount,
        totalCardHours: tenantConsumptionDailyDetail.totalCardHours,
        usageDate: tenantConsumptionDailyDetail.usageDate,
      })
      .from(tenantConsumptionDailyDetail)
      .where(inArray(tenantConsumptionDailyDetail.tenantId, tenantIds))
      .orderBy(
        desc(tenantConsumptionDailyDetail.usageDate),
        desc(tenantConsumptionDailyDetail.createdAt),
      )
      .limit(200)
    return rows.map((row) => ({ ...mapDailyDetailToConsumption(row), projectId }))
  },

  async listDailyConsumptionsForTenants(
    tenantIds: string[],
    options?: {
      productLine?: string
      usageMonth?: string
      page?: number
      pageSize?: number
    },
  ): Promise<{
    items: DailyConsumption[]
    total: number
    page: number
    pageSize: number
    totals: { amount: number; voucher: number; balance: number }
    usageMonths: string[]
  }> {
    const page = Math.max(1, options?.page ?? 1)
    const pageSize = Math.min(500, Math.max(1, options?.pageSize ?? 20))
    const offset = (page - 1) * pageSize

    if (tenantIds.length === 0) {
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        totals: { amount: 0, voucher: 0, balance: 0 },
        usageMonths: [],
      }
    }

    const filters = [inArray(consumptionUsageDaily.tenantId, tenantIds)]
    if (options?.productLine) {
      filters.push(eq(consumptionUsageDaily.productLine, options.productLine))
    }
    if (options?.usageMonth) {
      filters.push(eq(consumptionUsageDaily.usageMonth, options.usageMonth))
    }
    const where = and(...filters)

    const monthFilters = [inArray(consumptionUsageDaily.tenantId, tenantIds)]
    if (options?.productLine) {
      monthFilters.push(eq(consumptionUsageDaily.productLine, options.productLine))
    }

    const [totalRow, totalsRow, monthRows, rows] = await Promise.all([
      db.select({ value: count() }).from(consumptionUsageDaily).where(where),
      db
        .select({
          amount: sql<string>`coalesce(sum(${consumptionUsageDaily.amount}), 0)`,
          voucher: sql<string>`coalesce(sum(${consumptionUsageDaily.voucherAmount}), 0)`,
          balance: sql<string>`coalesce(sum(${consumptionUsageDaily.balanceAmount}), 0)`,
        })
        .from(consumptionUsageDaily)
        .where(where),
      db
        .selectDistinct({ usageMonth: consumptionUsageDaily.usageMonth })
        .from(consumptionUsageDaily)
        .where(and(...monthFilters))
        .orderBy(desc(consumptionUsageDaily.usageMonth)),
      db
        .select({
          id: consumptionUsageDaily.id,
          tenantId: consumptionUsageDaily.tenantId,
          tenantName: billingTenant.name,
          usageDate: consumptionUsageDaily.usageDate,
          usageMonth: consumptionUsageDaily.usageMonth,
          productLine: consumptionUsageDaily.productLine,
          amount: consumptionUsageDaily.amount,
          voucherAmount: consumptionUsageDaily.voucherAmount,
          balanceAmount: consumptionUsageDaily.balanceAmount,
          totalCardHours: consumptionUsageDaily.totalCardHours,
          voucherCardHours: consumptionUsageDaily.voucherCardHours,
          balanceCardHours: consumptionUsageDaily.balanceCardHours,
          taskCount: sql<number>`coalesce((
          select count(*)::int from tenant_consumption_daily_detail d
          where d.tenant_id = ${consumptionUsageDaily.tenantId}
            and d.usage_date = ${consumptionUsageDaily.usageDate}
            and d.product_line = ${consumptionUsageDaily.productLine}
        ), 0)`.mapWith(Number),
        })
        .from(consumptionUsageDaily)
        .innerJoin(billingTenant, eq(consumptionUsageDaily.tenantId, billingTenant.id))
        .where(where)
        .orderBy(
          desc(consumptionUsageDaily.usageDate),
          billingTenant.name,
          consumptionUsageDaily.productLine,
        )
        .limit(pageSize)
        .offset(offset),
    ])

    return {
      items: rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        tenantName: row.tenantName,
        usageDate: String(row.usageDate).slice(0, 10),
        usageMonth: row.usageMonth,
        productLine: row.productLine ?? '',
        amount: toNumber(row.amount),
        voucherAmount: toNumber(row.voucherAmount),
        balanceAmount: toNumber(row.balanceAmount),
        totalCardHours: row.totalCardHours != null ? toNumber(row.totalCardHours) : null,
        voucherCardHours: row.voucherCardHours != null ? toNumber(row.voucherCardHours) : null,
        balanceCardHours: row.balanceCardHours != null ? toNumber(row.balanceCardHours) : null,
        taskCount: Number(row.taskCount ?? 0),
      })),
      total: Number(totalRow[0]?.value ?? 0),
      page,
      pageSize,
      totals: {
        amount: toNumber(totalsRow[0]?.amount ?? 0),
        voucher: toNumber(totalsRow[0]?.voucher ?? 0),
        balance: toNumber(totalsRow[0]?.balance ?? 0),
      },
      usageMonths: monthRows.map((r) => r.usageMonth).filter(Boolean),
    }
  },

  async listDailyConsumptionsByCustomer(
    customerId: string,
    options?: {
      productLine?: string
      usageMonth?: string
      page?: number
      pageSize?: number
    },
  ) {
    const tenantIds = await tenantIdsForCustomer(customerId)
    return this.listDailyConsumptionsForTenants(tenantIds, options)
  },

  async listDailyConsumptionsByProject(
    projectId: string,
    options?: {
      productLine?: string
      usageMonth?: string
      page?: number
      pageSize?: number
    },
  ) {
    const tenantIds = await projectsDataAccess.getBillingTenantIdsForProject(projectId)
    return this.listDailyConsumptionsForTenants(tenantIds, options)
  },

  async listDailyConsumptionDetailsForTenant(
    input: { usageDate: string; productLine: string; tenantId: string },
  ): Promise<DailyConsumptionDetail[]> {
    const rows = await db
      .select({
        id: tenantConsumptionDailyDetail.id,
        tenantId: tenantConsumptionDailyDetail.tenantId,
        tenantName: billingTenant.name,
        usageDate: tenantConsumptionDailyDetail.usageDate,
        productLine: tenantConsumptionDailyDetail.productLine,
        dataCenterCode: tenantConsumptionDailyDetail.dataCenterCode,
        dataCenterName: tenantConsumptionDailyDetail.dataCenterName,
        gpuCardTypeCode: tenantConsumptionDailyDetail.gpuCardTypeCode,
        gpuCardTypeName: tenantConsumptionDailyDetail.gpuCardTypeName,
        platformTaskId: tenantConsumptionDailyDetail.platformTaskId,
        taskName: tenantConsumptionDailyDetail.taskName,
        totalAmount: tenantConsumptionDailyDetail.totalAmount,
        voucherAmount: tenantConsumptionDailyDetail.voucherAmount,
        balanceAmount: tenantConsumptionDailyDetail.balanceAmount,
        totalCardHours: tenantConsumptionDailyDetail.totalCardHours,
        voucherCardHours: tenantConsumptionDailyDetail.voucherCardHours,
        balanceCardHours: tenantConsumptionDailyDetail.balanceCardHours,
      })
      .from(tenantConsumptionDailyDetail)
      .innerJoin(billingTenant, eq(tenantConsumptionDailyDetail.tenantId, billingTenant.id))
      .where(
        and(
          eq(tenantConsumptionDailyDetail.tenantId, input.tenantId),
          eq(tenantConsumptionDailyDetail.usageDate, input.usageDate),
          eq(tenantConsumptionDailyDetail.productLine, input.productLine),
        ),
      )
      .orderBy(
        desc(tenantConsumptionDailyDetail.totalAmount),
        tenantConsumptionDailyDetail.taskName,
      )

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      usageDate: String(row.usageDate).slice(0, 10),
      productLine: row.productLine,
      dataCenterCode: row.dataCenterCode,
      dataCenterName: row.dataCenterName,
      gpuCardTypeCode: row.gpuCardTypeCode,
      gpuCardTypeName: row.gpuCardTypeName,
      platformTaskId: row.platformTaskId,
      taskName: row.taskName,
      totalAmount: toNumber(row.totalAmount),
      voucherAmount: toNumber(row.voucherAmount),
      balanceAmount: toNumber(row.balanceAmount),
      totalCardHours: row.totalCardHours != null ? toNumber(row.totalCardHours) : null,
      voucherCardHours: row.voucherCardHours != null ? toNumber(row.voucherCardHours) : null,
      balanceCardHours: row.balanceCardHours != null ? toNumber(row.balanceCardHours) : null,
    }))
  },

  async listDailyConsumptionDetailsByCustomer(
    customerId: string,
    input: { usageDate: string; productLine: string; tenantId: string },
  ): Promise<DailyConsumptionDetail[]> {
    const tenantIds = await tenantIdsForCustomer(customerId)
    if (!tenantIds.includes(input.tenantId)) return []
    return this.listDailyConsumptionDetailsForTenant(input)
  },

  async listDailyConsumptionDetailsByProject(
    projectId: string,
    input: { usageDate: string; productLine: string; tenantId: string },
  ): Promise<DailyConsumptionDetail[]> {
    const tenantIds = await projectsDataAccess.getBillingTenantIdsForProject(projectId)
    if (!tenantIds.includes(input.tenantId)) return []
    return this.listDailyConsumptionDetailsForTenant(input)
  },

  async listTasksByProject(projectId: string): Promise<Task[]> {
    const tenantIds = await projectsDataAccess.getBillingTenantIdsForProject(projectId)
    const rows = await db
      .select()
      .from(computeTask)
      .where(
        tenantIds.length
          ? and(
              eq(computeTask.projectId, projectId),
              inArray(computeTask.tenantId, tenantIds),
            )
          : eq(computeTask.projectId, projectId),
      )
      .orderBy(desc(computeTask.startTime))
    return rows.map(mapTaskRow)
  },

  async listOrdersByProject(projectId: string): Promise<Order[]> {
    const { listBareMetalOrdersForProject } = await import('./bare-metal-order-list')
    const rows = await listBareMetalOrdersForProject(projectId)
    return rows.map((row) =>
      mapOrderRow(
        {
          id: row.id,
          orderNo: row.orderNo,
          tenantId: null,
          projectId,
          productLine: 'bare_metal',
          status: row.status,
          amount: row.amount,
          createdAt: new Date(row.createdAt),
          completedAt: row.completedAt ? new Date(row.completedAt) : null,
        },
        row.items,
      ),
    )
  },

  async listCouponsByProject(projectId: string): Promise<Coupon[]> {
    const tenantIds = await projectsDataAccess.getBillingTenantIdsForProject(projectId)
    const rows = await db
      .select()
      .from(coupon)
      .where(
        and(
          inArray(coupon.tenantId, tenantIds),
          eq(coupon.projectId, projectId),
        ),
      )
      .orderBy(desc(coupon.issuedAt))
    const fallback =
      rows.length > 0
        ? rows
        : await db
            .select()
            .from(coupon)
            .where(inArray(coupon.tenantId, tenantIds))
            .orderBy(desc(coupon.issuedAt))
    return fallback.map(mapCouponRow)
  },

  async listMonthlyBillsByProject(
    projectId: string,
    options?: { page?: number; pageSize?: number },
  ): Promise<{
    items: TenantMonthlyBillListItem[]
    total: number
    page: number
    pageSize: number
  }> {
    const page = Math.max(1, options?.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 20))
    const offset = (page - 1) * pageSize

    const tenantIds = await projectsDataAccess.getBillingTenantIdsForProject(projectId)
    if (tenantIds.length === 0) {
      return { items: [], total: 0, page, pageSize }
    }

    const where = inArray(tenantBill.tenantId, tenantIds)
    const [totalRow, rows] = await Promise.all([
      db.select({ value: count() }).from(tenantBill).where(where),
      db
        .select()
        .from(tenantBill)
        .where(where)
        .orderBy(desc(tenantBill.billMonth))
        .limit(pageSize)
        .offset(offset),
    ])

    return {
      items: rows.map((row) => ({
        id: row.id,
        billMonth: row.billMonth,
        totalAmount: toNumber(row.totalAmount),
        balanceAmount: toNumber(row.balanceAmount),
        couponAmount: toNumber(row.couponAmount),
        status: row.status,
        dueDate: String(row.dueDate),
        paidAt: row.paidAt ? row.paidAt.toISOString() : undefined,
      })),
      total: Number(totalRow[0]?.value ?? 0),
      page,
      pageSize,
    }
  },

  async listBillsByProject(projectId: string): Promise<Bill[]> {
    const tenantIds = await projectsDataAccess.getBillingTenantIdsForProject(projectId)
    if (tenantIds.length === 0) return []

    const rows = await db
      .select()
      .from(tenantBill)
      .where(
        and(inArray(tenantBill.tenantId, tenantIds), eq(tenantBill.projectId, projectId)),
      )
      .orderBy(desc(tenantBill.billMonth))
    const fallback =
      rows.length > 0
        ? rows
        : await db
            .select()
            .from(tenantBill)
            .where(inArray(tenantBill.tenantId, tenantIds))
            .orderBy(desc(tenantBill.billMonth))

    const result: Bill[] = []
    for (const row of fallback) {
      const details = await db
        .select()
        .from(tenantBillDetail)
        .where(eq(tenantBillDetail.billId, row.id))
      const billDetails: BillDetail[] = details.map((d) => ({
        productLine: d.productLine ?? '',
        resourceName: d.resourceName ?? '',
        usage: toNumber(d.usage),
        unit: d.unit ?? '',
        unitPrice: toNumber(d.unitPrice),
        amount: toNumber(d.amount),
      }))
      result.push(
        mapBillRow(
          {
            ...row,
            dueDate: String(row.dueDate),
          },
          billDetails,
        ),
      )
    }
    return result
  },

  async listActivitiesByProject(projectId: string): Promise<Activity[]> {
    return projectActivitiesDataAccess.listByProject(projectId)
  },

  async consumptionTrendByCustomer(customerId: string, months = 12) {
    const tenantIds = await tenantIdsForCustomer(customerId)
    const monthKeys = lastNShanghaiUsageMonths(months)
    if (tenantIds.length === 0) {
      return monthKeys.map((month) => ({ month, consumption: 0 }))
    }

    const rows = await db
      .select({
        month: consumptionUsageDaily.usageMonth,
        amount: sum(consumptionUsageDaily.amount),
      })
      .from(consumptionUsageDaily)
      .where(
        and(
          inArray(consumptionUsageDaily.tenantId, tenantIds),
          inArray(consumptionUsageDaily.usageMonth, monthKeys),
        ),
      )
      .groupBy(consumptionUsageDaily.usageMonth)

    const amountByMonth = new Map(rows.map((r) => [r.month, Number(r.amount ?? 0)]))

    return monthKeys.map((month) => ({
      month,
      consumption: amountByMonth.get(month) ?? 0,
    }))
  },

  async productLineBreakdownByCustomer(customerId: string, usageMonth?: string) {
    const tenantIds = await tenantIdsForCustomer(customerId)
    if (tenantIds.length === 0) return []

    const month = usageMonth ?? shanghaiUsageMonth()
    const rows = await db
      .select({
        productLine: consumptionUsageDaily.productLine,
        amount: sum(consumptionUsageDaily.amount),
      })
      .from(consumptionUsageDaily)
      .where(
        and(
          inArray(consumptionUsageDaily.tenantId, tenantIds),
          eq(consumptionUsageDaily.usageMonth, month),
        ),
      )
      .groupBy(consumptionUsageDaily.productLine)

    return rows
      .map((r) => ({
        name: r.productLine ?? 'unknown',
        value: Number(r.amount ?? 0),
      }))
      .sort((a, b) => b.value - a.value)
  },
}
