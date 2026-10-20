import { db } from '@/lib/db'
import type {
  MerchantConsumptionDaily,
  MerchantConsumptionSummary,
} from '@/lib/types/merchant'
import {
  billingTenant,
  consumptionUsageDaily,
  customer,
  merchant,
} from '@workspace/db/schema'
import { and, count, desc, eq, gte, lt, sum } from 'drizzle-orm'

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0
  return typeof value === 'number' ? value : Number(value)
}

function toDateString(value: Date | string | null | undefined): string {
  if (!value) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function currentUsageMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function daysAgoDate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

/** YYYY-MM → [startDate, nextMonthStart) 便于走 merchant_id + usage_date 索引 */
function usageMonthDateRange(usageMonth: string): { start: string; end: string } {
  const [yearStr, monthStr] = usageMonth.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const start = `${usageMonth}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
  return { start, end }
}

async function countTenantsForMerchant(merchantId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(billingTenant)
    .where(eq(billingTenant.merchantId, merchantId))
  return row?.count ?? 0
}

async function aggregateDailyRows(
  merchantId: string,
  tenantCount: number,
  filters: { usageMonth?: string; sinceDate?: string },
): Promise<MerchantConsumptionDaily[]> {
  const conditions = [eq(consumptionUsageDaily.merchantId, merchantId)]
  if (filters.usageMonth) {
    const { start, end } = usageMonthDateRange(filters.usageMonth)
    conditions.push(gte(consumptionUsageDaily.usageDate, start))
    conditions.push(lt(consumptionUsageDaily.usageDate, end))
  }
  if (filters.sinceDate) {
    conditions.push(gte(consumptionUsageDaily.usageDate, filters.sinceDate))
  }

  const rows = await db
    .select({
      usageDate: consumptionUsageDaily.usageDate,
      usageMonth: consumptionUsageDaily.usageMonth,
      amount: sum(consumptionUsageDaily.amount),
      voucherAmount: sum(consumptionUsageDaily.voucherAmount),
      balanceAmount: sum(consumptionUsageDaily.balanceAmount),
      totalCardHours: sum(consumptionUsageDaily.totalCardHours),
    })
    .from(consumptionUsageDaily)
    .where(and(...conditions))
    .groupBy(consumptionUsageDaily.usageDate, consumptionUsageDaily.usageMonth)
    .orderBy(consumptionUsageDaily.usageDate)

  return rows.map((row) => ({
    merchantId,
    usageDate: toDateString(row.usageDate),
    usageMonth: row.usageMonth,
    productLine: 'all',
    tenantCount,
    amount: toNumber(row.amount),
    voucherAmount: toNumber(row.voucherAmount),
    balanceAmount: toNumber(row.balanceAmount),
    totalCardHours: toNumber(row.totalCardHours),
  }))
}

async function sumMonthAmount(merchantId: string, usageMonth: string): Promise<number> {
  const { start, end } = usageMonthDateRange(usageMonth)
  const [row] = await db
    .select({ amount: sum(consumptionUsageDaily.amount) })
    .from(consumptionUsageDaily)
    .where(
      and(
        eq(consumptionUsageDaily.merchantId, merchantId),
        gte(consumptionUsageDaily.usageDate, start),
        lt(consumptionUsageDaily.usageDate, end),
      ),
    )

  return toNumber(row?.amount)
}

export type MerchantTenantConsumptionRank = {
  tenantId: string
  tenantName: string
  customerId: string
  customerName: string
  isPrimary: boolean
  monthAmount: number
}

export const merchantConsumptionDataAccess = {
  async getMonthConsumption(merchantId: string, usageMonth = currentUsageMonth()): Promise<number> {
    return sumMonthAmount(merchantId, usageMonth)
  },

  async getDailyByMerchantId(
    merchantId: string,
    params?: { usageMonth?: string; recentDays?: number },
  ): Promise<MerchantConsumptionDaily[]> {
    const tenantCount = await countTenantsForMerchant(merchantId)
    if (params?.usageMonth) {
      return aggregateDailyRows(merchantId, tenantCount, { usageMonth: params.usageMonth })
    }
    const recentDays = params?.recentDays ?? 30
    return aggregateDailyRows(merchantId, tenantCount, { sinceDate: daysAgoDate(recentDays) })
  },

  async getSummary(
    merchantId: string,
    usageMonth = currentUsageMonth(),
  ): Promise<MerchantConsumptionSummary> {
    const [tenantCount, daily, defaultMerchant] = await Promise.all([
      countTenantsForMerchant(merchantId),
      aggregateDailyRows(merchantId, 0, { usageMonth }),
      db.query.merchant.findFirst({
        where: eq(merchant.isDefault, true),
        columns: { id: true },
      }),
    ])

    const monthAmount = daily.reduce((s, d) => s + d.amount, 0)
    const monthVoucherAmount = daily.reduce((s, d) => s + d.voucherAmount, 0)
    const monthBalanceAmount = daily.reduce((s, d) => s + d.balanceAmount, 0)

    let compareGongjiAmount: number | undefined
    if (defaultMerchant && defaultMerchant.id !== merchantId) {
      compareGongjiAmount = await sumMonthAmount(defaultMerchant.id, usageMonth)
    }

    return {
      monthAmount,
      monthVoucherAmount,
      monthBalanceAmount,
      activeTenantCount: tenantCount,
      compareGongjiAmount,
    }
  },

  async listTenantRankByMerchantId(
    merchantId: string,
    usageMonth = currentUsageMonth(),
  ): Promise<MerchantTenantConsumptionRank[]> {
    const { start, end } = usageMonthDateRange(usageMonth)

    const rows = await db
      .select({
        tenantId: billingTenant.id,
        tenantName: billingTenant.name,
        customerId: billingTenant.customerId,
        customerName: customer.name,
        monthAmount: sum(consumptionUsageDaily.amount),
      })
      .from(consumptionUsageDaily)
      .innerJoin(billingTenant, eq(consumptionUsageDaily.tenantId, billingTenant.id))
      .leftJoin(customer, eq(billingTenant.customerId, customer.id))
      .where(
        and(
          eq(consumptionUsageDaily.merchantId, merchantId),
          gte(consumptionUsageDaily.usageDate, start),
          lt(consumptionUsageDaily.usageDate, end),
        ),
      )
      .groupBy(
        billingTenant.id,
        billingTenant.name,
        billingTenant.customerId,
        customer.name,
      )
      .orderBy(desc(sum(consumptionUsageDaily.amount)))
      .limit(10)

    return rows.map((row) => ({
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      customerId: row.customerId ?? '',
      customerName: row.customerName ?? '',
      isPrimary: true,
      monthAmount: toNumber(row.monthAmount),
    }))
  },
}
