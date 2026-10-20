import { db } from '@/lib/db'
import { toIsoDate, toIsoDateTime, toNumber } from '@/lib/server/mappers/crm'
import type {
  MerchantDailyBillDetailItem,
  MerchantDailyBillListItem,
  MerchantMonthlyBillDetailItem,
  MerchantMonthlyBillListItem,
} from '@/lib/types/merchant'
import {
  merchantBill,
  merchantBillDaily,
  merchantBillDailyDetail,
  merchantBillDetail,
  tenantBill,
  tenantBillDaily,
  tenantBillDailyDetail,
  tenantBillDetail,
} from '@workspace/db/schema'
import { and, countDistinct, desc, eq, inArray, sum } from 'drizzle-orm'

function newId() {
  return crypto.randomUUID()
}

function moneyString(n: number): string {
  return n.toFixed(4)
}

function toDateKey(value: Date | string | null | undefined): string {
  return toIsoDate(value)
}

async function listMonthlyFromStored(
  merchantId: string,
): Promise<MerchantMonthlyBillListItem[]> {
  const rows = await db
    .select()
    .from(merchantBill)
    .where(eq(merchantBill.merchantId, merchantId))
    .orderBy(desc(merchantBill.billMonth))

  return rows.map((row) => ({
    id: row.id,
    merchantId: row.merchantId,
    billMonth: row.billMonth,
    totalAmount: toNumber(row.totalAmount),
    couponAmount: toNumber(row.couponAmount),
    balanceAmount: toNumber(row.balanceAmount),
    tenantCount: row.tenantCount,
    source: row.source,
    syncedAt: toIsoDateTime(row.syncedAt),
  }))
}

async function listMonthlyFromTenantBills(
  merchantId: string,
): Promise<MerchantMonthlyBillListItem[]> {
  const rows = await db
    .select({
      billMonth: tenantBill.billMonth,
      totalAmount: sum(tenantBill.totalAmount),
      couponAmount: sum(tenantBill.couponAmount),
      balanceAmount: sum(tenantBill.balanceAmount),
      tenantCount: countDistinct(tenantBill.tenantId),
    })
    .from(tenantBill)
    .where(eq(tenantBill.merchantId, merchantId))
    .groupBy(tenantBill.billMonth)
    .orderBy(desc(tenantBill.billMonth))

  return rows.map((row) => ({
    id: `live:${merchantId}:${row.billMonth}`,
    merchantId,
    billMonth: row.billMonth,
    totalAmount: toNumber(row.totalAmount),
    couponAmount: toNumber(row.couponAmount),
    balanceAmount: toNumber(row.balanceAmount),
    tenantCount: Number(row.tenantCount ?? 0),
    source: 'live_from_tenant',
  }))
}

async function getMonthlyDetailsFromStored(
  billId: string,
): Promise<MerchantMonthlyBillDetailItem[]> {
  const rows = await db
    .select()
    .from(merchantBillDetail)
    .where(eq(merchantBillDetail.merchantBillId, billId))
    .orderBy(merchantBillDetail.productLine)

  return rows.map((row) => ({
    id: row.id,
    productLine: row.productLine,
    resourceName: row.resourceName,
    amount: toNumber(row.amount),
    couponAmount: toNumber(row.couponAmount),
    balanceAmount: toNumber(row.balanceAmount),
    type: row.type,
  }))
}

async function getMonthlyDetailsFromTenantBills(
  merchantId: string,
  billMonth: string,
): Promise<MerchantMonthlyBillDetailItem[]> {
  const rows = await db
    .select({
      productLine: tenantBillDetail.productLine,
      resourceName: tenantBillDetail.resourceName,
      type: tenantBillDetail.type,
      amount: sum(tenantBillDetail.amount),
      couponAmount: sum(tenantBillDetail.couponAmount),
      balanceAmount: sum(tenantBillDetail.balanceAmount),
    })
    .from(tenantBillDetail)
    .innerJoin(tenantBill, eq(tenantBillDetail.billId, tenantBill.id))
    .where(and(eq(tenantBill.merchantId, merchantId), eq(tenantBill.billMonth, billMonth)))
    .groupBy(tenantBillDetail.productLine, tenantBillDetail.resourceName, tenantBillDetail.type)
    .orderBy(tenantBillDetail.productLine)

  return rows.map((row, idx) => ({
    id: `live-detail:${merchantId}:${billMonth}:${idx}`,
    productLine: row.productLine ?? '',
    resourceName: row.resourceName ?? '—',
    amount: toNumber(row.amount),
    couponAmount: toNumber(row.couponAmount),
    balanceAmount: toNumber(row.balanceAmount),
    type: row.type,
  }))
}

async function listDailyFromStored(
  merchantId: string,
  billMonth: string,
): Promise<MerchantDailyBillListItem[]> {
  const dailies = await db
    .select()
    .from(merchantBillDaily)
    .where(
      and(
        eq(merchantBillDaily.merchantId, merchantId),
        eq(merchantBillDaily.usageMonth, billMonth),
      ),
    )
    .orderBy(desc(merchantBillDaily.usageDate))

  if (dailies.length === 0) return []

  const dailyIds = dailies.map((d) => d.id)
  const detailRows = await db
    .select()
    .from(merchantBillDailyDetail)
    .where(inArray(merchantBillDailyDetail.dailyBillId, dailyIds))
    .orderBy(merchantBillDailyDetail.productLine)

  const detailsByDaily = new Map<string, MerchantDailyBillDetailItem[]>()
  for (const row of detailRows) {
    const list = detailsByDaily.get(row.dailyBillId) ?? []
    list.push({
      id: row.id,
      productLine: row.productLine,
      resourceName: row.resourceName,
      amount: toNumber(row.amount),
      couponAmount: toNumber(row.couponAmount),
      balanceAmount: toNumber(row.balanceAmount),
      type: row.type,
    })
    detailsByDaily.set(row.dailyBillId, list)
  }

  return dailies.map((row) => ({
    id: row.id,
    merchantId: row.merchantId,
    usageDate: toDateKey(row.usageDate),
    usageMonth: row.usageMonth,
    totalAmount: toNumber(row.totalAmount),
    couponAmount: toNumber(row.couponAmount),
    balanceAmount: toNumber(row.balanceAmount),
    tenantCount: row.tenantCount,
    source: row.source,
    details: detailsByDaily.get(row.id) ?? [],
  }))
}

async function listDailyFromTenantBills(
  merchantId: string,
  billMonth: string,
): Promise<MerchantDailyBillListItem[]> {
  const dailies = await db
    .select({
      usageDate: tenantBillDaily.usageDate,
      usageMonth: tenantBillDaily.usageMonth,
      totalAmount: sum(tenantBillDaily.totalAmount),
      couponAmount: sum(tenantBillDaily.couponAmount),
      balanceAmount: sum(tenantBillDaily.balanceAmount),
      tenantCount: countDistinct(tenantBillDaily.tenantId),
    })
    .from(tenantBillDaily)
    .where(
      and(
        eq(tenantBillDaily.merchantId, merchantId),
        eq(tenantBillDaily.usageMonth, billMonth),
      ),
    )
    .groupBy(tenantBillDaily.usageDate, tenantBillDaily.usageMonth)
    .orderBy(desc(tenantBillDaily.usageDate))

  if (dailies.length === 0) return []

  const detailRows = await db
    .select({
      usageDate: tenantBillDailyDetail.usageDate,
      productLine: tenantBillDailyDetail.productLine,
      resourceName: tenantBillDailyDetail.resourceName,
      type: tenantBillDailyDetail.type,
      amount: sum(tenantBillDailyDetail.amount),
      couponAmount: sum(tenantBillDailyDetail.couponAmount),
      balanceAmount: sum(tenantBillDailyDetail.balanceAmount),
    })
    .from(tenantBillDailyDetail)
    .where(
      and(
        eq(tenantBillDailyDetail.merchantId, merchantId),
        eq(tenantBillDailyDetail.usageMonth, billMonth),
      ),
    )
    .groupBy(
      tenantBillDailyDetail.usageDate,
      tenantBillDailyDetail.productLine,
      tenantBillDailyDetail.resourceName,
      tenantBillDailyDetail.type,
    )
    .orderBy(tenantBillDailyDetail.productLine)

  const detailsByDate = new Map<string, MerchantDailyBillDetailItem[]>()
  for (const [idx, row] of detailRows.entries()) {
    const dateKey = toDateKey(row.usageDate)
    const list = detailsByDate.get(dateKey) ?? []
    list.push({
      id: `live-daily-detail:${merchantId}:${dateKey}:${idx}`,
      productLine: row.productLine,
      resourceName: row.resourceName,
      amount: toNumber(row.amount),
      couponAmount: toNumber(row.couponAmount),
      balanceAmount: toNumber(row.balanceAmount),
      type: row.type,
    })
    detailsByDate.set(dateKey, list)
  }

  return dailies.map((row) => {
    const usageDate = toDateKey(row.usageDate)
    return {
      id: `live-daily:${merchantId}:${usageDate}`,
      merchantId,
      usageDate,
      usageMonth: row.usageMonth,
      totalAmount: toNumber(row.totalAmount),
      couponAmount: toNumber(row.couponAmount),
      balanceAmount: toNumber(row.balanceAmount),
      tenantCount: Number(row.tenantCount ?? 0),
      source: 'live_from_tenant',
      details: detailsByDate.get(usageDate) ?? [],
    }
  })
}

/** 将指定账期（或全部）从租户账单 rollup 写入 merchant_bill* */
async function rollupMonthlyForMerchant(merchantId: string, billMonth?: string) {
  const monthRows = await db
    .select({
      billMonth: tenantBill.billMonth,
      totalAmount: sum(tenantBill.totalAmount),
      couponAmount: sum(tenantBill.couponAmount),
      balanceAmount: sum(tenantBill.balanceAmount),
      tenantCount: countDistinct(tenantBill.tenantId),
    })
    .from(tenantBill)
    .where(
      billMonth
        ? and(eq(tenantBill.merchantId, merchantId), eq(tenantBill.billMonth, billMonth))
        : eq(tenantBill.merchantId, merchantId),
    )
    .groupBy(tenantBill.billMonth)

  const now = new Date()
  let upsertedMonths = 0

  for (const month of monthRows) {
    const existing = await db.query.merchantBill.findFirst({
      where: and(
        eq(merchantBill.merchantId, merchantId),
        eq(merchantBill.billMonth, month.billMonth),
      ),
      columns: { id: true },
    })

    const billId = existing?.id ?? newId()
    const values = {
      merchantId,
      billMonth: month.billMonth,
      totalAmount: moneyString(toNumber(month.totalAmount)),
      couponAmount: moneyString(toNumber(month.couponAmount)),
      balanceAmount: moneyString(toNumber(month.balanceAmount)),
      tenantCount: Number(month.tenantCount ?? 0),
      source: 'rollup_from_tenant' as const,
      syncedAt: now,
      updatedAt: now,
    }

    if (existing) {
      await db.update(merchantBill).set(values).where(eq(merchantBill.id, billId))
      await db.delete(merchantBillDetail).where(eq(merchantBillDetail.merchantBillId, billId))
    } else {
      await db.insert(merchantBill).values({
        id: billId,
        ...values,
        createdAt: now,
      })
    }

    const details = await getMonthlyDetailsFromTenantBills(merchantId, month.billMonth)
    if (details.length > 0) {
      await db.insert(merchantBillDetail).values(
        details.map((d) => ({
          id: newId(),
          merchantBillId: billId,
          merchantId,
          billMonth: month.billMonth,
          productLine: d.productLine || 'unknown',
          resourceName: d.resourceName || '—',
          amount: moneyString(d.amount),
          couponAmount: moneyString(d.couponAmount),
          balanceAmount: moneyString(d.balanceAmount),
          type: d.type || 'prepaid',
        })),
      )
    }
    upsertedMonths++
  }

  return upsertedMonths
}

async function rollupDailyForMerchant(merchantId: string, billMonth?: string) {
  const dayRows = await db
    .select({
      usageDate: tenantBillDaily.usageDate,
      usageMonth: tenantBillDaily.usageMonth,
      totalAmount: sum(tenantBillDaily.totalAmount),
      couponAmount: sum(tenantBillDaily.couponAmount),
      balanceAmount: sum(tenantBillDaily.balanceAmount),
      tenantCount: countDistinct(tenantBillDaily.tenantId),
    })
    .from(tenantBillDaily)
    .where(
      billMonth
        ? and(
            eq(tenantBillDaily.merchantId, merchantId),
            eq(tenantBillDaily.usageMonth, billMonth),
          )
        : eq(tenantBillDaily.merchantId, merchantId),
    )
    .groupBy(tenantBillDaily.usageDate, tenantBillDaily.usageMonth)

  const now = new Date()
  let upsertedDays = 0

  for (const day of dayRows) {
    const usageDate = toDateKey(day.usageDate)
    const existing = await db.query.merchantBillDaily.findFirst({
      where: and(
        eq(merchantBillDaily.merchantId, merchantId),
        eq(merchantBillDaily.usageDate, usageDate),
      ),
      columns: { id: true },
    })

    const dailyId = existing?.id ?? newId()
    const values = {
      merchantId,
      usageDate,
      billDate: usageDate,
      usageMonth: day.usageMonth,
      totalAmount: moneyString(toNumber(day.totalAmount)),
      couponAmount: moneyString(toNumber(day.couponAmount)),
      balanceAmount: moneyString(toNumber(day.balanceAmount)),
      tenantCount: Number(day.tenantCount ?? 0),
      source: 'rollup_from_tenant' as const,
      syncedAt: now,
      updatedAt: now,
    }

    if (existing) {
      await db.update(merchantBillDaily).set(values).where(eq(merchantBillDaily.id, dailyId))
      await db
        .delete(merchantBillDailyDetail)
        .where(eq(merchantBillDailyDetail.dailyBillId, dailyId))
    } else {
      await db.insert(merchantBillDaily).values({
        id: dailyId,
        ...values,
        createdAt: now,
      })
    }

    const detailAgg = await db
      .select({
        productLine: tenantBillDailyDetail.productLine,
        resourceName: tenantBillDailyDetail.resourceName,
        type: tenantBillDailyDetail.type,
        amount: sum(tenantBillDailyDetail.amount),
        couponAmount: sum(tenantBillDailyDetail.couponAmount),
        balanceAmount: sum(tenantBillDailyDetail.balanceAmount),
      })
      .from(tenantBillDailyDetail)
      .where(
        and(
          eq(tenantBillDailyDetail.merchantId, merchantId),
          eq(tenantBillDailyDetail.usageDate, usageDate),
        ),
      )
      .groupBy(
        tenantBillDailyDetail.productLine,
        tenantBillDailyDetail.resourceName,
        tenantBillDailyDetail.type,
      )

    if (detailAgg.length > 0) {
      await db.insert(merchantBillDailyDetail).values(
        detailAgg.map((d) => ({
          id: newId(),
          dailyBillId: dailyId,
          merchantId,
          usageDate,
          usageMonth: day.usageMonth,
          productLine: d.productLine,
          resourceName: d.resourceName,
          amount: moneyString(toNumber(d.amount)),
          couponAmount: moneyString(toNumber(d.couponAmount)),
          balanceAmount: moneyString(toNumber(d.balanceAmount)),
          type: d.type,
        })),
      )
    }
    upsertedDays++
  }

  return upsertedDays
}

export const merchantBillDataAccess = {
  async listMonthly(merchantId: string): Promise<MerchantMonthlyBillListItem[]> {
    const stored = await listMonthlyFromStored(merchantId)
    if (stored.length > 0) return stored
    return listMonthlyFromTenantBills(merchantId)
  },

  async getMonthlyDetails(input: {
    merchantId: string
    billId?: string
    billMonth: string
  }): Promise<MerchantMonthlyBillDetailItem[]> {
    if (input.billId && !input.billId.startsWith('live:')) {
      const bill = await db.query.merchantBill.findFirst({
        where: and(
          eq(merchantBill.id, input.billId),
          eq(merchantBill.merchantId, input.merchantId),
        ),
        columns: { id: true },
      })
      if (bill) {
        const details = await getMonthlyDetailsFromStored(bill.id)
        if (details.length > 0) return details
      }
    }
    return getMonthlyDetailsFromTenantBills(input.merchantId, input.billMonth)
  },

  async listDaily(input: {
    merchantId: string
    billMonth: string
  }): Promise<MerchantDailyBillListItem[]> {
    const stored = await listDailyFromStored(input.merchantId, input.billMonth)
    if (stored.length > 0) return stored
    return listDailyFromTenantBills(input.merchantId, input.billMonth)
  },

  async rollup(input: {
    merchantId: string
    billMonth?: string
  }): Promise<{ months: number; days: number }> {
    const months = await rollupMonthlyForMerchant(input.merchantId, input.billMonth)
    const days = await rollupDailyForMerchant(input.merchantId, input.billMonth)
    return { months, days }
  },
}
