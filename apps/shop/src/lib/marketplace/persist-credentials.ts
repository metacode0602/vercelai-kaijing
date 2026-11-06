import { and, eq, isNull, ne } from 'drizzle-orm'
import {
  encryptCredentialPayload,
  type CredentialPayload,
  type MarketplacePlatform,
} from '@workspace/marketplace'
import {
  integrationCredentials,
  integrationStates,
  shops,
} from '@workspace/db/schema'
import { db } from '@/lib/db'

export async function persistOAuthCredentials(input: {
  organizationId: string
  shopId: string
  platform: MarketplacePlatform
  tokens: CredentialPayload
  externalShopId?: string
  region?: string
  shopMeta?: Record<string, unknown>
}) {
  const payloadEncrypted = encryptCredentialPayload(input.tokens)
  const expiresAt = input.tokens.expiresAt ? new Date(input.tokens.expiresAt) : null

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

    let targetShop = currentShop

    if (input.externalShopId) {
      const [crossTenant] = await tx
        .select({ id: shops.id, organizationId: shops.organizationId })
        .from(shops)
        .where(
          and(
            eq(shops.platform, input.platform),
            eq(shops.externalShopId, input.externalShopId),
            ne(shops.organizationId, input.organizationId),
            isNull(shops.deletedAt),
          ),
        )
        .limit(1)
      if (crossTenant) {
        await tx
          .update(shops)
          .set({
            status: 'error',
            meta: {
              ...(currentShop.meta ?? {}),
              lastError: '该平台店铺已绑定到其他租户，请联系平台运营处理',
            },
            updatedAt: new Date(),
          })
          .where(eq(shops.id, currentShop.id))
        return {
          conflict: true as const,
          message: '该平台店铺已绑定到其他租户，请联系平台运营处理',
        }
      }

      const [sameTenant] = await tx
        .select()
        .from(shops)
        .where(
          and(
            eq(shops.organizationId, input.organizationId),
            eq(shops.platform, input.platform),
            eq(shops.externalShopId, input.externalShopId),
            ne(shops.id, input.shopId),
            isNull(shops.deletedAt),
          ),
        )
        .limit(1)
      if (sameTenant) targetShop = sameTenant
    }

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
        .set({ payloadEncrypted, expiresAt, updatedAt: new Date() })
        .where(eq(integrationCredentials.id, existingCredential.id))
    } else {
      await tx.insert(integrationCredentials).values({
        organizationId: input.organizationId,
        shopId: targetShop.id,
        kind: 'oauth',
        payloadEncrypted,
        expiresAt,
      })
    }

    await tx
      .update(shops)
      .set({
        status: 'active',
        externalShopId: input.externalShopId ?? targetShop.externalShopId,
        region: input.region ?? targetShop.region,
        authExpiresAt: expiresAt,
        meta: {
          ...(targetShop.meta ?? {}),
          ...(input.shopMeta ?? {}),
          lastError: null,
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

    return {
      conflict: false as const,
      shopId: targetShop.id,
      duplicate: targetShop.id !== currentShop.id,
    }
  })

  if (result.conflict) throw new Error(result.message)
  return result
}
