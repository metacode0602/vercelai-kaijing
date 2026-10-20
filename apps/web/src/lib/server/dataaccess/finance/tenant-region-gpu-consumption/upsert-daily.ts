import { createHash } from 'node:crypto'
import { toMoneyString } from '@/lib/finance/income-row-utils'
import type { TenantRegionGpuProductLine } from '@/lib/finance/tenant-region-gpu-product-line'
import { db } from '@/lib/db'
import { tenantRegionGpuConsumptionDaily } from '@workspace/db/schema'
import { newId } from '../operation-log'
import { normalizeBillingRegion } from '../tenant-bill-pricing'
import { resolveTenantCrmSnapshot } from './resolve-crm-snapshot'
import {
  computeBaseValueFallback,
  resolveInfraPricingSnapshot,
} from './resolve-infra-pricing'
import type { TenantRegionGpuConsumptionRowInput } from './types'

function usageMonthFromDate(usageDate: string): string {
  return usageDate.slice(0, 7)
}

function buildIdempotencyKey(input: {
  tenantPlatformId: string
  usageDate: string
  regionCode: string
  gpuModel: string
  productLine: TenantRegionGpuProductLine
  platformIdempotencyKey?: string
}): string {
  const raw =
    input.platformIdempotencyKey ??
    `trg-daily-${input.tenantPlatformId}-${input.usageDate}-${input.regionCode}-${input.gpuModel}-${input.productLine}`
  if (raw.length <= 256) return raw
  const hash = createHash('sha256').update(raw).digest('hex').slice(0, 40)
  return `trg-h-${hash}`
}

export async function upsertTenantRegionGpuConsumptionDaily(
  input: TenantRegionGpuConsumptionRowInput,
): Promise<{ id: string; usageMonth: string }> {
  const usageDate = input.usageDate
  const usageMonth = usageMonthFromDate(usageDate)
  const regionCode = normalizeBillingRegion(input.regionCode)
  const gpuModel = input.gpuModel.trim()
  const productLine = input.productLine

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
    usageDate,
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
    platformIdempotencyKey: buildIdempotencyKey({
      tenantPlatformId: input.tenantPlatformId,
      usageDate,
      regionCode,
      gpuModel,
      productLine,
      platformIdempotencyKey: input.platformIdempotencyKey,
    }),
    rawJson: input.rawJson ?? null,
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

  const { id: _rowId, ...dailyUpdate } = row
  await db
    .insert(tenantRegionGpuConsumptionDaily)
    .values(row)
    .onConflictDoUpdate({
      target: [
        tenantRegionGpuConsumptionDaily.tenantPlatformId,
        tenantRegionGpuConsumptionDaily.usageDate,
        tenantRegionGpuConsumptionDaily.regionCode,
        tenantRegionGpuConsumptionDaily.gpuModel,
        tenantRegionGpuConsumptionDaily.productLine,
      ],
      set: { ...dailyUpdate, updatedAt: new Date() },
    })

  return { id: row.id, usageMonth }
}
