import { fetchPlatformMetalOrders } from '@/lib/server/integrations/suanli-billing-api'
import { upsertPlatformBareMetalOrder } from './bare-metal-order-sync'
import { isBareMetalOrderSyncError } from './bare-metal-order-sync-errors-codes'

type TenantRef = {
  tenantId: string
  platformTenantId: string
  customerId: string | null
}

export type BareMetalTenantWindowSyncResult = {
  ordersFetchedCount: number
  orderUpsertedCount: number
  failedCount: number
  errors: string[]
}

/** 按租户 + 日期窗口拉取并 upsert 裸金属订单（新租户补齐与账单 directImport 同期） */
export async function upsertBareMetalOrdersForTenantWindow(input: {
  tenant: TenantRef
  startDate: string
  endDate: string
  traceId: string
}): Promise<BareMetalTenantWindowSyncResult> {
  const orders = await fetchPlatformMetalOrders({
    platformTenantId: input.tenant.platformTenantId,
    startDate: input.startDate,
    endDate: input.endDate,
    traceId: input.traceId,
  })

  let orderUpsertedCount = 0
  let failedCount = 0
  const errors: string[] = []

  for (const record of orders) {
    try {
      await upsertPlatformBareMetalOrder({
        record,
        tenant: input.tenant,
        traceId: input.traceId,
      })
      orderUpsertedCount++
    } catch (e) {
      failedCount++
      const code = isBareMetalOrderSyncError(e) ? e.code : 'UPSERT_FAILED'
      const msg = e instanceof Error ? e.message : 'upsert 失败'
      errors.push(`订单 ${record.order_no}: [${code}] ${msg}`)
    }
  }

  return {
    ordersFetchedCount: orders.length,
    orderUpsertedCount,
    failedCount,
    errors,
  }
}
