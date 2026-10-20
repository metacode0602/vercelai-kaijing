import type { BareMetalOrderSyncErrorCode } from '@/lib/types/bare-metal-order-sync-api'

export const BARE_METAL_SYNC_ERROR_LABELS: Record<BareMetalOrderSyncErrorCode, string> = {
  UNKNOWN_TENANT: '未知租户',
  DETAILS_FETCH_FAILED: '订单详情拉取失败',
  DEVICE_FETCH_FAILED: '设备详情拉取失败',
  DETAIL_COUNT_MISMATCH: '明细数量不一致',
  UPSERT_FAILED: '写入失败',
  PLATFORM_API_ERROR: '平台 API 错误',
}

export const BARE_METAL_SYNC_ERROR_CODES = Object.keys(
  BARE_METAL_SYNC_ERROR_LABELS,
) as BareMetalOrderSyncErrorCode[]
