import { integrationLogs } from '@workspace/db/schema'
import { db } from '@/lib/db'

export async function logMarketplaceOAuth(input: {
  shopId: string
  action: 'oauth_authorize' | 'oauth_callback'
  status: 'success' | 'error'
  message: string
  detail?: Record<string, unknown>
}) {
  try {
    await db.insert(integrationLogs).values({
      shopId: input.shopId,
      direction: 'in',
      action: input.action,
      status: input.status,
      message: input.message.slice(0, 1000),
      payloadSummary: input.detail
        ? JSON.stringify(input.detail).slice(0, 2000)
        : null,
    })
  } catch {
    return
  }
}
