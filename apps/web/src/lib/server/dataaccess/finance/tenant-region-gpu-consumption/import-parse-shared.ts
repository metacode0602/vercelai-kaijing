import {
  normalizeTenantRegionGpuProductLine,
  type TenantRegionGpuProductLine,
} from '@/lib/finance/tenant-region-gpu-product-line'
import { parseMoneyCell, pickColumn } from '../excel-parser'
import { normalizeBillingRegion } from '../tenant-bill-pricing'
import { validateTenantRegionGpuMetrics } from './validate-metrics'

export function parseImportProductLine(
  row: Record<string, string | number | null>,
): { productLine: TenantRegionGpuProductLine } | { error: string } {
  const raw = pickColumn(row, ['产品线', 'product_line', 'productLine', '类型'])
  const normalized = normalizeTenantRegionGpuProductLine(raw)
  if (typeof normalized === 'object' && 'error' in normalized) {
    return normalized
  }
  return { productLine: normalized }
}

export function parseImportCoreFields(
  row: Record<string, string | number | null>,
): { tenantPlatformId: string; regionCode: string; gpuModel: string } | { error: string } {
  const tenantPlatformId = pickColumn(row, ['租户Id', '租户ID', 'tenant_id', 'tenant_platform_id'])
  if (!tenantPlatformId) {
    return { error: '缺少租户 Id' }
  }

  const regionRaw = pickColumn(row, ['区域', 'region', 'region_code'])
  const gpuModel = pickColumn(row, ['GPU型号', 'gpu_model'])
  if (!regionRaw || !gpuModel) {
    return { error: '缺少区域或 GPU 型号' }
  }

  return {
    tenantPlatformId: tenantPlatformId.trim(),
    regionCode: normalizeBillingRegion(regionRaw),
    gpuModel: gpuModel.trim(),
  }
}

export function parseImportMetrics(
  row: Record<string, string | number | null>,
): { metrics: {
  baseValue: string | null
  totalConsumption: string
  voucherConsumption: string
  balanceConsumption: string
  totalCardHours: string
  voucherCardHours: string
  balanceCardHours: string
} } | { error: string } {
  const balanceHours = pickColumn(row, ['余额卡时', 'balance_card_hours'])
  const metrics = {
    baseValue: parseMoneyCell(pickColumn(row, ['base_value', 'baseValue', '基准消费'])),
    totalConsumption: parseMoneyCell(pickColumn(row, ['总消费', 'total_consumption'])) ?? '0',
    voucherConsumption: parseMoneyCell(pickColumn(row, ['券消费', 'voucher_consumption'])) ?? '0',
    balanceConsumption: parseMoneyCell(pickColumn(row, ['余额消费', 'balance_consumption'])) ?? '0',
    totalCardHours: parseMoneyCell(pickColumn(row, ['总卡时', 'total_card_hours'])) ?? '0',
    voucherCardHours: parseMoneyCell(pickColumn(row, ['券卡时', 'voucher_card_hours'])) ?? '0',
    balanceCardHours: parseMoneyCell(balanceHours ?? '0') ?? '0',
  }

  const validationError = validateTenantRegionGpuMetrics(metrics)
  if (validationError) {
    return { error: validationError }
  }

  return { metrics }
}
