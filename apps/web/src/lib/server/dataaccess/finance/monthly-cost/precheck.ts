import { db } from '@/lib/db'
import { mapTenantProductLineToPlatformListPrice } from '@/lib/monthly-cost/financials'
import { usageMonthFromPeriodCode, lastDayOfUsageMonth } from '@/lib/monthly-cost/period-utils'
import {
  billingPeriod,
  gpuCardType,
  tenantRegionGpuConsumptionMonthly,
} from '@workspace/db/schema'
import { eq } from 'drizzle-orm'
import { resolvePlatformListPriceAt } from '../platform-list-price'
import { FinanceError } from '../errors'
import { formatPendingCostAllocationError } from '../cost-allocation-errors'
import { getPendingCostAllocationIssues } from '../cost-tenant-resolve'

export type MissingSellPriceEntry = {
  gpuCardTypeId: string
  gpuCardTypeName: string
  productLine: string
  billingUnit: string
  usageMonth: string
}

export function formatMissingSellPriceError(entries: MissingSellPriceEntry[]): string {
  const lines = entries.map((e, i) => {
    const pl = e.productLine === 'elastic_service' ? 'elastic_service' : e.productLine
    return `${i + 1}. 卡型 ${e.gpuCardTypeName}（${e.gpuCardTypeId}）· 产品线 ${pl} · 租期 ${e.billingUnit} · 结算月 ${e.usageMonth} 末快照`
  })
  return [
    '平台售价分支缺少卡型销售单价，无法计算。请在「平台定价」维护以下条目后重试：',
    '',
    ...lines,
    '',
    `共 ${entries.length} 项缺失。Spot 产品线不校验 sell_price。`,
  ].join('\n')
}

export async function assertBillingPeriodForMonthlyCost(input: {
  billingPeriodId: string
  usageMonth: string
}): Promise<{ periodCode: string; periodEnd: string }> {
  const period = await db.query.billingPeriod.findFirst({
    where: eq(billingPeriod.id, input.billingPeriodId),
    columns: { periodCode: true, periodEnd: true, status: true },
  })
  if (!period) {
    throw new FinanceError('NOT_FOUND', '账期不存在')
  }
  if (period.status === 'void') {
    throw new FinanceError('PRECONDITION_FAILED', '已作废账期不可用于月度成本跑批')
  }
  const expectedMonth = usageMonthFromPeriodCode(period.periodCode)
  if (expectedMonth !== input.usageMonth) {
    throw new FinanceError(
      'PRECONDITION_FAILED',
      `账期编码 ${period.periodCode} 对应结算月 ${expectedMonth}，与所选 ${input.usageMonth} 不一致`,
    )
  }
  return { periodCode: period.periodCode, periodEnd: period.periodEnd }
}

export async function collectMissingSellPrices(input: {
  usageMonth: string
}): Promise<MissingSellPriceEntry[]> {
  const asOfDate = lastDayOfUsageMonth(input.usageMonth)
  const rows = await db
    .select({
      gpuCardTypeId: tenantRegionGpuConsumptionMonthly.gpuCardTypeId,
      gpuCardTypeName: tenantRegionGpuConsumptionMonthly.gpuCardTypeName,
      productLine: tenantRegionGpuConsumptionMonthly.productLine,
    })
    .from(tenantRegionGpuConsumptionMonthly)
    .where(eq(tenantRegionGpuConsumptionMonthly.usageMonth, input.usageMonth))

  const cardNameById = new Map<string, string>()
  const cards = await db
    .select({ id: gpuCardType.id, name: gpuCardType.name, code: gpuCardType.code })
    .from(gpuCardType)
  for (const c of cards) {
    cardNameById.set(c.id, c.name || c.code)
  }

  const seen = new Set<string>()
  const missing: MissingSellPriceEntry[] = []

  for (const row of rows) {
    if (row.productLine === 'spot' || !row.gpuCardTypeId) continue
    const key = `${row.gpuCardTypeId}::${row.productLine}`
    if (seen.has(key)) continue
    seen.add(key)

    const platformLine = mapTenantProductLineToPlatformListPrice(row.productLine)
    const resolved = await resolvePlatformListPriceAt({
      gpuCardTypeId: row.gpuCardTypeId,
      asOfDate,
      productLine: platformLine,
      billingUnit: 'hour',
    })
    if (!resolved) {
      missing.push({
        gpuCardTypeId: row.gpuCardTypeId,
        gpuCardTypeName:
          row.gpuCardTypeName ?? cardNameById.get(row.gpuCardTypeId) ?? row.gpuCardTypeId,
        productLine: platformLine,
        billingUnit: 'hour',
        usageMonth: input.usageMonth,
      })
    }
  }

  return missing
}

export async function precheckMonthlyCostRun(input: {
  billingPeriodId: string
  usageMonth: string
}): Promise<{ periodCode: string; periodEnd: string }> {
  const period = await assertBillingPeriodForMonthlyCost(input)

  const monthlyCount = await db
    .select({ id: tenantRegionGpuConsumptionMonthly.id })
    .from(tenantRegionGpuConsumptionMonthly)
    .where(eq(tenantRegionGpuConsumptionMonthly.usageMonth, input.usageMonth))
    .limit(1)
  if (monthlyCount.length === 0) {
    throw new FinanceError('PRECONDITION_FAILED', `结算月 ${input.usageMonth} 无租户卡时月表数据`)
  }

  const platformIds = await db
    .selectDistinct({
      tenantPlatformId: tenantRegionGpuConsumptionMonthly.tenantPlatformId,
    })
    .from(tenantRegionGpuConsumptionMonthly)
    .where(eq(tenantRegionGpuConsumptionMonthly.usageMonth, input.usageMonth))

  const allocationIssues = await getPendingCostAllocationIssues({
    billingPeriodId: input.billingPeriodId,
    tenantPlatformIds: platformIds.map((r) => r.tenantPlatformId),
    periodEnd: period.periodEnd,
  })
  if (allocationIssues.length > 0) {
    throw new FinanceError(
      'PRECONDITION_FAILED',
      formatPendingCostAllocationError(allocationIssues, 'validate'),
    )
  }

  const missingSellPrices = await collectMissingSellPrices({ usageMonth: input.usageMonth })
  if (missingSellPrices.length > 0) {
    throw new FinanceError('PRECONDITION_FAILED', formatMissingSellPriceError(missingSellPrices))
  }

  return period
}
