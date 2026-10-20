/**
 * 商户日报/月报 rollup
 *
 * 从 tenant_bill_daily / tenant_consumption_daily_detail 聚合到 merchant_bill_daily / merchant_bill。
 *
 * 金额口径唯一依据：docs/design/merchant-open-items-design.md「最终资金口径」（Q7-Q11 定稿）。
 */

import 'server-only'

import { db } from '@/lib/db'
import { crmLog, crmError } from '@/lib/server/dataaccess/crm/logger'
import {
  merchant,
  merchantAccountLedger,
  merchantBillDaily,
  merchantBillMonthly,
  merchantProductPurchasePrice,
  merchantPurchasePrice,
  merchantTenantContribution,
  platformCardListPrice,
  tenantBillDaily,
  tenantConsumptionDailyDetail,
} from '@workspace/db/schema'
import { eq, sql, and, isNull } from 'drizzle-orm'
import {
  notifyMissingPurchasePrice,
  type MissingPriceAlertInput,
} from '@/lib/server/dataaccess/merchant/merchant-rollup-alert'

function newId() {
  return crypto.randomUUID()
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function rateOrNull(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function convertPriceToHourlyRate(price: number, billingUnit: string): number {
  switch (billingUnit) {
    case 'hour':
      return price
    case 'day':
      return price / 24
    case 'week':
      return price / (24 * 7)
    case 'month':
      return price / (24 * 30)
    default:
      crmError(
        'merchant-rollup.convertPrice',
        `unknown billingUnit: ${billingUnit}`,
        new Error('unknown billingUnit'),
      )
      return price
  }
}

export async function loadHourlyListPrices(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      gpuCardTypeId: platformCardListPrice.gpuCardTypeId,
      productLine: platformCardListPrice.productLine,
      sellPrice: platformCardListPrice.sellPrice,
      billingUnit: platformCardListPrice.billingUnit,
    })
    .from(platformCardListPrice)
    .where(
      and(eq(platformCardListPrice.status, 'active'), isNull(platformCardListPrice.effectiveTo)),
    )

  const map = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.gpuCardTypeId}::${row.productLine}`
    if (map.has(key) && row.billingUnit !== 'hour') continue
    map.set(key, convertPriceToHourlyRate(toNum(row.sellPrice), row.billingUnit))
  }
  return map
}

export type CostBreakdown = {
  platformCost: number
  couponCost: number
  discountAmount: number
  missingProductLines: string[]
}

export async function computeDailyCosts(input: {
  merchantId: string
  fundingMode: string
  rollupDate: string
  listPrices: Map<string, number>
}): Promise<CostBreakdown> {
  const { merchantId, fundingMode, rollupDate, listPrices } = input

  const consumptionDetails = await db
    .select({
      totalAmount: tenantConsumptionDailyDetail.totalAmount,
      unitPrice: tenantConsumptionDailyDetail.unitPrice,
      priceSource: tenantConsumptionDailyDetail.priceSource,
      totalCardHours: tenantConsumptionDailyDetail.totalCardHours,
      productLine: tenantConsumptionDailyDetail.productLine,
      dataCenterId: tenantConsumptionDailyDetail.dataCenterId,
      gpuCardTypeId: tenantConsumptionDailyDetail.gpuCardTypeId,
    })
    .from(tenantConsumptionDailyDetail)
    .where(
      and(
        eq(tenantConsumptionDailyDetail.merchantId, merchantId),
        eq(tenantConsumptionDailyDetail.usageDate, rollupDate),
      ),
    )

  const productPrices = await db
    .select({
      productLine: merchantProductPurchasePrice.productLine,
      pricingModel: merchantProductPurchasePrice.pricingModel,
      commissionRate: merchantProductPurchasePrice.commissionRate,
      fixedUnitPrice: merchantProductPurchasePrice.fixedUnitPrice,
    })
    .from(merchantProductPurchasePrice)
    .where(
      and(
        eq(merchantProductPurchasePrice.merchantId, merchantId),
        eq(merchantProductPurchasePrice.status, 'active'),
        isNull(merchantProductPurchasePrice.effectiveTo),
      ),
    )
  const productPriceMap = new Map(productPrices.map((row) => [row.productLine, row]))

  const missing = new Set<string>()
  let platformCost = 0
  let discountAmount = 0

  const applyProductPrice = (productLine: string, revenue: number, unitPrice: number) => {
    const price = productPriceMap.get(productLine)
    if (!price) {
      missing.add(productLine)
      return
    }
    if (price.pricingModel === 'revenue_share') {
      const rate = rateOrNull(price.commissionRate)
      if (rate == null) {
        missing.add(productLine)
        return
      }
      platformCost += revenue * (1 - rate)
      return
    }
    const fixedUnitPrice = toNum(price.fixedUnitPrice)
    if (unitPrice <= 0 || fixedUnitPrice <= 0) {
      missing.add(productLine)
      return
    }
    platformCost += revenue * (fixedUnitPrice / unitPrice)
  }

  if (fundingMode === 'commission') {
    for (const detail of consumptionDetails) {
      const revenue = toNum(detail.totalAmount)
      if (revenue <= 0) continue
      applyProductPrice(detail.productLine, revenue, toNum(detail.unitPrice))
    }
  } else {
    const purchasePrices = await db
      .select({
        dataCenterId: merchantPurchasePrice.dataCenterId,
        gpuCardTypeId: merchantPurchasePrice.gpuCardTypeId,
        productLine: merchantPurchasePrice.productLine,
        purchasePrice: merchantPurchasePrice.purchasePrice,
        billingUnit: merchantPurchasePrice.billingUnit,
      })
      .from(merchantPurchasePrice)
      .where(
        and(
          eq(merchantPurchasePrice.merchantId, merchantId),
          eq(merchantPurchasePrice.status, 'active'),
          isNull(merchantPurchasePrice.effectiveTo),
        ),
      )

    const cardPriceMap = new Map<string, { price: number; billingUnit: string }>()
    for (const row of purchasePrices) {
      cardPriceMap.set(`${row.dataCenterId}::${row.gpuCardTypeId}::${row.productLine}`, {
        price: toNum(row.purchasePrice),
        billingUnit: row.billingUnit,
      })
    }

    for (const detail of consumptionDetails) {
      const revenue = toNum(detail.totalAmount)
      const cardHours = toNum(detail.totalCardHours)

      if (cardHours > 0) {
        const priceInfo = cardPriceMap.get(
          `${detail.dataCenterId}::${detail.gpuCardTypeId}::${detail.productLine}`,
        )
        if (!priceInfo) {
          missing.add(detail.productLine)
          continue
        }
        platformCost += cardHours * convertPriceToHourlyRate(priceInfo.price, priceInfo.billingUnit)
        continue
      }

      if (revenue <= 0) continue
      applyProductPrice(detail.productLine, revenue, toNum(detail.unitPrice))
    }
  }

  for (const detail of consumptionDetails) {
    if (detail.priceSource !== 'sales') continue
    const cardHours = toNum(detail.totalCardHours)
    if (cardHours <= 0 || !detail.gpuCardTypeId) continue
    const unitPrice = toNum(detail.unitPrice)
    if (unitPrice <= 0) continue
    const listHourly = listPrices.get(`${detail.gpuCardTypeId}::${detail.productLine}`)
    if (listHourly === undefined) continue
    const gap = listHourly - unitPrice
    if (gap > 0) discountAmount += gap * cardHours
  }

  const [redeemAgg] = await db
    .select({
      amount: sql<string>`coalesce(sum(${merchantAccountLedger.amount}), 0)::text`,
    })
    .from(merchantAccountLedger)
    .where(
      and(
        eq(merchantAccountLedger.merchantId, merchantId),
        eq(merchantAccountLedger.refType, 'voucher_redeem'),
        sql`date(${merchantAccountLedger.occurredAt}) = ${rollupDate}`,
      ),
    )

  return {
    platformCost,
    couponCost: toNum(redeemAgg?.amount),
    discountAmount,
    missingProductLines: [...missing],
  }
}

/**
 * 商户日报表 rollup：从 tenant_bill_daily 聚合到 merchant_bill_daily
 *
 * @param rollupDate 账单日期 YYYY-MM-DD (自然日)
 */
export async function runMerchantDailyRollup(rollupDate: string): Promise<{ ok: true; rows: number }> {
  const now = new Date()
  const usageMonth = rollupDate.slice(0, 7)
  const listPrices = await loadHourlyListPrices()

  const merchantIds = await db
    .selectDistinct({ merchantId: tenantBillDaily.merchantId })
    .from(tenantBillDaily)
    .where(eq(tenantBillDaily.usageDate, rollupDate))

  const alerts: MissingPriceAlertInput[] = []
  let rows = 0

  for (const { merchantId } of merchantIds) {
    const [revenueAgg] = await db
      .select({
        totalAmount: sql<string>`coalesce(sum(${tenantBillDaily.totalAmount}), 0)::text`,
        couponAmount: sql<string>`coalesce(sum(${tenantBillDaily.couponAmount}), 0)::text`,
        balanceAmount: sql<string>`coalesce(sum(${tenantBillDaily.balanceAmount}), 0)::text`,
        tenantCount: sql<number>`count(distinct ${tenantBillDaily.tenantId})::int`,
      })
      .from(tenantBillDaily)
      .where(
        and(
          eq(tenantBillDaily.merchantId, merchantId),
          eq(tenantBillDaily.usageDate, rollupDate),
        ),
      )

    const totalAmount = toNum(revenueAgg?.totalAmount)
    const couponAmount = toNum(revenueAgg?.couponAmount)
    const balanceAmount = toNum(revenueAgg?.balanceAmount)
    const tenantCount = revenueAgg?.tenantCount ?? 0

    const [merchantRow] = await db
      .select({ fundingMode: merchant.fundingMode, name: merchant.name })
      .from(merchant)
      .where(eq(merchant.id, merchantId))
    const fundingMode = merchantRow?.fundingMode ?? 'prepay'

    const costs = await computeDailyCosts({
      merchantId,
      fundingMode,
      rollupDate,
      listPrices,
    })

    if (costs.missingProductLines.length > 0) {
      alerts.push({
        rollupDate,
        merchantId,
        merchantName: merchantRow?.name ?? merchantId,
        missingProductLines: costs.missingProductLines,
      })
      crmLog('merchant-rollup.missingPrice', 'no purchase price found', {
        merchantId,
        rollupDate,
        productLines: costs.missingProductLines,
      })
    }

    const grossProfit =
      costs.missingProductLines.length > 0
        ? 0
        : fundingMode === 'commission'
          ? totalAmount - costs.platformCost - couponAmount
          : totalAmount - costs.platformCost - costs.couponCost

    await db
      .insert(merchantBillDaily)
      .values({
        id: newId(),
        merchantId,
        billDate: rollupDate,
        usageDate: rollupDate,
        usageMonth,
        totalAmount: String(totalAmount),
        platformCost: String(costs.platformCost),
        grossProfit: String(grossProfit),
        couponAmount: String(couponAmount),
        couponCost: String(costs.couponCost),
        discountAmount: String(costs.discountAmount),
        balanceAmount: String(balanceAmount),
        tenantCount,
        source: 'rollup_from_tenant',
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [merchantBillDaily.merchantId, merchantBillDaily.billDate],
        set: {
          totalAmount: String(totalAmount),
          platformCost: String(costs.platformCost),
          grossProfit: String(grossProfit),
          couponAmount: String(couponAmount),
          couponCost: String(costs.couponCost),
          discountAmount: String(costs.discountAmount),
          balanceAmount: String(balanceAmount),
          tenantCount,
          syncedAt: now,
          updatedAt: now,
        },
      })

    rows++
  }

  await notifyMissingPurchasePrice(alerts)

  crmLog('merchant-rollup.daily', 'ok', { rollupDate, rows })
  return { ok: true, rows }
}

/**
 * 商户月报表 rollup：从 merchant_bill_daily 聚合到 merchant_bill (monthly)
 *
 * @param billMonth 账期 YYYY-MM
 */
export async function runMerchantMonthlyRollup(billMonth: string): Promise<{ ok: true; rows: number }> {
  const now = new Date()

  const monthlyAgg = await db
    .select({
      merchantId: merchantBillDaily.merchantId,
      totalAmount: sql<string>`coalesce(sum(${merchantBillDaily.totalAmount}), 0)::text`,
      platformCost: sql<string>`coalesce(sum(${merchantBillDaily.platformCost}), 0)::text`,
      grossProfit: sql<string>`coalesce(sum(${merchantBillDaily.grossProfit}), 0)::text`,
      couponAmount: sql<string>`coalesce(sum(${merchantBillDaily.couponAmount}), 0)::text`,
      couponCost: sql<string>`coalesce(sum(${merchantBillDaily.couponCost}), 0)::text`,
      discountAmount: sql<string>`coalesce(sum(${merchantBillDaily.discountAmount}), 0)::text`,
      balanceAmount: sql<string>`coalesce(sum(${merchantBillDaily.balanceAmount}), 0)::text`,
      tenantCount: sql<number>`count(distinct ${merchantBillDaily.tenantCount})::int`,
    })
    .from(merchantBillDaily)
    .where(eq(merchantBillDaily.usageMonth, billMonth))
    .groupBy(merchantBillDaily.merchantId)

  let rows = 0
  for (const agg of monthlyAgg) {
    const totalAmount = toNum(agg.totalAmount)
    const platformCost = toNum(agg.platformCost)
    const grossProfit = toNum(agg.grossProfit)
    const couponAmount = toNum(agg.couponAmount)
    const couponCost = toNum(agg.couponCost)
    const discountAmount = toNum(agg.discountAmount)
    const balanceAmount = toNum(agg.balanceAmount)

    await db
      .insert(merchantBillMonthly)
      .values({
        id: newId(),
        merchantId: agg.merchantId,
        billMonth,
        totalAmount: String(totalAmount),
        platformCost: String(platformCost),
        grossProfit: String(grossProfit),
        couponAmount: String(couponAmount),
        couponCost: String(couponCost),
        discountAmount: String(discountAmount),
        balanceAmount: String(balanceAmount),
        tenantCount: agg.tenantCount,
        source: 'rollup_from_daily',
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [merchantBillMonthly.merchantId, merchantBillMonthly.billMonth],
        set: {
          totalAmount: String(totalAmount),
          platformCost: String(platformCost),
          grossProfit: String(grossProfit),
          couponAmount: String(couponAmount),
          couponCost: String(couponCost),
          discountAmount: String(discountAmount),
          balanceAmount: String(balanceAmount),
          tenantCount: agg.tenantCount,
          syncedAt: now,
          updatedAt: now,
        },
      })

    rows++
  }

  crmLog('merchant-rollup.monthly', 'ok', { billMonth, rows })
  return { ok: true, rows }
}

/**
 * 维护商户-租户贡献汇总表
 * 
 * 从 tenant_bill_daily 聚合每个租户对商户的累计贡献
 * tenants list 直接读取此表，避免 live 聚合
 * 
 * @param merchantId 商户ID
 */
export async function maintainTenantContributions(merchantId: string): Promise<{ ok: true; tenants: number }> {
  const now = new Date()

  // 从 tenant_bill_daily 聚合每个租户的累计收入
  const tenantAggs = await db
    .select({
      tenantId: tenantBillDaily.tenantId,
      totalRevenue: sql<string>`coalesce(sum(${tenantBillDaily.totalAmount}), 0)::text`,
      firstBillDate: sql<string>`min(${tenantBillDaily.usageDate})::date`,
      lastBillDate: sql<string>`max(${tenantBillDaily.usageDate})::date`,
      billDaysCount: sql<number>`count(distinct ${tenantBillDaily.usageDate})::int`,
    })
    .from(tenantBillDaily)
    .where(eq(tenantBillDaily.merchantId, merchantId))
    .groupBy(tenantBillDaily.tenantId)

  let tenantCount = 0
  for (const agg of tenantAggs) {
    const totalRevenue = toNum(agg.totalRevenue)
    
    // TODO: 计算 totalCost（需要从 tenant_consumption_daily_detail × purchase_price）
    // 暂时设为 0，后续可扩展
    const totalCost = 0
    const totalProfit = totalRevenue - totalCost

    await db
      .insert(merchantTenantContribution)
      .values({
        id: newId(),
        merchantId,
        tenantId: agg.tenantId,
        totalRevenue: String(totalRevenue),
        totalCost: String(totalCost),
        totalProfit: String(totalProfit),
        firstBillDate: agg.firstBillDate,
        lastBillDate: agg.lastBillDate,
        billDaysCount: agg.billDaysCount,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [merchantTenantContribution.merchantId, merchantTenantContribution.tenantId],
        set: {
          totalRevenue: String(totalRevenue),
          totalCost: String(totalCost),
          totalProfit: String(totalProfit),
          firstBillDate: agg.firstBillDate,
          lastBillDate: agg.lastBillDate,
          billDaysCount: agg.billDaysCount,
          syncedAt: now,
          updatedAt: now,
        },
      })

    tenantCount++
  }

  crmLog('merchant-rollup.tenantContributions', 'ok', { merchantId, tenantCount })
  return { ok: true, tenants: tenantCount }
}

/**
 * 日切管道：运行当日日报 + 当月月报 rollup + 租户贡献汇总
 * 
 * @param statDate 统计日期 YYYY-MM-DD
 */
export async function runMerchantDailyPipeline(statDate: string): Promise<void> {
  try {
    // Step 1: 日报 rollup
    await runMerchantDailyRollup(statDate)
    
    // Step 2: 月报 rollup
    const billMonth = statDate.slice(0, 7)
    await runMerchantMonthlyRollup(billMonth)
    
    // Step 3: 维护所有商户的租户贡献汇总
    const merchantIds = await db
      .selectDistinct({ merchantId: tenantBillDaily.merchantId })
      .from(tenantBillDaily)
      .where(eq(tenantBillDaily.usageDate, statDate))
    
    for (const { merchantId } of merchantIds) {
      await maintainTenantContributions(merchantId)
    }
  } catch (e) {
    crmError('merchant-rollup.dailyPipeline', 'failed', e, { statDate })
    throw e
  }
}

/**
 * 回填工具：批量回填指定日期范围的 merchant_bill_daily
 * 
 * @param startDate 起始日期 YYYY-MM-DD (含)
 * @param endDate 结束日期 YYYY-MM-DD (含)
 */
export async function backfillMerchantDaily(
  startDate: string,
  endDate: string,
): Promise<{ ok: true; daysProcessed: number }> {
  const start = new Date(startDate)
  const end = new Date(endDate)
  let daysProcessed = 0

  const current = new Date(start)
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0]
    await runMerchantDailyRollup(dateStr!)
    daysProcessed++
    current.setDate(current.getDate() + 1)
  }

  crmLog('merchant-rollup.backfillDaily', 'ok', { startDate, endDate, daysProcessed })
  return { ok: true, daysProcessed }
}

/**
 * 回填工具：批量回填指定月份范围的 merchant_bill
 * 
 * @param startMonth 起始月份 YYYY-MM (含)
 * @param endMonth 结束月份 YYYY-MM (含)
 */
export async function backfillMerchantMonthly(
  startMonth: string,
  endMonth: string,
): Promise<{ ok: true; monthsProcessed: number }> {
  const months: string[] = []
  const [startY, startM] = startMonth.split('-').map(Number)
  const [endY, endM] = endMonth.split('-').map(Number)

  let y = startY!
  let m = startM!
  while (y < endY! || (y === endY && m <= endM!)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }

  for (const month of months) {
    await runMerchantMonthlyRollup(month)
  }

  crmLog('merchant-rollup.backfillMonthly', 'ok', { startMonth, endMonth, monthsProcessed: months.length })
  return { ok: true, monthsProcessed: months.length }
}
