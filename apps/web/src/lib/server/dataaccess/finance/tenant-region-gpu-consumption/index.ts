import {
  commitTenantRegionGpuImportFile,
  importTenantRegionGpuConsumptionExcel,
  previewTenantRegionGpuImportFile,
} from './import-rows'
import {
  commitTenantRegionGpuMonthlyImportFile,
  previewTenantRegionGpuMonthlyImportFile,
} from './import-monthly-rows'
import {
  listTenantRegionGpuConsumptionDaily,
  listTenantRegionGpuConsumptionMonthly,
  listTenantRegionGpuFilterOptions,
  summarizeTenantRegionGpuConsumptionMonthly,
} from './list'
import { getTenantRegionGpuMonthlyRowDetail } from './monthly-detail'
import { getTenantRegionGpuPricingContext } from './pricing-context'
import {
  refreshTenantRegionGpuConsumptionPricing,
  refreshTenantRegionGpuConsumptionPricingByRegion,
} from './refresh-pricing'
import { upsertTenantRegionGpuConsumptionDaily } from './upsert-daily'
import { upsertTenantRegionGpuConsumptionMonthly } from './upsert-monthly'

export const tenantRegionGpuConsumptionDataAccess = {
  listMonthly: listTenantRegionGpuConsumptionMonthly,
  listDaily: listTenantRegionGpuConsumptionDaily,
  listFilterOptions: listTenantRegionGpuFilterOptions,
  summarizeMonthly: summarizeTenantRegionGpuConsumptionMonthly,
  upsertDaily: upsertTenantRegionGpuConsumptionDaily,
  upsertMonthly: upsertTenantRegionGpuConsumptionMonthly,
  previewImport: previewTenantRegionGpuImportFile,
  commitImport: commitTenantRegionGpuImportFile,
  previewMonthlyImport: previewTenantRegionGpuMonthlyImportFile,
  commitMonthlyImport: commitTenantRegionGpuMonthlyImportFile,
  getMonthlyRowDetail: getTenantRegionGpuMonthlyRowDetail,
  getPricingContext: getTenantRegionGpuPricingContext,
  refreshPricing: refreshTenantRegionGpuConsumptionPricing,
  refreshPricingByRegion: refreshTenantRegionGpuConsumptionPricingByRegion,
  importExcel: importTenantRegionGpuConsumptionExcel,
}
