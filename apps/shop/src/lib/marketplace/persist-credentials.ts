import { and, eq } from 'drizzle-orm'
import {
  encryptCredentialPayload,
  type CredentialPayload,
  type MarketplacePlatform,
} from '@workspace/marketplace'
import { integrationCredentials, shops } from '@workspace/db/schema'
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

  const existing = await db
    .select({ id: integrationCredentials.id })
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.shopId, input.shopId),
        eq(integrationCredentials.kind, 'oauth'),
      ),
    )
    .limit(1)

  if (existing[0]) {
    await db
      .update(integrationCredentials)
      .set({
        payloadEncrypted,
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(integrationCredentials.id, existing[0].id))
  } else {
    await db.insert(integrationCredentials).values({
      organizationId: input.organizationId,
      shopId: input.shopId,
      kind: 'oauth',
      payloadEncrypted,
      expiresAt,
    })
  }

  await db
    .update(shops)
    .set({
      status: 'active',
      externalShopId: input.externalShopId ?? undefined,
      region: input.region ?? undefined,
      meta: input.shopMeta ?? {},
      updatedAt: new Date(),
    })
    .where(and(eq(shops.id, input.shopId), eq(shops.organizationId, input.organizationId)))
}
