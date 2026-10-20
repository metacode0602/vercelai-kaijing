import type { TenantRegionGpuProductLine } from '@/lib/finance/tenant-region-gpu-product-line'
import { isTenantRegionGpuProductLine } from '@/lib/finance/tenant-region-gpu-product-line'
import { db } from '@/lib/db'
import {
  tenantRegionGpuConsumptionDaily,
  tenantRegionGpuConsumptionMonthly,
} from '@workspace/db/schema'
import { and, desc, eq, sql } from 'drizzle-orm'
import { FinanceError } from '../errors'
import {
  metricsFromRow,
  metricsMatch,
  subtractMetrics,
  type TenantRegionGpuMetrics,
} from './validate-metrics'
import type { TenantRegionGpuMonthlyDetailResult } from './types'
import { mapDailyRow, mapMonthlyRow } from './list-mappers'
import {
  bareMetalMonthlyKey,
  loadBareMetalMonthlyAmortizationMap,
} from './bare-metal-monthly-amortization-lookup'

export async function sumDailyMetricsForMonthlyRow(input: {
  tenantPlatformId: string
  usageMonth: string
  regionCode: string
  gpuModel: string
  productLine?: TenantRegionGpuProductLine | 'all'
}): Promise<{ metrics: TenantRegionGpuMetrics | null; rowCount: number }> {
  const conditions = [
    eq(tenantRegionGpuConsumptionDaily.tenantPlatformId, input.tenantPlatformId),
    eq(tenantRegionGpuConsumptionDaily.usageMonth, input.usageMonth),
    eq(tenantRegionGpuConsumptionDaily.regionCode, input.regionCode),
    eq(tenantRegionGpuConsumptionDaily.gpuModel, input.gpuModel),
  ]

  if (input.productLine && input.productLine !== 'all') {
    conditions.push(eq(tenantRegionGpuConsumptionDaily.productLine, input.productLine))
  }

  const whereClause = and(...conditions)

  const [agg, countRow] = await Promise.all([
    db
      .select({
        baseValue: sql<string>`coalesce(sum(${tenantRegionGpuConsumptionDaily.baseValue}), 0)`,
        totalConsumption: sql<string>`coalesce(sum(${tenantRegionGpuConsumptionDaily.totalConsumption}), 0)`,
        voucherConsumption: sql<string>`coalesce(sum(${tenantRegionGpuConsumptionDaily.voucherConsumption}), 0)`,
        balanceConsumption: sql<string>`coalesce(sum(${tenantRegionGpuConsumptionDaily.balanceConsumption}), 0)`,
        totalCardHours: sql<string>`coalesce(sum(${tenantRegionGpuConsumptionDaily.totalCardHours}), 0)`,
        voucherCardHours: sql<string>`coalesce(sum(${tenantRegionGpuConsumptionDaily.voucherCardHours}), 0)`,
        balanceCardHours: sql<string>`coalesce(sum(${tenantRegionGpuConsumptionDaily.balanceCardHours}), 0)`,
      })
      .from(tenantRegionGpuConsumptionDaily)
      .where(whereClause),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantRegionGpuConsumptionDaily)
      .where(whereClause),
  ])

  const rowCount = countRow[0]?.count ?? 0
  if (rowCount === 0) {
    return { metrics: null, rowCount: 0 }
  }

  const row = agg[0]!
  return {
    metrics: {
      baseValue: row.baseValue,
      totalConsumption: row.totalConsumption,
      voucherConsumption: row.voucherConsumption,
      balanceConsumption: row.balanceConsumption,
      totalCardHours: row.totalCardHours,
      voucherCardHours: row.voucherCardHours,
      balanceCardHours: row.balanceCardHours,
    },
    rowCount,
  }
}

export async function getTenantRegionGpuMonthlyRowDetail(input: {
  monthlyRowId: string
  dailyProductLineFilter?: TenantRegionGpuProductLine | 'all'
  dailyLimit?: number
  dailyOffset?: number
}): Promise<TenantRegionGpuMonthlyDetailResult> {
  const [monthlyRow] = await db
    .select()
    .from(tenantRegionGpuConsumptionMonthly)
    .where(eq(tenantRegionGpuConsumptionMonthly.id, input.monthlyRowId))
    .limit(1)

  if (!monthlyRow) {
    throw new FinanceError('NOT_FOUND', '月行不存在')
  }

  if (!isTenantRegionGpuProductLine(monthlyRow.productLine)) {
    throw new FinanceError('BAD_REQUEST', `无效产品线：${monthlyRow.productLine}`)
  }

  const monthlyProductLine = monthlyRow.productLine
  const filter = input.dailyProductLineFilter ?? monthlyProductLine
  const showPrimaryStatus = filter === monthlyProductLine

  const { metrics: dailySumMetrics, rowCount: dailyRowCount } = await sumDailyMetricsForMonthlyRow({
    tenantPlatformId: monthlyRow.tenantPlatformId,
    usageMonth: monthlyRow.usageMonth,
    regionCode: monthlyRow.regionCode,
    gpuModel: monthlyRow.gpuModel,
    productLine: filter,
  })

  const monthlyMetrics = metricsFromRow(monthlyRow)
  let status: TenantRegionGpuMonthlyDetailResult['reconciliation']['status'] = 'no_daily'
  let deltaMetrics: TenantRegionGpuMetrics | null = null

  if (dailySumMetrics && showPrimaryStatus) {
    status = metricsMatch(monthlyMetrics, dailySumMetrics) ? 'match' : 'mismatch'
    deltaMetrics = subtractMetrics(monthlyMetrics, dailySumMetrics)
  } else if (!dailySumMetrics && showPrimaryStatus) {
    status = 'no_daily'
  }

  const dailyConditions = [
    eq(tenantRegionGpuConsumptionDaily.tenantPlatformId, monthlyRow.tenantPlatformId),
    eq(tenantRegionGpuConsumptionDaily.usageMonth, monthlyRow.usageMonth),
    eq(tenantRegionGpuConsumptionDaily.regionCode, monthlyRow.regionCode),
    eq(tenantRegionGpuConsumptionDaily.gpuModel, monthlyRow.gpuModel),
  ]
  if (filter !== 'all') {
    dailyConditions.push(eq(tenantRegionGpuConsumptionDaily.productLine, filter))
  }
  const dailyWhere = and(...dailyConditions)

  const [dailyRows, dailyCountRow] = await Promise.all([
    db
      .select()
      .from(tenantRegionGpuConsumptionDaily)
      .where(dailyWhere)
      .orderBy(
        desc(tenantRegionGpuConsumptionDaily.usageDate),
        tenantRegionGpuConsumptionDaily.productLine,
      )
      .limit(input.dailyLimit ?? 20)
      .offset(input.dailyOffset ?? 0),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantRegionGpuConsumptionDaily)
      .where(dailyWhere),
  ])

  let hasAmortization = false
  let bareMetalOrderLines: TenantRegionGpuMonthlyDetailResult['bareMetalOrderLines'] = []

  if (monthlyProductLine === 'bare_metal') {
    const amortMap = await loadBareMetalMonthlyAmortizationMap(monthlyRow.usageMonth)
    const bucket = amortMap.get(
      bareMetalMonthlyKey({
        tenantPlatformId: monthlyRow.tenantPlatformId,
        regionCode: monthlyRow.regionCode,
        gpuModel: monthlyRow.gpuModel,
      }),
    )
    hasAmortization = bucket?.hasAmortization ?? false
    bareMetalOrderLines = bucket?.orderLines ?? []
  }

  return {
    monthly: mapMonthlyRow(monthlyRow, { hasAmortization }),
    reconciliation: {
      scopeProductLine: monthlyProductLine,
      showPrimaryStatus,
      status,
      monthlyMetrics,
      dailySumMetrics,
      deltaMetrics,
      dailyRowCount: dailyRowCount,
    },
    dailyRows: {
      rows: dailyRows.map(mapDailyRow),
      total: dailyCountRow[0]?.count ?? 0,
    },
    bareMetalOrderLines,
  }
}
