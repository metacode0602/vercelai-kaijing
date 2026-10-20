import { db } from '@/lib/db'
import {
  billMonthFromPlatformPeriod,
  detailLineType,
  dueDateForBillMonth,
  mapPayChannel,
  mapPlatformProductLine,
  mapRechargeStatus,
  mapPlatformTaskType,
  parsePlatformDateTime,
  platformBillingValueToMoneyString,
  platformBillingValueToRmb,
  platformRechargeAmountToMoneyString,
  usageDateFromPlatformPeriod,
  usageMonthFromDate,
  validateBillingDateRange,
  type ApiQueryTimes,
  toSlidingWindowQueryTimes,
} from '@/lib/crm/tenant-billing-import-utils'
import { syncCouponsForTenant } from '@/lib/server/dataaccess/crm/coupon-sync'
import { crmLog, crmWarn } from '@/lib/server/dataaccess/crm/logger'
import { getTenantMerchantId } from '@/lib/server/dataaccess/merchant/merchant-resolve'
import {
  fetchPlatformBillDetailsForOverview,
  fetchPlatformDailyBillingRecords,
  fetchPlatformDailyTaskSummaries,
  fetchPlatformDailyUsageBills,
  fetchPlatformMonthlyBills,
  fetchPlatformRecharges,
  type PlatformBillDetailRecord,
  type PlatformMonthlyBillRecord,
} from '@/lib/server/integrations/suanli-billing-api'
import {
  BILLING_API_PAGE_DELAY_MS,
  BILLING_IMPORT_SECTION_DELAY_MS,
  delayBillingApi,
} from '@/lib/server/integrations/suanli-billing-api-throttle'
import type { PlatformImportBillingItemResult } from '@/lib/types/platform-tenant-import'
import type { TenantBillingImportCommitSectionResult } from '@/lib/types/tenant-billing-import'
import {
  consumptionUsageDaily,
  recharge,
  tenantBill,
  tenantBillDaily,
  tenantBillDailyDetail,
  tenantBillDetail,
  tenantConsumptionDailyDetail,
} from '@workspace/db/schema'
import { and, eq } from 'drizzle-orm'

export type BillingImportScope = 'full' | 'daily_bills_only' | 'coupons_only'

const DETAIL_DC_CODE_NA = '_na'
const DETAIL_DC_NAME_NA = '—'
const DETAIL_GPU_CODE_NA = '_na'

export type BillingStreamCommitResult = {
  dailyBills: TenantBillingImportCommitSectionResult
  dailyBillDetails: TenantBillingImportCommitSectionResult
  monthlyBills: TenantBillingImportCommitSectionResult
  billDetails: TenantBillingImportCommitSectionResult
  recharges: TenantBillingImportCommitSectionResult
  dailyUsageBills: TenantBillingImportCommitSectionResult
  dailyConsumptionDetails: TenantBillingImportCommitSectionResult
  coupons: TenantBillingImportCommitSectionResult
}

function newId(): string {
  return crypto.randomUUID()
}

function emptySection(): TenantBillingImportCommitSectionResult {
  return { created: 0, updated: 0, upserted: 0, errors: [] }
}

function emptyStreamResult(): BillingStreamCommitResult {
  return {
    dailyBills: emptySection(),
    dailyBillDetails: { ...emptySection(), deleted: 0 },
    monthlyBills: emptySection(),
    billDetails: { ...emptySection(), deleted: 0 },
    recharges: emptySection(),
    dailyUsageBills: emptySection(),
    dailyConsumptionDetails: emptySection(),
    coupons: emptySection(),
  }
}

type DailyDetailLine = {
  productLine: string
  resourceName: string
  amount: string
  couponAmount: string
  balanceAmount: string
  type: string
}

function linesFromBillDetail(detail: PlatformBillDetailRecord): DailyDetailLine[] {
  const lines: DailyDetailLine[] = []
  for (const [platformKey, values] of Object.entries(detail.amounts ?? {})) {
    const billingRaw = values.billing_value ?? 0
    const discountRaw = values.discount_value ?? 0
    if (billingRaw === 0 && discountRaw === 0) continue

    const { productLine, resourceName } = mapPlatformProductLine(platformKey)
    lines.push({
      productLine,
      resourceName,
      amount: platformBillingValueToMoneyString(billingRaw),
      couponAmount: platformBillingValueToMoneyString(discountRaw),
      balanceAmount: platformBillingValueToRmb(billingRaw - discountRaw).toFixed(4),
      type: detailLineType(productLine),
    })
  }
  return lines
}

export async function commitDailyBillDay(input: {
  tenantId: string
  customerId: string | null
  merchantId: string
  dayRow: PlatformMonthlyBillRecord
  details: PlatformBillDetailRecord[]
}): Promise<{ created: boolean; detailRows: number }> {
  const usageDate = usageDateFromPlatformPeriod(input.dayRow.start_time)
  const usageMonth = usageMonthFromDate(usageDate)
  const periodStart = parsePlatformDateTime(input.dayRow.start_time)
  const periodEnd = parsePlatformDateTime(input.dayRow.end_time)
  if (!periodStart || !periodEnd) {
    throw new Error(`无效账期：${input.dayRow.start_time}`)
  }

  const totalAmount = platformBillingValueToMoneyString(input.dayRow.total_billing_value)
  const couponAmount = platformBillingValueToMoneyString(input.dayRow.total_discount_value)
  const balanceAmount = platformBillingValueToRmb(
    input.dayRow.total_billing_value - input.dayRow.total_discount_value,
  ).toFixed(4)

  const detailLines = input.details.flatMap((detail) => linesFromBillDetail(detail))

  return db.transaction(async (tx) => {
    const existing = await tx.query.tenantBillDaily.findFirst({
      where: and(
        eq(tenantBillDaily.tenantId, input.tenantId),
        eq(tenantBillDaily.usageDate, usageDate),
      ),
      columns: { id: true },
    })

    const headerPayload = {
      customerId: input.customerId,
      tenantId: input.tenantId,
      merchantId: input.merchantId,
      usageDate,
      usageMonth,
      totalAmount,
      balanceAmount,
      couponAmount,
      platformPeriodStart: periodStart,
      platformPeriodEnd: periodEnd,
      syncedAt: new Date(),
    }

    let dailyBillId: string
    let created = false

    if (existing) {
      dailyBillId = existing.id
      await tx.update(tenantBillDaily).set(headerPayload).where(eq(tenantBillDaily.id, existing.id))
    } else {
      dailyBillId = newId()
      created = true
      await tx.insert(tenantBillDaily).values({ id: dailyBillId, ...headerPayload })
    }

    await tx
      .delete(tenantBillDailyDetail)
      .where(eq(tenantBillDailyDetail.dailyBillId, dailyBillId))

    for (const line of detailLines) {
      await tx.insert(tenantBillDailyDetail).values({
        id: newId(),
        dailyBillId,
        merchantId: input.merchantId,
        tenantId: input.tenantId,
        usageDate,
        usageMonth,
        productLine: line.productLine,
        resourceName: line.resourceName,
        amount: line.amount,
        balanceAmount: line.balanceAmount,
        couponAmount: line.couponAmount,
        type: line.type,
      })
    }

    return { created, detailRows: detailLines.length }
  })
}

export async function syncDailyBillsForTenant(input: {
  tenantId: string
  customerId: string | null
  merchantId: string
  platformTenantId: string
  startDate: string
  endDate: string
  traceId: string
  queryTimes?: ApiQueryTimes
}): Promise<Pick<BillingStreamCommitResult, 'dailyBills' | 'dailyBillDetails'>> {
  const result: Pick<BillingStreamCommitResult, 'dailyBills' | 'dailyBillDetails'> = {
    dailyBills: emptySection(),
    dailyBillDetails: { ...emptySection(), deleted: 0 },
  }

  await delayBillingApi(BILLING_IMPORT_SECTION_DELAY_MS, 'section:daily_bills')

  let overviewRows: PlatformMonthlyBillRecord[] = []
  try {
    overviewRows = await fetchPlatformDailyBillingRecords({
      platformTenantId: input.platformTenantId,
      startDate: input.startDate,
      endDate: input.endDate,
      traceId: input.traceId,
      queryTimes: input.queryTimes,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : '日账单拉取失败'
    result.dailyBills.errors.push({ key: 'overview', message })
    crmWarn('tenant-billing-import-stream', 'daily overview failed', {
      traceId: input.traceId,
      err: message,
    })
    return result
  }

  for (let i = 0; i < overviewRows.length; i++) {
    const dayRow = overviewRows[i]!
    const usageDate = usageDateFromPlatformPeriod(dayRow.start_time)

    if (i > 0) {
      await delayBillingApi(BILLING_API_PAGE_DELAY_MS, 'daily_bill:interval')
    }

    try {
      const details = await fetchPlatformBillDetailsForOverview({
        platformTenantId: input.platformTenantId,
        overviewRows: [dayRow],
        traceId: input.traceId,
        range: 'day',
      })

      const { created, detailRows } = await commitDailyBillDay({
        tenantId: input.tenantId,
        customerId: input.customerId,
        merchantId: input.merchantId,
        dayRow,
        details,
      })

      if (created) {
        result.dailyBills.created += 1
      } else {
        result.dailyBills.updated += 1
      }
      result.dailyBillDetails.created += detailRows
    } catch (e) {
      const message = e instanceof Error ? e.message : '日账单写入失败'
      result.dailyBills.errors.push({ key: usageDate, message })
      crmWarn('tenant-billing-import-stream', 'daily day failed', {
        traceId: input.traceId,
        usageDate,
        err: message,
      })
    }
  }

  return result
}

async function streamMonthlyBillsSection(input: {
  tenantId: string
  customerId: string | null
  merchantId: string
  platformTenantId: string
  startDate: string
  endDate: string
  traceId: string
  queryTimes?: ApiQueryTimes
}): Promise<Pick<BillingStreamCommitResult, 'monthlyBills' | 'billDetails'>> {
  const result: Pick<BillingStreamCommitResult, 'monthlyBills' | 'billDetails'> = {
    monthlyBills: emptySection(),
    billDetails: { ...emptySection(), deleted: 0 },
  }

  let billRecords: PlatformMonthlyBillRecord[] = []
  try {
    billRecords = await fetchPlatformMonthlyBills({
      platformTenantId: input.platformTenantId,
      startDate: input.startDate,
      endDate: input.endDate,
      traceId: input.traceId,
      queryTimes: input.queryTimes,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : '月度账单拉取失败'
    result.monthlyBills.errors.push({ key: 'overview', message })
    return result
  }

  for (let i = 0; i < billRecords.length; i++) {
    const record = billRecords[i]!
    const billMonth = billMonthFromPlatformPeriod(record.start_time)

    if (i > 0) {
      await delayBillingApi(BILLING_API_PAGE_DELAY_MS, 'monthly_bill:interval')
    }

    try {
      const details = await fetchPlatformBillDetailsForOverview({
        platformTenantId: input.platformTenantId,
        overviewRows: [record],
        traceId: input.traceId,
        range: 'month',
      })
      const detailLines = details.flatMap((detail) => linesFromBillDetail(detail))

      await db.transaction(async (tx) => {
        const totalAmount = platformBillingValueToMoneyString(record.total_billing_value)
        const couponAmount = platformBillingValueToMoneyString(record.total_discount_value)
        const balanceAmount = platformBillingValueToRmb(
          record.total_billing_value - record.total_discount_value,
        ).toFixed(4)
        const periodStart = parsePlatformDateTime(record.start_time)
        const periodEnd = parsePlatformDateTime(record.end_time)

        const existing = await tx.query.tenantBill.findFirst({
          where: and(eq(tenantBill.tenantId, input.tenantId), eq(tenantBill.billMonth, billMonth)),
          columns: { id: true },
        })

        const payload = {
          customerId: input.customerId,
          tenantId: input.tenantId,
          merchantId: input.merchantId,
          projectId: null,
          billMonth,
          totalAmount,
          balanceAmount,
          couponAmount,
          status: 'paid',
          dueDate: dueDateForBillMonth(billMonth),
          paidAt: periodEnd,
          platformPeriodStart: periodStart,
          platformPeriodEnd: periodEnd,
        }

        let billId: string
        if (existing) {
          billId = existing.id
          await tx.update(tenantBill).set(payload).where(eq(tenantBill.id, existing.id))
          result.monthlyBills.updated += 1
        } else {
          billId = newId()
          await tx.insert(tenantBill).values({ id: billId, ...payload })
          result.monthlyBills.created += 1
        }

        const deleted = await tx
          .delete(tenantBillDetail)
          .where(eq(tenantBillDetail.billId, billId))
          .returning({ id: tenantBillDetail.id })
        result.billDetails.deleted = (result.billDetails.deleted ?? 0) + deleted.length

        for (const line of detailLines) {
          await tx.insert(tenantBillDetail).values({
            id: newId(),
            billId,
            merchantId: input.merchantId,
            productLine: line.productLine,
            resourceName: line.resourceName,
            usage: null,
            unit: null,
            unitPrice: null,
            amount: line.amount,
            balanceAmount: line.balanceAmount,
            couponAmount: line.couponAmount,
            type: line.type,
          })
          result.billDetails.created += 1
        }
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : '月度账单写入失败'
      result.monthlyBills.errors.push({ key: billMonth, message })
    }
  }

  return result
}

async function streamRechargesSection(input: {
  tenantId: string
  merchantId: string
  platformTenantId: string
  startDate: string
  endDate: string
  traceId: string
  queryTimes?: ApiQueryTimes
}): Promise<Pick<BillingStreamCommitResult, 'recharges'>> {
  const result: Pick<BillingStreamCommitResult, 'recharges'> = {
    recharges: emptySection(),
  }

  await delayBillingApi(BILLING_IMPORT_SECTION_DELAY_MS, 'section:recharges')

  let records: Awaited<ReturnType<typeof fetchPlatformRecharges>> = []
  try {
    records = await fetchPlatformRecharges({
      platformTenantId: input.platformTenantId,
      startDate: input.startDate,
      endDate: input.endDate,
      traceId: input.traceId,
      queryTimes: input.queryTimes,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : '充值列表拉取失败'
    result.recharges.errors.push({ key: 'recharges', message })
    return result
  }

  for (const record of records) {
    try {
      const amount = platformRechargeAmountToMoneyString(record.total_amount)
      const existing = await db.query.recharge.findFirst({
        where: eq(recharge.transactionId, record.order_id),
        columns: { id: true },
      })
      const payload = {
        tenantId: input.tenantId,
        merchantId: input.merchantId,
        projectId: null,
        amount,
        paymentMethod: mapPayChannel(record.pay_channel),
        status: mapRechargeStatus(record.status),
        transactionId: record.order_id,
        refundAmount: '0',
        remark: record.remark ?? null,
        createdAt: parsePlatformDateTime(record.create_time) ?? new Date(),
        completedAt: record.last_update_time
          ? parsePlatformDateTime(record.last_update_time)
          : null,
      }

      if (existing) {
        await db.update(recharge).set(payload).where(eq(recharge.id, existing.id))
        result.recharges.updated += 1
      } else {
        await db.insert(recharge).values({ id: `recharge-${record.id}`, ...payload })
        result.recharges.created += 1
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '充值写入失败'
      result.recharges.errors.push({ key: record.order_id, message })
    }
  }

  return result
}

async function streamPodDailyUsageSection(input: {
  tenantId: string
  customerId: string | null
  merchantId: string
  platformTenantId: string
  startDate: string
  endDate: string
  traceId: string
  queryTimes?: ApiQueryTimes
}): Promise<Pick<BillingStreamCommitResult, 'dailyUsageBills' | 'dailyConsumptionDetails'>> {
  const result: Pick<BillingStreamCommitResult, 'dailyUsageBills' | 'dailyConsumptionDetails'> = {
    dailyUsageBills: emptySection(),
    dailyConsumptionDetails: emptySection(),
  }

  await delayBillingApi(BILLING_IMPORT_SECTION_DELAY_MS, 'section:daily_usage_bills')

  let dailyUsageRecords: Awaited<ReturnType<typeof fetchPlatformDailyUsageBills>> = []
  try {
    dailyUsageRecords = await fetchPlatformDailyUsageBills({
      platformTenantId: input.platformTenantId,
      startDate: input.startDate,
      endDate: input.endDate,
      traceId: input.traceId,
      queryTimes: input.queryTimes,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : '每日用量拉取失败'
    result.dailyUsageBills.errors.push({ key: 'daily_usage', message })
    return result
  }

  for (let i = 0; i < dailyUsageRecords.length; i++) {
    const row = dailyUsageRecords[i]!
    const usageDate = usageDateFromPlatformPeriod(row.start_time)
    const { productLine: mappedProductLine } = mapPlatformTaskType(row.task_type)

    try {
      const amount = platformBillingValueToMoneyString(row.total_billing_value)
      const voucherAmount = platformBillingValueToMoneyString(row.total_discount_value)
      const balanceAmount = platformBillingValueToRmb(
        row.total_billing_value - row.total_discount_value,
      ).toFixed(4)
      const rowId = `usage-daily-${input.tenantId}-${usageDate}-${mappedProductLine}`
      const payload = {
        customerId: input.customerId,
        tenantId: input.tenantId,
        merchantId: input.merchantId,
        usageDate,
        usageMonth: usageMonthFromDate(usageDate),
        productLine: mappedProductLine,
        unit: 'day',
        amount,
        voucherAmount,
        balanceAmount,
      }

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
      result.dailyUsageBills.upserted += 1
    } catch (e) {
      const message = e instanceof Error ? e.message : '每日用量写入失败'
      result.dailyUsageBills.errors.push({ key: `${usageDate}:${mappedProductLine}`, message })
    }

    if (i > 0) {
      await delayBillingApi(BILLING_API_PAGE_DELAY_MS, 'daily_task_summary:interval')
    }

    try {
      const tasks = await fetchPlatformDailyTaskSummaries({
        platformTenantId: input.platformTenantId,
        taskType: row.task_type,
        startTime: row.start_time,
        endTime: row.end_time,
        traceId: input.traceId,
      })

      for (const task of tasks) {
        if (!task.task_id) continue
        try {
          const totalAmount = platformBillingValueToMoneyString(task.billing_value)
          const voucherAmount = platformBillingValueToMoneyString(task.discount_value)
          const balanceAmount = platformBillingValueToRmb(
            task.billing_value - task.discount_value,
          ).toFixed(4)
          const idempotencyKey = `${input.tenantId}|${usageDate}|${mappedProductLine}|task|${task.task_id}`
          const detailRowId = `usage-detail-${input.tenantId}-${usageDate}-${mappedProductLine}-${task.task_id}`
          // P0-8：上游给了消费维度才能做时点计价。这里如实落库 ——
          // 维度齐全就交给 reprice 按 usageDate 解析商户销售价；
          // 缺失就写 null，由补价流程标成 unresolvable，绝不猜价。
          const hasDimensions = Boolean(task.data_center_id && task.gpu_card_type_id)
          const cardHours =
            task.card_hours === null || task.card_hours === undefined
              ? null
              : task.card_hours.toFixed(4)
          const payload = {
            customerId: input.customerId,
            tenantId: input.tenantId,
            merchantId: input.merchantId,
            usageDate,
            usageMonth: usageMonthFromDate(usageDate),
            productLine: mappedProductLine,
            dataCenterId: task.data_center_id ?? null,
            // code/name 列是 NOT NULL，维度缺失时沿用 'NA' 占位（与既有约定一致），
            // 真正的可空维度是 dataCenterId / gpuCardTypeId —— 补价只看这两个。
            dataCenterCode: task.data_center_code ?? DETAIL_DC_CODE_NA,
            dataCenterName: task.data_center_name ?? DETAIL_DC_NAME_NA,
            gpuCardTypeId: task.gpu_card_type_id ?? null,
            gpuCardTypeCode: task.gpu_card_type_code ?? DETAIL_GPU_CODE_NA,
            gpuCardTypeName: task.gpu_card_type_name ?? null,
            totalCardHours: cardHours,
            platformTaskId: String(task.task_id),
            taskName: task.task_name || null,
            totalAmount,
            voucherAmount,
            balanceAmount,
            source: 'platform_sync' as const,
            platformIdempotencyKey: idempotencyKey,
            // priceSource 只能取 sales / list，由 repriceConsumptionDailyDetails
            // 按时点解析后写入 —— 那是商户自定价的权威来源。上游给的
            // unit_price / list_price 保留在 rawJson 里做交叉校验，
            // 但不直接当 priceSource，否则会凭空多出第三种来源让对账分不清。
            unitPrice: null,
            priceSource: null,
            pricingResolveStatus: hasDimensions
              ? ('pending' as const)
              : ('unresolvable' as const),
            rawJson: task,
          }

          await db
            .insert(tenantConsumptionDailyDetail)
            .values({ id: detailRowId, ...payload })
            .onConflictDoUpdate({
              target: tenantConsumptionDailyDetail.platformIdempotencyKey,
              set: { ...payload, updatedAt: new Date() },
            })
          result.dailyConsumptionDetails.upserted += 1
        } catch (e) {
          const message = e instanceof Error ? e.message : '任务明细写入失败'
          result.dailyConsumptionDetails.errors.push({
            key: `${usageDate}:${task.task_id}`,
            message,
          })
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '任务明细拉取失败'
      result.dailyConsumptionDetails.errors.push({ key: usageDate, message })
    }
  }

  return result
}

export function formatBillingStreamSummary(
  result: BillingStreamCommitResult,
  scope: BillingImportScope,
): string {
  const parts: string[] = []
  const prefix =
    scope === 'daily_bills_only'
      ? '[仅日账单] '
      : scope === 'coupons_only'
        ? '[仅算力券] '
        : ''

  const push = (label: string, s: { created?: number; updated?: number }) => {
    const created = s.created ?? 0
    const updated = s.updated ?? 0
    if (created + updated > 0) {
      parts.push(`${label} 新增 ${created} / 更新 ${updated}`)
    }
  }
  const pushUpserted = (label: string, s: { upserted: number }) => {
    if (s.upserted > 0) {
      parts.push(`${label} 写入 ${s.upserted}`)
    }
  }

  if (scope === 'coupons_only') {
    push('算力券', result.coupons)
    const body = parts.join('；') || '无变更'
    return `${prefix}${body}`.trim()
  }

  if (scope === 'full') {
    push('月度账单', result.monthlyBills)
    if ((result.billDetails.created ?? 0) > 0) {
      parts.push(`账单明细 ${result.billDetails.created} 行`)
    }
    push('充值', result.recharges)
    push('算力券', result.coupons)
    pushUpserted('每日用量', result.dailyUsageBills)
    pushUpserted('每日任务明细', result.dailyConsumptionDetails)
  }

  push('日账单', result.dailyBills)
  if ((result.dailyBillDetails.created ?? 0) > 0) {
    parts.push(`日明细 ${result.dailyBillDetails.created} 行`)
  }

  const body = parts.join('；') || '无变更'
  return `${prefix}${body}`.trim()
}

function collectStreamErrors(result: BillingStreamCommitResult): string[] {
  return [
    ...result.monthlyBills.errors,
    ...result.billDetails.errors,
    ...result.dailyBills.errors,
    ...result.dailyBillDetails.errors,
    ...result.recharges.errors,
    ...result.coupons.errors,
    ...result.dailyUsageBills.errors,
    ...result.dailyConsumptionDetails.errors,
  ].map((e) => e.message)
}

export async function importBillingStream(input: {
  tenantId: string
  customerId: string | null
  platformTenantId: string
  tenantName: string
  startDate: string
  endDate: string
  startAt?: Date
  endAt?: Date
  scope: BillingImportScope
}): Promise<PlatformImportBillingItemResult & { streamResult?: BillingStreamCommitResult }> {
  validateBillingDateRange(input.startDate, input.endDate)
  const traceId = crypto.randomUUID().slice(0, 8)
  const queryTimes =
    input.startAt && input.endAt
      ? toSlidingWindowQueryTimes(input.startAt, input.endAt)
      : undefined
  const base = {
    platformTenantId: input.platformTenantId,
    tenantName: input.tenantName,
  }

  crmLog('tenant-billing-import-stream', 'start', {
    traceId,
    tenantId: input.tenantId,
    scope: input.scope,
    startDate: input.startDate,
    endDate: input.endDate,
  })

  const result = emptyStreamResult()
  const merchantId = await getTenantMerchantId(input.tenantId)

  try {
    if (input.scope === 'coupons_only') {
      result.coupons = await syncCouponsForTenant({
        tenantId: input.tenantId,
        platformTenantId: input.platformTenantId,
        startDate: input.startDate,
        endDate: input.endDate,
        traceId,
        queryTimes,
      })
    } else {
      if (input.scope === 'full') {
        const monthly = await streamMonthlyBillsSection({
          tenantId: input.tenantId,
          customerId: input.customerId,
          merchantId,
          platformTenantId: input.platformTenantId,
          startDate: input.startDate,
          endDate: input.endDate,
          traceId,
          queryTimes,
        })
        Object.assign(result, monthly)
      }

      const daily = await syncDailyBillsForTenant({
        tenantId: input.tenantId,
        customerId: input.customerId,
        merchantId,
        platformTenantId: input.platformTenantId,
        startDate: input.startDate,
        endDate: input.endDate,
        traceId,
        queryTimes,
      })
      Object.assign(result, daily)

      if (input.scope === 'full') {
        const recharges = await streamRechargesSection({
          tenantId: input.tenantId,
          merchantId,
          platformTenantId: input.platformTenantId,
          startDate: input.startDate,
          endDate: input.endDate,
          traceId,
          queryTimes,
        })
        Object.assign(result, recharges)

        await delayBillingApi(BILLING_IMPORT_SECTION_DELAY_MS, 'section:coupons')
        result.coupons = await syncCouponsForTenant({
          tenantId: input.tenantId,
          platformTenantId: input.platformTenantId,
          startDate: input.startDate,
          endDate: input.endDate,
          traceId,
          queryTimes,
        })

        const podDaily = await streamPodDailyUsageSection({
          tenantId: input.tenantId,
          customerId: input.customerId,
          merchantId,
          platformTenantId: input.platformTenantId,
          startDate: input.startDate,
          endDate: input.endDate,
          traceId,
          queryTimes,
        })
        Object.assign(result, podDaily)
      }
    }

    const summary = formatBillingStreamSummary(result, input.scope)
    const sectionErrors = collectStreamErrors(result)

    crmLog('tenant-billing-import-stream', 'done', {
      traceId,
      summary,
      errorCount: sectionErrors.length,
    })

    if (sectionErrors.length > 0) {
      return {
        ...base,
        success: false,
        summary,
        error: sectionErrors.join('；'),
        streamResult: result,
      }
    }

    return {
      ...base,
      success: true,
      summary,
      streamResult: result,
    }
  } catch (e) {
    return {
      ...base,
      success: false,
      error: e instanceof Error ? e.message : '账单导入失败',
      streamResult: result,
    }
  }
}
