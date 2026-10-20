import type { BareMetalOrderSyncErrorCode } from '@/lib/types/bare-metal-order-sync-api'

export type { BareMetalOrderSyncErrorCode }

export { BARE_METAL_SYNC_ERROR_LABELS } from '@/lib/supplier/bare-metal-sync-error-labels'

export class BareMetalOrderSyncError extends Error {
  readonly code: BareMetalOrderSyncErrorCode

  constructor(message: string, code: BareMetalOrderSyncErrorCode) {
    super(message)
    this.name = 'BareMetalOrderSyncError'
    this.code = code
  }
}

export function isBareMetalOrderSyncError(e: unknown): e is BareMetalOrderSyncError {
  return e instanceof BareMetalOrderSyncError
}
