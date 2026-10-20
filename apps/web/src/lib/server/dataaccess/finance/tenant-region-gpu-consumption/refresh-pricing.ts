import { db } from '@/lib/db'
import {
  tenantRegionGpuConsumptionDaily,
  tenantRegionGpuConsumptionMonthly,
} from '@workspace/db/schema'
import { and, eq } from 'drizzle-orm'
import type { TenantRegionGpuProductLine } from '@/lib/finance/tenant-region-gpu-product-line'
import { normalizeBillingRegion } from '../tenant-bill-pricing'
import { lastDayOfMonth } from './resolve-crm-snapshot'
import {
  computeBaseValueFallback,
  resolveInfraPricingSnapshot,
} from './resolve-infra-pricing'

function buildPricingUpdateFromInfra(
  infra: Awaited<ReturnType<typeof resolveInfraPricingSnapshot>>,
  row: { baseValue: string | null; totalCardHours: string },
) {
  return {
    dataCenterId: infra.dataCenterId,
    gpuCardTypeId: infra.gpuCardTypeId,
    dataCenterCode: infra.dataCenterCode,
    dataCenterName: infra.dataCenterName,
    gpuCardTypeCode: infra.gpuCardTypeCode,
    gpuCardTypeName: infra.gpuCardTypeName,
    pricingMode: infra.pricingMode,
    listPricePerHour: infra.listPricePerHour,
    unitPricePerHour: infra.unitPricePerHour,
    revenueSharePercent: infra.revenueSharePercent,
    platformCardListPriceId: infra.platformCardListPriceId,
    supplierUnitCostId: infra.supplierUnitCostId,
    supplierPricingRecordId: infra.supplierPricingRecordId,
    pricingResolveStatus: infra.pricingResolveStatus,
    baseValue: computeBaseValueFallback({
      baseValue: row.baseValue,
      totalCardHours: row.totalCardHours,
      listPricePerHour: infra.listPricePerHour,
    }),
    updatedAt: new Date(),
  }
}

export async function refreshTenantRegionGpuConsumptionPricing(input: {
  dataCenterId: string
  gpuCardTypeId: string
  usageMonth?: string
}): Promise<{ updatedDaily: number; updatedMonthly: number }> {
  const dailyConditions = [
    eq(tenantRegionGpuConsumptionDaily.dataCenterId, input.dataCenterId),
    eq(tenantRegionGpuConsumptionDaily.gpuCardTypeId, input.gpuCardTypeId),
  ]
  if (input.usageMonth) {
    dailyConditions.push(eq(tenantRegionGpuConsumptionDaily.usageMonth, input.usageMonth))
  }

  const dailyRows = await db
    .select()
    .from(tenantRegionGpuConsumptionDaily)
    .where(and(...dailyConditions))

  let updatedDaily = 0
  for (const row of dailyRows) {
    const infra = await resolveInfraPricingSnapshot({
      regionCode: row.regionCode,
      gpuModel: row.gpuModel,
      usageDate: row.usageDate,
      productLine: row.productLine as TenantRegionGpuProductLine,
    })
    await db
      .update(tenantRegionGpuConsumptionDaily)
      .set(buildPricingUpdateFromInfra(infra, row))
      .where(eq(tenantRegionGpuConsumptionDaily.id, row.id))
    updatedDaily += 1
  }

  const monthlyConditions = [
    eq(tenantRegionGpuConsumptionMonthly.dataCenterId, input.dataCenterId),
    eq(tenantRegionGpuConsumptionMonthly.gpuCardTypeId, input.gpuCardTypeId),
  ]
  if (input.usageMonth) {
    monthlyConditions.push(eq(tenantRegionGpuConsumptionMonthly.usageMonth, input.usageMonth))
  }

  const monthlyRows = await db
    .select()
    .from(tenantRegionGpuConsumptionMonthly)
    .where(and(...monthlyConditions))

  let updatedMonthly = 0
  for (const row of monthlyRows) {
    const usageDate = lastDayOfMonth(row.usageMonth)
    const infra = await resolveInfraPricingSnapshot({
      regionCode: row.regionCode,
      gpuModel: row.gpuModel,
      usageDate,
      productLine: row.productLine as TenantRegionGpuProductLine,
    })
    await db
      .update(tenantRegionGpuConsumptionMonthly)
      .set(buildPricingUpdateFromInfra(infra, row))
      .where(eq(tenantRegionGpuConsumptionMonthly.id, row.id))
    updatedMonthly += 1
  }

  return { updatedDaily, updatedMonthly }
}

/**
 * 按区域码重解析定价（含 data_center_id 为空的 region_not_found 行）。
 * 机房主数据补全 container_instance_region 后应调用此接口。
 */
export async function refreshTenantRegionGpuConsumptionPricingByRegion(input: {
  regionCode: string
  usageMonth?: string
}): Promise<{ updatedDaily: number; updatedMonthly: number }> {
  const regionNorm = normalizeBillingRegion(input.regionCode)
  if (!regionNorm) {
    throw new Error('区域码不能为空')
  }

  const dailyConditions = [eq(tenantRegionGpuConsumptionDaily.regionCode, regionNorm)]
  if (input.usageMonth) {
    dailyConditions.push(eq(tenantRegionGpuConsumptionDaily.usageMonth, input.usageMonth))
  }

  const dailyRows = await db
    .select()
    .from(tenantRegionGpuConsumptionDaily)
    .where(and(...dailyConditions))

  let updatedDaily = 0
  for (const row of dailyRows) {
    const infra = await resolveInfraPricingSnapshot({
      regionCode: row.regionCode,
      gpuModel: row.gpuModel,
      usageDate: row.usageDate,
      productLine: row.productLine as TenantRegionGpuProductLine,
    })
    await db
      .update(tenantRegionGpuConsumptionDaily)
      .set(buildPricingUpdateFromInfra(infra, row))
      .where(eq(tenantRegionGpuConsumptionDaily.id, row.id))
    updatedDaily += 1
  }

  const monthlyConditions = [eq(tenantRegionGpuConsumptionMonthly.regionCode, regionNorm)]
  if (input.usageMonth) {
    monthlyConditions.push(eq(tenantRegionGpuConsumptionMonthly.usageMonth, input.usageMonth))
  }

  const monthlyRows = await db
    .select()
    .from(tenantRegionGpuConsumptionMonthly)
    .where(and(...monthlyConditions))

  let updatedMonthly = 0
  for (const row of monthlyRows) {
    const usageDate = lastDayOfMonth(row.usageMonth)
    const infra = await resolveInfraPricingSnapshot({
      regionCode: row.regionCode,
      gpuModel: row.gpuModel,
      usageDate,
      productLine: row.productLine as TenantRegionGpuProductLine,
    })
    await db
      .update(tenantRegionGpuConsumptionMonthly)
      .set(buildPricingUpdateFromInfra(infra, row))
      .where(eq(tenantRegionGpuConsumptionMonthly.id, row.id))
    updatedMonthly += 1
  }

  return { updatedDaily, updatedMonthly }
}
