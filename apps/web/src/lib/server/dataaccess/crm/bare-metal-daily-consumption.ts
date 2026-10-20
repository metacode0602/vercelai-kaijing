import { usageMonthFromDate } from '@/lib/crm/tenant-billing-import-utils'
import { parseMoney, toMoneyString } from '@/lib/finance/income-row-utils'
import { db } from '@/lib/db'
import { isBaremetalPayStatusPaid } from '@/lib/server/dataaccess/finance/baremetal-order-parse'
import { TENANT_METAL_PRODUCT_LINE } from '@/lib/server/dataaccess/crm/tenant-billing-lists'
import { getTenantMerchantId } from '@/lib/server/dataaccess/merchant/merchant-resolve'
import {
  bareMetalOrder,
  bareMetalOrderDevice,
  consumptionUsageDaily,
} from '@workspace/db/schema'
import { and, eq, gt, isNotNull, lt } from 'drizzle-orm'
import { crmLog, crmWarn } from './logger'

const AMOUNT_EPSILON = 0.00005

export type BareMetalDailyConsumptionSyncResult = {
  upserted: number
  deleted: number
  skipped: number
  errors: string[]
}

function addCalendarDays(dateStr: string, days: number): string {
  const [yearStr, monthStr, dayStr] = dateStr.split('-')
  const y = Number(yearStr)
  const m = Number(monthStr)
  const d = Number(dayStr)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function listCalendarDaysInclusive(startDate: string, endDate: string): string[] {
  const days: string[] = []
  let current = startDate
  while (current <= endDate) {
    days.push(current)
    current = addCalendarDays(current, 1)
  }
  return days
}

function cstDayStartMs(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00+08:00`).getTime()
}

function cstDayEndExclusiveMs(dateStr: string): number {
  return cstDayStartMs(addCalendarDays(dateStr, 1))
}

function overlapHours(rentStart: Date, rentEnd: Date, usageDate: string): number {
  const overlapStart = Math.max(rentStart.getTime(), cstDayStartMs(usageDate))
  const overlapEnd = Math.min(rentEnd.getTime(), cstDayEndExclusiveMs(usageDate))
  if (overlapEnd <= overlapStart) return 0
  return (overlapEnd - overlapStart) / 3_600_000
}

function resolveTotalHours(
  durationHours: string | null,
  rentStart: Date,
  rentEnd: Date,
): number {
  const fromDuration = parseMoney(durationHours)
  if (fromDuration > 0) return fromDuration
  const diffHours = (rentEnd.getTime() - rentStart.getTime()) / 3_600_000
  return diffHours > 0 ? diffHours : 0
}

type DayAggregate = {
  amount: number
  voucherAmount: number
  balanceAmount: number
  totalCardHours: number
  voucherCardHours: number
  balanceCardHours: number
}

function emptyDayAggregate(): DayAggregate {
  return {
    amount: 0,
    voucherAmount: 0,
    balanceAmount: 0,
    totalCardHours: 0,
    voucherCardHours: 0,
    balanceCardHours: 0,
  }
}

function computeDailyAggregates(input: {
  startDate: string
  endDate: string
  rows: Array<{
    order: typeof bareMetalOrder.$inferSelect
    device: typeof bareMetalOrderDevice.$inferSelect
  }>
}): Map<string, DayAggregate> {
  const byDate = new Map<string, DayAggregate>()
  for (const usageDate of listCalendarDaysInclusive(input.startDate, input.endDate)) {
    byDate.set(usageDate, emptyDayAggregate())
  }

  for (const { order, device } of input.rows) {
    if (!isBaremetalPayStatusPaid(order.payStatus)) continue

    const rentStart = device.rentStartsAt
    const rentEnd = device.rentEndsAt
    if (!rentStart || !rentEnd || rentStart >= rentEnd) continue

    const lineAmount = parseMoney(device.lineAmount)
    if (lineAmount <= 0) continue

    const totalHours = resolveTotalHours(device.durationHours, rentStart, rentEnd)
    if (totalHours <= 0) continue

    const gpuCount = device.gpuCount
    if (gpuCount <= 0) continue

    const finalAmount = parseMoney(order.finalAmount)
    const voucherRatio =
      finalAmount > 0
        ? Math.min(1, Math.max(0, parseMoney(order.couponAmount) / finalAmount))
        : 0

    for (const usageDate of listCalendarDaysInclusive(input.startDate, input.endDate)) {
      const hours = overlapHours(rentStart, rentEnd, usageDate)
      if (hours <= 0) continue

      const dayAmount = lineAmount * (hours / totalHours)
      const dayVoucher = dayAmount * voucherRatio
      const dayBalance = dayAmount - dayVoucher
      const dayCardHours = gpuCount * hours
      const dayVoucherCardHours = dayCardHours * voucherRatio
      const dayBalanceCardHours = dayCardHours - dayVoucherCardHours

      const agg = byDate.get(usageDate) ?? emptyDayAggregate()
      agg.amount += dayAmount
      agg.voucherAmount += dayVoucher
      agg.balanceAmount += dayBalance
      agg.totalCardHours += dayCardHours
      agg.voucherCardHours += dayVoucherCardHours
      agg.balanceCardHours += dayBalanceCardHours
      byDate.set(usageDate, agg)
    }
  }

  return byDate
}

export function formatBareMetalDailyConsumptionSummary(
  result: BareMetalDailyConsumptionSyncResult,
): string {
  if (
    result.upserted === 0 &&
    result.deleted === 0 &&
    result.errors.length === 0
  ) {
    return ''
  }
  const parts: string[] = ['裸金属日消耗']
  if (result.upserted > 0) parts.push(`写入 ${result.upserted}`)
  if (result.deleted > 0) parts.push(`删除 ${result.deleted}`)
  if (result.errors.length > 0) parts.push(`失败 ${result.errors.length}`)
  return parts.join(' ')
}

export async function syncBareMetalDailyConsumptionForTenant(input: {
  tenantId: string
  customerId: string | null
  startDate: string
  endDate: string
}): Promise<BareMetalDailyConsumptionSyncResult> {
  const result: BareMetalDailyConsumptionSyncResult = {
    upserted: 0,
    deleted: 0,
    skipped: 0,
    errors: [],
  }

  const windowStart = new Date(`${input.startDate}T00:00:00+08:00`)
  const windowEndExclusive = new Date(`${addCalendarDays(input.endDate, 1)}T00:00:00+08:00`)
  const merchantId = await getTenantMerchantId(input.tenantId)

  const rows = await db
    .select({
      order: bareMetalOrder,
      device: bareMetalOrderDevice,
    })
    .from(bareMetalOrder)
    .innerJoin(
      bareMetalOrderDevice,
      eq(bareMetalOrderDevice.bareMetalOrderId, bareMetalOrder.id),
    )
    .where(
      and(
        eq(bareMetalOrder.tenantId, input.tenantId),
        isNotNull(bareMetalOrderDevice.rentStartsAt),
        isNotNull(bareMetalOrderDevice.rentEndsAt),
        lt(bareMetalOrderDevice.rentStartsAt, windowEndExclusive),
        gt(bareMetalOrderDevice.rentEndsAt, windowStart),
      ),
    )

  const aggregates = computeDailyAggregates({
    startDate: input.startDate,
    endDate: input.endDate,
    rows,
  })

  crmLog('bare-metal-daily-consumption', 'compute done', {
    tenantId: input.tenantId,
    startDate: input.startDate,
    endDate: input.endDate,
    deviceRows: rows.length,
    days: aggregates.size,
  })

  for (const [usageDate, agg] of aggregates) {
    const hasAmount = agg.amount > AMOUNT_EPSILON

    if (!hasAmount) {
      try {
        const deletedRows = await db
          .delete(consumptionUsageDaily)
          .where(
            and(
              eq(consumptionUsageDaily.tenantId, input.tenantId),
              eq(consumptionUsageDaily.usageDate, usageDate),
              eq(consumptionUsageDaily.productLine, TENANT_METAL_PRODUCT_LINE),
            ),
          )
          .returning({ id: consumptionUsageDaily.id })
        if (deletedRows.length > 0) {
          result.deleted += deletedRows.length
        } else {
          result.skipped += 1
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : '裸金属日消耗删除失败'
        result.errors.push(`${usageDate}: ${message}`)
        crmWarn('bare-metal-daily-consumption', 'delete failed', {
          tenantId: input.tenantId,
          usageDate,
          err: message,
        })
      }
      continue
    }

    const rowId = `usage-daily-${input.tenantId}-${usageDate}-${TENANT_METAL_PRODUCT_LINE}`
    const payload = {
      customerId: input.customerId,
      tenantId: input.tenantId,
      merchantId,
      usageDate,
      usageMonth: usageMonthFromDate(usageDate),
      productLine: TENANT_METAL_PRODUCT_LINE,
      unit: 'day',
      amount: toMoneyString(agg.amount),
      voucherAmount: toMoneyString(agg.voucherAmount),
      balanceAmount: toMoneyString(agg.balanceAmount),
      totalCardHours: toMoneyString(agg.totalCardHours),
      voucherCardHours: toMoneyString(agg.voucherCardHours),
      balanceCardHours: toMoneyString(agg.balanceCardHours),
    }

    try {
      await db
        .insert(consumptionUsageDaily)
        .values({ id: rowId, ...payload })
        .onConflictDoUpdate({
          target: [
            consumptionUsageDaily.tenantId,
            consumptionUsageDaily.usageDate,
            consumptionUsageDaily.productLine,
          ],
          set: payload,
        })
      result.upserted += 1
    } catch (e) {
      const message = e instanceof Error ? e.message : '裸金属日消耗写入失败'
      result.errors.push(`${usageDate}: ${message}`)
      crmWarn('bare-metal-daily-consumption', 'upsert failed', {
        tenantId: input.tenantId,
        usageDate,
        err: message,
      })
    }
  }

  return result
}
