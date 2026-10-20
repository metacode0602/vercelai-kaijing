export type MerchantSyncAction = 'create' | 'update' | 'unchanged'

export type MerchantSyncPreviewRow = {
  platformMerchantId: number
  merchantMark: string | null
  platformName: string
  tenantCount: number
  action: MerchantSyncAction
  localMerchantId?: string
  localName?: string
  changes: string[]
  warnings: string[]
}

export type MerchantSyncPreviewResult = {
  previewId: string
  platformTotal: number
  rows: MerchantSyncPreviewRow[]
  summary: {
    create: number
    update: number
    unchanged: number
  }
}

export type MerchantSyncCommitResult = {
  created: number
  updated: number
  unchanged: number
  errors: { platformMerchantId: number; message: string }[]
}

/** 定时/自动同步：平台商户 upsert 结果（含本地商户与 tenant_ids） */
export type MerchantSyncAutoResult = MerchantSyncCommitResult & {
  merchants: Array<{
    localMerchantId: string
    platformMerchantId: number
    tenantIds: string[]
  }>
}
