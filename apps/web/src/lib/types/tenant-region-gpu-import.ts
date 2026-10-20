export const TENANT_REGION_GPU_IMPORT_MAX_BYTES = 10 * 1024 * 1024
export const TENANT_REGION_GPU_IMPORT_ACCEPT = '.xlsx,.xls,.csv,.tsv,.txt'

export function isTenantRegionGpuImportFileName(fileName: string): boolean {
  const name = fileName.toLowerCase()
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv') ||
    name.endsWith('.tsv') ||
    name.endsWith('.txt')
  )
}

export type TenantRegionGpuImportParseStatus = 'ok' | 'error' | 'skip'

export type TenantRegionGpuImportPreviewRow = {
  rowNo: number
  parseStatus: TenantRegionGpuImportParseStatus
  parseMessage?: string
  tenantPlatformId?: string
  usageDate?: string
  usageMonth?: string
  regionCode?: string
  gpuModel?: string
  productLine?: string
  balanceConsumption?: string
  balanceCardHours?: string
  totalConsumption?: string
}

export type TenantRegionGpuImportPreviewResult = {
  fileName: string
  originalHeaders: string[]
  rows: TenantRegionGpuImportPreviewRow[]
  summary: {
    total: number
    ok: number
    error: number
    skip: number
  }
  fileErrors: string[]
}

export type TenantRegionGpuImportCommitResult = {
  importedCount: number
  errors: string[]
}
