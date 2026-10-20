import { toMoneyString } from '@/lib/finance/income-row-utils'
import type { TenantRegionGpuProductLine } from '@/lib/finance/tenant-region-gpu-product-line'
import { db } from '@/lib/db'
import { tenantRegionGpuConsumptionMonthly } from '@workspace/db/schema'
import { newId } from '../operation-log'
import { normalizeBillingRegion } from '../tenant-bill-pricing'
import { lastDayOfMonth, resolveTenantCrmSnapshot } from './resolve-crm-snapshot'
import {
  computeBaseValueFallback,
  resolveInfraPricingSnapshot,
} from './resolve-infra-pricing'
import type { TenantRegionGpuConsumptionMonthlyRowInput } from './types'

export async function upsertTenantRegionGpuConsumptionMonthly(
  input: TenantRegionGpuConsumptionMonthlyRowInput,
): Promise<{ id: string }> {
  const usageMonth = input.usageMonth
  const regionCode = normalizeBillingRegion(input.regionCode)
  const gpuModel = input.gpuModel.trim()
  const productLine: TenantRegionGpuProductLine = input.productLine
  const usageDate = lastDayOfMonth(usageMonth)

  const [crm, infra] = await Promise.all([
    resolveTenantCrmSnapshot({ tenantPlatformId: input.tenantPlatformId, usageMonth }),
    resolveInfraPricingSnapshot({
      regionCode,
      gpuModel,
      usageDate,
      productLine,
    }),
  ])

  const baseValue = computeBaseValueFallback({
    baseValue: input.baseValue,
    totalCardHours: input.totalCardHours,
    listPricePerHour: infra.listPricePerHour,
  })

  const row = {
    id: newId(),
    tenantPlatformId: input.tenantPlatformId,
    tenantId: crm.tenantId,
    customerId: crm.customerId,
    projectId: crm.projectId,
    usageMonth,
    regionCode,
    gpuModel,
    productLine,
    dataCenterId: infra.dataCenterId,
    gpuCardTypeId: infra.gpuCardTypeId,
    baseValue,
    totalConsumption: toMoneyString(Number(input.totalConsumption)),
    voucherConsumption: toMoneyString(Number(input.voucherConsumption ?? 0)),
    balanceConsumption: toMoneyString(Number(input.balanceConsumption)),
    totalCardHours: toMoneyString(Number(input.totalCardHours)),
    voucherCardHours: toMoneyString(Number(input.voucherCardHours ?? 0)),
    balanceCardHours: toMoneyString(Number(input.balanceCardHours)),
    source: input.source ?? 'manual_import',
    tenantName: crm.tenantName,
    customerFullName: crm.customerFullName,
    projectName: crm.projectName,
    accountManagerStaffId: crm.accountManagerStaffId,
    accountManagerName: crm.accountManagerName,
    enrichmentBindingSource: crm.enrichmentBindingSource,
    projectEnrichmentSnapshot: crm.projectEnrichmentSnapshot,
    customerIncentiveType: crm.customerIncentiveType,
    customerIncentiveLabel: crm.customerIncentiveLabel,
    incentiveStartDate: crm.incentiveStartDate,
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
  }

  const { id: _rowId, ...monthlyUpdate } = row
  await db
    .insert(tenantRegionGpuConsumptionMonthly)
    .values(row)
    .onConflictDoUpdate({
      target: [
        tenantRegionGpuConsumptionMonthly.tenantPlatformId,
        tenantRegionGpuConsumptionMonthly.usageMonth,
        tenantRegionGpuConsumptionMonthly.regionCode,
        tenantRegionGpuConsumptionMonthly.gpuModel,
        tenantRegionGpuConsumptionMonthly.productLine,
      ],
      set: { ...monthlyUpdate, updatedAt: new Date() },
    })

  return { id: row.id }
}
