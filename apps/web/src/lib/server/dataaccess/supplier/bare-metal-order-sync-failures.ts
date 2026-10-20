import 'server-only'

import { db } from '@/lib/db'
import type { PlatformMetalOrderRecord } from '@/lib/server/integrations/suanli-billing-api'
import { bareMetalSyncJobItem } from '@workspace/db/schema'
import type { BareMetalOrderSyncErrorCode } from './bare-metal-order-sync-errors-codes'

function newItemId() {
  return crypto.randomUUID()
}

export async function insertOrderSyncFailureItem(input: {
  jobRunId: string
  record: PlatformMetalOrderRecord
  tenantId?: string | null
  errorCode: BareMetalOrderSyncErrorCode
  errorMessage: string
  extraPayload?: Record<string, unknown>
}): Promise<string> {
  const id = newItemId()
  await db.insert(bareMetalSyncJobItem).values({
    id,
    jobRunId: input.jobRunId,
    platformTenantId: String(input.record.tenant_id),
    tenantId: input.tenantId ?? null,
    phase: 'order_upsert',
    status: 'failed',
    orderCount: 1,
    errorMessage: input.errorMessage,
    platformOrderId: String(input.record.order_id),
    orderNo: input.record.order_no,
    errorCode: input.errorCode,
    platformPayload: {
      list: input.record as unknown as Record<string, unknown>,
      ...input.extraPayload,
    },
  })
  return id
}

export async function insertUnknownTenantOrderFailureItem(input: {
  jobRunId: string
  record: PlatformMetalOrderRecord
}): Promise<string> {
  return insertOrderSyncFailureItem({
    jobRunId: input.jobRunId,
    record: input.record,
    tenantId: null,
    errorCode: 'UNKNOWN_TENANT',
    errorMessage: `平台租户 ${input.record.tenant_id} 未导入 CRM`,
  })
}
