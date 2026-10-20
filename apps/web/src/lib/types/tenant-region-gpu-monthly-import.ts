export const TENANT_REGION_GPU_MONTHLY_IMPORT_MAX_BYTES = 10 * 1024 * 1024
export const TENANT_REGION_GPU_MONTHLY_IMPORT_ACCEPT = '.xlsx,.xls,.csv,.tsv,.txt'

export function isTenantRegionGpuMonthlyImportFileName(fileName: string): boolean {
  const name = fileName.toLowerCase()
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv') ||
    name.endsWith('.tsv') ||
    name.endsWith('.txt')
  )
}

export type TenantRegionGpuMonthlyImportParseStatus = 'ok' | 'error' | 'skip'

export type TenantRegionGpuMonthlyImportPreviewRow = {
  rowNo: number
  parseStatus: TenantRegionGpuMonthlyImportParseStatus
  parseMessage?: string
  usageMonth?: string
  productLine?: string
  tenantPlatformId?: string
  regionCode?: string
  gpuModel?: string
  balanceConsumption?: string
  balanceCardHours?: string
  totalConsumption?: string
  /** 合并前的 Excel 行号（仅合并行有值） */
  mergedFromRowNos?: number[]
}

export type TenantRegionGpuMonthlyImportBillReconcileStatus =
  | 'match'
  | 'mismatch'
  | 'missing_bill'

export type TenantRegionGpuMonthlyImportBillReconcileRow = {
  tenantPlatformId: string
  tenantName: string | null
  excelTotalConsumption: string
  excelVoucherConsumption: string
  excelBalanceConsumption: string
  billTotalAmount: string
  billCouponAmount: string
  billBalanceAmount: string
  deltaBalanceConsumption: string
  status: TenantRegionGpuMonthlyImportBillReconcileStatus
}

export type TenantRegionGpuMonthlyImportBillReconcile = {
  /** Excel 中参与对账的租户数（弹性部署汇总） */
  tenantCount: number
  /** 有差异的租户数（含账单缺失） */
  mismatchTenantCount: number
  tolerance: number
  rows: TenantRegionGpuMonthlyImportBillReconcileRow[]
}

export type TenantRegionGpuMonthlyImportPreviewResult = {
  fileName: string
  usageMonth: string
  originalHeaders: string[]
  rows: TenantRegionGpuMonthlyImportPreviewRow[]
  summary: {
    total: number
    ok: number
    error: number
    skip: number
  }
  fileErrors: string[]
  bareMetalAutoCount?: number
  /** Excel 弹性部署按租户汇总 vs tenant_bill_detail（弹性部署+云主机+Job） */
  billReconcile?: TenantRegionGpuMonthlyImportBillReconcile
}

export type TenantRegionGpuMonthlyImportCommitResult = {
  importedCount: number
  bareMetalAutoCount?: number
  errors: string[]
}
