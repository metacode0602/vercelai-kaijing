import type { TenantRegionGpuProductLine } from '@/lib/finance/tenant-region-gpu-product-line'
import type { TenantRegionGpuMetrics } from './validate-metrics'

export type EnrichmentBindingSource =
  | 'none'
  | 'auto_single'
  | 'auto_preset'
  | 'multi_project_primary'
  | 'multi_project_unresolved'

export type PricingResolveStatus =
  | 'pending'
  | 'ok'
  | 'region_not_found'
  | 'card_type_not_found'
  | 'pricing_pair_not_found'
  | 'platform_list_price_not_found'

export type ProjectEnrichmentSnapshotItem = {
  project_id: string
  project_name: string
  staff_id: string | null
  account_manager_name: string | null
  allocation_percent: string | null
  is_primary_tenant_project: boolean
}

export type TenantRegionGpuConsumptionRowInput = {
  tenantPlatformId: string
  usageDate: string
  regionCode: string
  gpuModel: string
  productLine: TenantRegionGpuProductLine
  baseValue?: string | number | null
  totalConsumption: string | number
  voucherConsumption?: string | number
  balanceConsumption: string | number
  totalCardHours: string | number
  voucherCardHours?: string | number
  balanceCardHours: string | number
  source?: 'platform_sync' | 'manual_import' | 'backfill'
  platformIdempotencyKey?: string
  rawJson?: Record<string, unknown> | null
}

export type TenantRegionGpuConsumptionMonthlyRowInput = {
  tenantPlatformId: string
  usageMonth: string
  regionCode: string
  gpuModel: string
  productLine: TenantRegionGpuProductLine
  baseValue?: string | number | null
  totalConsumption: string | number
  voucherConsumption?: string | number
  balanceConsumption: string | number
  totalCardHours: string | number
  voucherCardHours?: string | number
  balanceCardHours: string | number
  source?: 'platform_sync' | 'manual_import' | 'backfill'
}

export type TenantRegionGpuConsumptionListItem = {
  id: string
  usageDate: string | null
  usageMonth: string
  tenantPlatformId: string
  tenantId: string | null
  tenantName: string | null
  customerFullName: string | null
  projectName: string | null
  accountManagerName: string | null
  customerIncentiveLabel: string
  incentiveStartDate: string | null
  regionCode: string
  gpuModel: string
  productLine: string
  source: string | null
  dataCenterId: string | null
  dataCenterName: string | null
  gpuCardTypeId: string | null
  gpuCardTypeName: string | null
  pricingMode: string | null
  listPricePerHour: string | null
  unitPricePerHour: string | null
  revenueSharePercent: string | null
  pricingResolveStatus: string
  baseValue: string | null
  totalConsumption: string
  voucherConsumption: string
  balanceConsumption: string
  totalCardHours: string
  voucherCardHours: string
  balanceCardHours: string
  enrichmentBindingSource: string
  /** 裸金属跨月订单摊销：本月行是否含摊销设备 */
  hasAmortization: boolean
}

export type TenantRegionGpuReconciliationStatus = 'match' | 'mismatch' | 'no_daily'

export type TenantRegionGpuBareMetalOrderLine = {
  orderId: string
  orderNo: string | null
  platformOrderId: string | null
  deviceModelText: string | null
  gpuCount: number
  rentStartsAt: string
  rentEndsAt: string
  durationHours: string | null
  totalHours: number
  overlapHours: number
  amortRatio: number
  hasAmortization: boolean
  lineAmount: string
  finalAmount: string
  couponAmount: string
  idcName: string | null
  regionCode: string
  gpuModel: string
  preAmortBalanceConsumption: string
  preAmortBalanceCardHours: string
  amortBalanceConsumption: string
  amortBalanceCardHours: string
}

export type TenantRegionGpuMonthlyDetailResult = {
  monthly: TenantRegionGpuConsumptionListItem
  reconciliation: {
    scopeProductLine: TenantRegionGpuProductLine
    showPrimaryStatus: boolean
    status: TenantRegionGpuReconciliationStatus
    monthlyMetrics: TenantRegionGpuMetrics
    dailySumMetrics: TenantRegionGpuMetrics | null
    deltaMetrics: TenantRegionGpuMetrics | null
    dailyRowCount: number
  }
  dailyRows: { rows: TenantRegionGpuConsumptionListItem[]; total: number }
  /** 裸金属月行：匹配的原订单设备明细（便于摊销校对） */
  bareMetalOrderLines: TenantRegionGpuBareMetalOrderLine[]
}
