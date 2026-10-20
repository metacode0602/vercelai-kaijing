import type {
  PlatformImportBillingBatchResult,
  PlatformImportCustomerAssignment,
  PlatformImportImportedTenant,
} from '@/lib/types/platform-tenant-import'

export type MerchantTenantSyncAction =
  | 'create'
  | 'update'
  | 'rebind'
  | 'unchanged'
  | 'local_only'

export type MerchantTenantSyncPreviewRow = {
  platformTenantId: string
  platformName: string
  platformMerchantId: number
  coin: number
  action: MerchantTenantSyncAction
  localTenantId?: string
  localName?: string
  localCustomerId?: string
  localCustomerName?: string
  localMerchantId?: string
  localMerchantName?: string
  changes: string[]
  warnings: string[]
}

export type MerchantTenantSyncPreviewResult = {
  previewId: string
  merchantId: string
  platformMerchantId: number
  platformTotal: number
  rows: MerchantTenantSyncPreviewRow[]
  summary: {
    create: number
    update: number
    rebind: number
    unchanged: number
    localOnly: number
  }
}

export type MerchantTenantSyncCommitItem = {
  platformTenantId: string
  /** 本地已存在时省略；新建时必填 */
  customer?: PlatformImportCustomerAssignment
}

export type MerchantTenantSyncCommitResult = {
  createdTenants: number
  updatedTenants: number
  reboundTenants: number
  createdCustomers: number
  importedTenants: PlatformImportImportedTenant[]
  errors: { platformTenantId: string; message: string }[]
  billing?: PlatformImportBillingBatchResult
}

/** 定时/自动同步：按商户平台 tenant_ids 建档/更新，无需人工客户指派 */
export type MerchantTenantSyncAutoResult = {
  merchantId: string
  platformMerchantId: number
  createdTenants: number
  updatedTenants: number
  /** 定时任务不改绑；此字段恒为 0，保留兼容 */
  reboundTenants: number
  /** 已归属其他商户、定时任务跳过的平台租户数 */
  skippedRebinds: number
  createdCustomers: number
  /** 同步后该商户下可用于账单导入的本地租户 ID */
  localTenantIds: string[]
  errors: { platformTenantId: string; message: string }[]
}
