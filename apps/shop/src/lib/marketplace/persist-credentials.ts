import { and, eq, isNull, ne } from 'drizzle-orm'
import {
  encryptCredentialPayload,
  type CredentialPayload,
  type MarketplacePlatform,
} from '@workspace/marketplace'
import {
  findOccupyingShop,
  finalizeExpiredTransferAppeals,
  markConflictClosedAfterReauth,
  recordCrossTenantBindingConflict,
  recordShopIdentityUnavailable,
} from '@workspace/db'
import {
  integrationCredentials,
  integrationLogs,
  integrationStates,
  shops,
} from '@workspace/db/schema'
import { db } from '@/lib/db'
import {
  ShopBindingConflictError,
  ShopIdentityUnavailableError,
} from '@/lib/marketplace/errors'

function metaBoolean(meta: unknown, key: string): boolean {
  if (!meta || typeof meta !== 'object') return false
  return Boolean((meta as Record<string, unknown>)[key])
}

export async function persistOAuthCredentials(input: {
  organizationId: string
  shopId: string
  platform: MarketplacePlatform
  appCredentialId?: string
  tokens: CredentialPayload
  externalShopId?: string
  region?: string
  shopMeta?: Record<string, unknown>
  actorUserId?: string
}) {
  const result = await db.transaction(async (tx) => {
    const [currentShop] = await tx
      .select()
      .from(shops)
      .where(
        and(
          eq(shops.id, input.shopId),
          eq(shops.organizationId, input.organizationId),
        ),
      )
      .limit(1)
    if (!currentShop) throw new Error('店铺不存在')

    await finalizeExpiredTransferAppeals(tx)

    const externalShopId = input.externalShopId?.trim()
    if (!externalShopId) {
      const message = await recordShopIdentityUnavailable(tx, {
        shop: currentShop,
        platform: input.platform,
        actorUserId: input.actorUserId,
      })
      return { kind: 'identity_unavailable' as const, message }
    }

    const occupant = await findOccupyingShop(tx, {
      platform: input.platform,
      externalShopId,
      excludeOrganizationId: input.organizationId,
    })
    if (occupant) {
      const { message } = await recordCrossTenantBindingConflict(tx, {
        challengerShop: currentShop,
        occupantShop: occupant,
        platform: input.platform,
        externalShopId,
        actorUserId: input.actorUserId,
      })
      return { kind: 'conflict' as const, message }
    }

    const payloadEncrypted = encryptCredentialPayload(input.tokens)
    const expiresAt = input.tokens.expiresAt ? new Date(input.tokens.expiresAt) : null

    let targetShop = currentShop
    const [sameTenant] = await tx
      .select()
      .from(shops)
      .where(
        and(
          eq(shops.organizationId, input.organizationId),
          eq(shops.platform, input.platform),
          eq(shops.externalShopId, externalShopId),
          ne(shops.id, input.shopId),
          isNull(shops.deletedAt),
        ),
      )
      .limit(1)
    if (sameTenant) targetShop = sameTenant

    const [existingCredential] = await tx
      .select({ id: integrationCredentials.id })
      .from(integrationCredentials)
      .where(
        and(
          eq(integrationCredentials.shopId, targetShop.id),
          eq(integrationCredentials.kind, 'oauth'),
        ),
      )
      .limit(1)

    if (existingCredential) {
      await tx
        .update(integrationCredentials)
        .set({
          appCredentialId: input.appCredentialId,
          payloadEncrypted,
          expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(integrationCredentials.id, existingCredential.id))
    } else {
      await tx.insert(integrationCredentials).values({
        organizationId: input.organizationId,
        shopId: targetShop.id,
        appCredentialId: input.appCredentialId,
        kind: 'oauth',
        payloadEncrypted,
        expiresAt,
      })
    }

    const syncPaused =
      targetShop.id === input.shopId
        ? currentShop.status === 'active' && metaBoolean(targetShop.meta, 'syncPaused')
        : metaBoolean(targetShop.meta, 'syncPaused')

    await tx
      .update(shops)
      .set({
        status: 'active',
        externalShopId,
        region: input.region ?? targetShop.region,
        authExpiresAt: expiresAt,
        meta: {
          ...(targetShop.meta ?? {}),
          ...(input.shopMeta ?? {}),
          syncPaused,
          lastError: null,
          transferReauthAllowed: false,
        },
        updatedAt: new Date(),
      })
      .where(eq(shops.id, targetShop.id))

    if (targetShop.id !== currentShop.id) {
      await tx
        .update(shops)
        .set({
          status: 'disabled',
          meta: {
            ...(currentShop.meta ?? {}),
            mergedIntoShopId: targetShop.id,
            lastError: '重复绑定，已合并到已有店铺',
          },
          updatedAt: new Date(),
        })
        .where(eq(shops.id, currentShop.id))
    }

    await tx
      .insert(integrationStates)
      .values({ shopId: targetShop.id, health: 'idle', lastError: null })
      .onConflictDoUpdate({
        target: integrationStates.shopId,
        set: { health: 'idle', lastError: null },
      })

    await tx.insert(integrationLogs).values({
      shopId: targetShop.id,
      direction: 'in',
      action: 'oauth_callback',
      status: 'success',
      message:
        targetShop.id === currentShop.id
          ? `${input.platform} oauth bound`
          : `${input.platform} oauth duplicate merged`,
      payloadSummary: JSON.stringify({
        platform: input.platform,
        duplicate: targetShop.id !== currentShop.id,
        externalShopId,
      }),
    })

    await markConflictClosedAfterReauth(tx, {
      platform: input.platform,
      externalShopId,
      organizationId: input.organizationId,
      shopId: targetShop.id,
      actorUserId: input.actorUserId,
    })

    return {
      kind: 'ok' as const,
      shopId: targetShop.id,
      duplicate: targetShop.id !== currentShop.id,
    }
  })

  if (result.kind === 'conflict') throw new ShopBindingConflictError(result.message)
  if (result.kind === 'identity_unavailable') {
    throw new ShopIdentityUnavailableError(result.message)
  }
  return result
}
