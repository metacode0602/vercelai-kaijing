export type BareMetalOrderSyncTrigger = 'scheduled' | 'manual'

export type BareMetalOrderSyncJobStatus =
  | 'running'
  | 'success'
  | 'partial'
  | 'failed'
  | 'skipped'

export type BareMetalOrderSyncItemPhase = 'billing_sync' | 'tenant_import' | 'order_upsert'

export type BareMetalOrderSyncItemStatus = 'success' | 'failed' | 'skipped'

export type BareMetalOrderSyncErrorCode =
  | 'UNKNOWN_TENANT'
  | 'DETAILS_FETCH_FAILED'
  | 'DEVICE_FETCH_FAILED'
  | 'DETAIL_COUNT_MISMATCH'
  | 'UPSERT_FAILED'
  | 'PLATFORM_API_ERROR'

export type BareMetalOrderSyncConfigDto = {
  enabled: boolean
  cron: string
  timezone: string
  billingLookbackMonths: number
  /** 滑动窗口天数（精确 24h × N 回看） */
  windowDays: number
  /** @deprecated 与 windowDays 相同 */
  safetyDays: number
  initialStartDate: string | null
  /** @deprecated 滑动窗口模式下不再推进游标 */
  orderSyncCursorEndDate: string | null
  autoImportTenantsEnabled: boolean
  lastRunAt: string | null
  lastSuccessAt: string | null
}

export type BareMetalOrderSyncJobRunDto = {
  id: string
  trigger: BareMetalOrderSyncTrigger
  startedAt: string
  finishedAt: string | null
  status: BareMetalOrderSyncJobStatus
  ordersFetchedCount: number
  unknownTenantCount: number
  tenantsAutoImportedCount: number
  billingSyncTenantCount: number
  orderUpsertedCount: number
  successCount: number
  failedCount: number
  errorSummary: string | null
}

export type BareMetalOrderSyncJobItemDto = {
  id: string
  jobRunId: string
  platformTenantId: string
  tenantId: string | null
  tenantName: string | null
  phase: BareMetalOrderSyncItemPhase | string
  status: BareMetalOrderSyncItemStatus | string
  orderCount: number
  errorMessage: string | null
  platformOrderId?: string | null
  orderNo?: string | null
  errorCode?: string | null
  resolvedAt?: string | null
  resolvedByStaffId?: string | null
  resolvedByStaffName?: string | null
}

export type BareMetalOrderSyncJobRunDetailDto = BareMetalOrderSyncJobRunDto & {
  items: BareMetalOrderSyncJobItemDto[]
}

export type BareMetalOrderSyncRunResult = {
  acquiredLock: boolean
  jobRunId?: string
  status?: BareMetalOrderSyncJobStatus | string
  message?: string
}

export type BareMetalOrderSyncFailedItemDto = {
  id: string
  jobRunId: string
  platformTenantId: string
  tenantId: string | null
  tenantName: string | null
  platformOrderId: string | null
  orderNo: string | null
  errorCode: string | null
  errorMessage: string | null
  resolvedAt: string | null
  resolvedByStaffId: string | null
  resolvedByStaffName: string | null
  platformPayload: Record<string, unknown>
  jobStartedAt: string
  jobTrigger: string
  jobStatus: string
}

export type BareMetalOrderSyncFailedItemsListDto = {
  items: BareMetalOrderSyncFailedItemDto[]
  total: number
  openCount: number
  page: number
  pageSize: number
}

export type BareMetalOrderSyncJobRunSummaryDto = {
  id: string
  trigger: string
  startedAt: string
  finishedAt: string | null
  status: string
  ordersFetchedCount: number
  orderUpsertedCount: number
  failedCount: number
  errorSummary: string | null
}
