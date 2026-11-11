import { and, eq, isNull } from 'drizzle-orm'
import { integrationStates, shops } from '@workspace/db/schema'
import { db } from '@/lib/db'
import { logMarketplaceOAuth } from '@/lib/marketplace/audit'
import {
  classifyOAuthFailureCode,
  safeOAuthFailureDetail,
  sanitizeOAuthFailureText,
} from '@/lib/marketplace/oauth-failure'

export async function persistOAuthCallbackFailure(input: {
  shopId: string
  organizationId?: string
  platform?: string
  reason?: string | null
  message?: string | null
  queryError?: string | null
  detail?: Record<string, unknown>
}) {
  const classified = classifyOAuthFailureCode({
    reason: input.reason,
    message: input.message,
    queryError: input.queryError,
  })
  const extra = sanitizeOAuthFailureText(input.message || input.queryError || '')
  const safeMessage = sanitizeOAuthFailureText(
    extra && extra !== classified.message
      ? `${classified.message} ${extra}`
      : classified.message,
  )
  const detail = safeOAuthFailureDetail({
    reason: classified.code,
    platform: input.platform,
    originalMessage: extra || undefined,
    ...input.detail,
  })

  try {
    const filters = [
      eq(shops.id, input.shopId),
      isNull(shops.deletedAt),
    ]
    if (input.organizationId) {
      filters.push(eq(shops.organizationId, input.organizationId))
    }
    const [shop] = await db
      .select({ id: shops.id, meta: shops.meta })
      .from(shops)
      .where(and(...filters))
      .limit(1)
    if (!shop) return classified

    const meta =
      shop.meta && typeof shop.meta === 'object'
        ? { ...(shop.meta as Record<string, unknown>) }
        : {}

    await db
      .update(shops)
      .set({
        status: 'error',
        meta: {
          ...meta,
          lastError: safeMessage,
          lastErrorCode: classified.code,
        },
        updatedAt: new Date(),
      })
      .where(eq(shops.id, shop.id))

    await db
      .insert(integrationStates)
      .values({
        shopId: shop.id,
        health: 'error',
        lastError: classified.code,
      })
      .onConflictDoUpdate({
        target: integrationStates.shopId,
        set: { health: 'error', lastError: classified.code },
      })

    await logMarketplaceOAuth({
      shopId: shop.id,
      action: 'oauth_callback',
      status: 'error',
      message: safeMessage,
      detail,
    })
  } catch {
    return classified
  }

  return classified
}
