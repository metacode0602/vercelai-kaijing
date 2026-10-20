import type { TenantRegionGpuProductLine } from '@/lib/finance/tenant-region-gpu-product-line'
import { toMoneyString } from '@/lib/finance/income-row-utils'
import { db } from '@/lib/db'
import {
  dataCenter,
  tenantRegionGpuConsumptionDaily,
  tenantRegionGpuConsumptionMonthly,
} from '@workspace/db/schema'
import { and, desc, eq, ilike, ne, or, sql } from 'drizzle-orm'
import type { TenantRegionGpuConsumptionListItem } from './types'
import { mapDailyRow, mapMonthlyRow } from './list-mappers'
import {
  bareMetalMonthlyKey,
  loadBareMetalMonthlyAmortizationMap,
} from './bare-metal-monthly-amortization-lookup'

export type AnomalyFilter = 'all' | 'yes' | 'no'

function buildTenantFilter(tenantPlatformId: string | undefined) {
  if (!tenantPlatformId?.trim()) return undefined
  const value = tenantPlatformId.trim()
  return or(
    eq(tenantRegionGpuConsumptionMonthly.tenantPlatformId, value),
    eq(tenantRegionGpuConsumptionMonthly.tenantId, value),
    ilike(tenantRegionGpuConsumptionMonthly.tenantName, `%${value}%`),
  )
}

function buildDailyTenantFilter(tenantPlatformId: string | undefined) {
  if (!tenantPlatformId?.trim()) return undefined
  const value = tenantPlatformId.trim()
  return or(
    eq(tenantRegionGpuConsumptionDaily.tenantPlatformId, value),
    eq(tenantRegionGpuConsumptionDaily.tenantId, value),
    ilike(tenantRegionGpuConsumptionDaily.tenantName, `%${value}%`),
  )
}

function buildMonthlyAnomalyFilter(hasAnomaly: AnomalyFilter | undefined) {
  if (hasAnomaly === 'yes') {
    return ne(tenantRegionGpuConsumptionMonthly.pricingResolveStatus, 'ok')
  }
  if (hasAnomaly === 'no') {
    return eq(tenantRegionGpuConsumptionMonthly.pricingResolveStatus, 'ok')
  }
  return undefined
}

function buildDailyAnomalyFilter(hasAnomaly: AnomalyFilter | undefined) {
  if (hasAnomaly === 'yes') {
    return ne(tenantRegionGpuConsumptionDaily.pricingResolveStatus, 'ok')
  }
  if (hasAnomaly === 'no') {
    return eq(tenantRegionGpuConsumptionDaily.pricingResolveStatus, 'ok')
  }
  return undefined
}

export async function listTenantRegionGpuConsumptionMonthly(input: {
  usageMonth: string
  tenantPlatformId?: string
  dataCenterId?: string
  productLine?: TenantRegionGpuProductLine
  hasAnomaly?: AnomalyFilter
  limit?: number
  offset?: number
}): Promise<{ rows: TenantRegionGpuConsumptionListItem[]; total: number }> {
  const conditions = [eq(tenantRegionGpuConsumptionMonthly.usageMonth, input.usageMonth)]
  const tenantFilter = buildTenantFilter(input.tenantPlatformId)
  if (tenantFilter) conditions.push(tenantFilter)
  if (input.dataCenterId) {
    conditions.push(eq(tenantRegionGpuConsumptionMonthly.dataCenterId, input.dataCenterId))
  }
  if (input.productLine) {
    conditions.push(eq(tenantRegionGpuConsumptionMonthly.productLine, input.productLine))
  }
  const anomalyFilter = buildMonthlyAnomalyFilter(input.hasAnomaly)
  if (anomalyFilter) conditions.push(anomalyFilter)
  const whereClause = and(...conditions)

  const [rows, countRow] = await Promise.all([
    db
      .select()
      .from(tenantRegionGpuConsumptionMonthly)
      .where(whereClause)
      .orderBy(
        desc(tenantRegionGpuConsumptionMonthly.balanceConsumption),
        tenantRegionGpuConsumptionMonthly.tenantPlatformId,
      )
      .limit(input.limit ?? 20)
      .offset(input.offset ?? 0),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantRegionGpuConsumptionMonthly)
      .where(whereClause),
  ])

  const hasBareMetal = rows.some((r) => r.productLine === 'bare_metal')
  const amortMap = hasBareMetal
    ? await loadBareMetalMonthlyAmortizationMap(input.usageMonth)
    : null

  return {
    rows: rows.map((row) => {
      if (row.productLine !== 'bare_metal' || !amortMap) {
        return mapMonthlyRow(row)
      }
      const key = bareMetalMonthlyKey({
        tenantPlatformId: row.tenantPlatformId,
        regionCode: row.regionCode,
        gpuModel: row.gpuModel,
      })
      return mapMonthlyRow(row, {
        hasAmortization: amortMap.get(key)?.hasAmortization ?? false,
      })
    }),
    total: countRow[0]?.count ?? 0,
  }
}

export async function listTenantRegionGpuConsumptionDaily(input: {
  usageMonth: string
  tenantPlatformId?: string
  dataCenterId?: string
  productLine?: TenantRegionGpuProductLine
  hasAnomaly?: AnomalyFilter
  limit?: number
  offset?: number
}): Promise<{ rows: TenantRegionGpuConsumptionListItem[]; total: number }> {
  const conditions = [eq(tenantRegionGpuConsumptionDaily.usageMonth, input.usageMonth)]
  const tenantFilter = buildDailyTenantFilter(input.tenantPlatformId)
  if (tenantFilter) conditions.push(tenantFilter)
  if (input.dataCenterId) {
    conditions.push(eq(tenantRegionGpuConsumptionDaily.dataCenterId, input.dataCenterId))
  }
  if (input.productLine) {
    conditions.push(eq(tenantRegionGpuConsumptionDaily.productLine, input.productLine))
  }
  const anomalyFilter = buildDailyAnomalyFilter(input.hasAnomaly)
  if (anomalyFilter) conditions.push(anomalyFilter)
  const whereClause = and(...conditions)

  const [rows, countRow] = await Promise.all([
    db
      .select()
      .from(tenantRegionGpuConsumptionDaily)
      .where(whereClause)
      .orderBy(
        desc(tenantRegionGpuConsumptionDaily.usageDate),
        tenantRegionGpuConsumptionDaily.tenantPlatformId,
      )
      .limit(input.limit ?? 20)
      .offset(input.offset ?? 0),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantRegionGpuConsumptionDaily)
      .where(whereClause),
  ])

  return {
    rows: rows.map(mapDailyRow),
    total: countRow[0]?.count ?? 0,
  }
}

export async function listTenantRegionGpuFilterOptions(input: {
  usageMonth: string
}): Promise<{
  dataCenters: { id: string; name: string }[]
  availableMonths: string[]
}> {
  const [monthRows, dcRows, allDc] = await Promise.all([
    db
      .selectDistinct({ usageMonth: tenantRegionGpuConsumptionMonthly.usageMonth })
      .from(tenantRegionGpuConsumptionMonthly)
      .orderBy(desc(tenantRegionGpuConsumptionMonthly.usageMonth))
      .limit(24),
    db
      .selectDistinct({
        id: tenantRegionGpuConsumptionMonthly.dataCenterId,
        name: tenantRegionGpuConsumptionMonthly.dataCenterName,
      })
      .from(tenantRegionGpuConsumptionMonthly)
      .where(
        and(
          eq(tenantRegionGpuConsumptionMonthly.usageMonth, input.usageMonth),
          sql`${tenantRegionGpuConsumptionMonthly.dataCenterId} is not null`,
        ),
      ),
    db
      .select({ id: dataCenter.id, name: dataCenter.name })
      .from(dataCenter)
      .where(eq(dataCenter.sourceDeleted, false))
      .orderBy(dataCenter.name),
  ])

  const fromMonthly = dcRows
    .filter((r): r is { id: string; name: string } => Boolean(r.id && r.name))
    .map((r) => ({ id: r.id, name: r.name }))

  const merged = new Map<string, string>()
  for (const dc of allDc) merged.set(dc.id, dc.name)
  for (const dc of fromMonthly) merged.set(dc.id, dc.name)

  return {
    availableMonths: monthRows.map((r) => r.usageMonth),
    dataCenters: [...merged.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
  }
}

export async function summarizeTenantRegionGpuConsumptionMonthly(input: {
  usageMonth: string
  tenantPlatformId?: string
  dataCenterId?: string
  productLine?: TenantRegionGpuProductLine
  hasAnomaly?: AnomalyFilter
}): Promise<{
  rowCount: number
  totalBalanceConsumption: string
  totalBalanceCardHours: string
  totalBareMetalPreAmortBalanceConsumption: string
  totalBareMetalPreAmortBalanceCardHours: string
}> {
  const conditions = [eq(tenantRegionGpuConsumptionMonthly.usageMonth, input.usageMonth)]
  const tenantFilter = buildTenantFilter(input.tenantPlatformId)
  if (tenantFilter) conditions.push(tenantFilter)
  if (input.dataCenterId) {
    conditions.push(eq(tenantRegionGpuConsumptionMonthly.dataCenterId, input.dataCenterId))
  }
  if (input.productLine) {
    conditions.push(eq(tenantRegionGpuConsumptionMonthly.productLine, input.productLine))
  }
  const anomalyFilter = buildMonthlyAnomalyFilter(input.hasAnomaly)
  if (anomalyFilter) conditions.push(anomalyFilter)

  const [row] = await db
    .select({
      rowCount: sql<number>`count(*)::int`,
      totalBalanceConsumption: sql<string>`coalesce(sum(${tenantRegionGpuConsumptionMonthly.balanceConsumption}), 0)`,
      totalBalanceCardHours: sql<string>`coalesce(sum(${tenantRegionGpuConsumptionMonthly.balanceCardHours}), 0)`,
    })
    .from(tenantRegionGpuConsumptionMonthly)
    .where(and(...conditions))

  let totalBareMetalPreAmortBalanceConsumption = '0'
  let totalBareMetalPreAmortBalanceCardHours = '0'

  const includeBareMetal =
    !input.productLine || input.productLine === 'bare_metal'

  if (includeBareMetal) {
    const bareMetalConditions = [...conditions]
    if (!input.productLine) {
      bareMetalConditions.push(
        eq(tenantRegionGpuConsumptionMonthly.productLine, 'bare_metal'),
      )
    }

    const bareMetalKeys = await db
      .select({
        tenantPlatformId: tenantRegionGpuConsumptionMonthly.tenantPlatformId,
        regionCode: tenantRegionGpuConsumptionMonthly.regionCode,
        gpuModel: tenantRegionGpuConsumptionMonthly.gpuModel,
      })
      .from(tenantRegionGpuConsumptionMonthly)
      .where(and(...bareMetalConditions))

    if (bareMetalKeys.length > 0) {
      const amortMap = await loadBareMetalMonthlyAmortizationMap(input.usageMonth)
      let preAmortBalance = 0
      let preAmortHours = 0
      for (const keyRow of bareMetalKeys) {
        const bucket = amortMap.get(
          bareMetalMonthlyKey({
            tenantPlatformId: keyRow.tenantPlatformId,
            regionCode: keyRow.regionCode,
            gpuModel: keyRow.gpuModel,
          }),
        )
        if (!bucket) continue
        preAmortBalance += bucket.preAmortBalanceConsumption
        preAmortHours += bucket.preAmortBalanceCardHours
      }
      totalBareMetalPreAmortBalanceConsumption = toMoneyString(preAmortBalance)
      totalBareMetalPreAmortBalanceCardHours = toMoneyString(preAmortHours)
    }
  }

  return {
    rowCount: row?.rowCount ?? 0,
    totalBalanceConsumption: row?.totalBalanceConsumption ?? '0',
    totalBalanceCardHours: row?.totalBalanceCardHours ?? '0',
    totalBareMetalPreAmortBalanceConsumption,
    totalBareMetalPreAmortBalanceCardHours,
  }
}
