import { and, desc, eq } from "drizzle-orm"
import { marketplaceAppCredentials } from "@workspace/db/schema"
import type { AppDatabase } from "@workspace/db"
import { decryptSecret } from "../crypto/credentials"

export type MarketplaceAppPlatform = "daraz" | "lazada" | "tiktok_shop"

export interface ResolvedMarketplaceAppCredential {
  id: string
  organizationId: string
  platform: MarketplaceAppPlatform
  /** Normalized uppercase site code; empty string means platform-wide fallback. */
  region: string
  appKey: string
  appSecret: string
  callbackKey: string | null
}

export function normalizeMarketplaceRegion(region: string | null | undefined): string {
  return (region ?? "").trim().toUpperCase()
}

function mapRow(
  row: typeof marketplaceAppCredentials.$inferSelect
): ResolvedMarketplaceAppCredential {
  return {
    id: row.id,
    organizationId: row.organizationId,
    platform: row.platform as MarketplaceAppPlatform,
    region: row.region,
    appKey: row.appKey,
    appSecret: decryptSecret(row.appSecretEncrypted),
    callbackKey: row.callbackKey ?? null,
  }
}

const ACTIVE = "active"

/**
 * Resolve tenant app credentials.
 * - With `credentialId`: load that exact row (OAuth callback).
 * - Without: exact region first, then region='' fallback (authorize/sync).
 * Returns null when no active configuration exists.
 */
export async function resolveMarketplaceAppCredential(
  db: AppDatabase,
  input: {
    organizationId: string
    platform: MarketplaceAppPlatform
    region?: string | null
    credentialId?: string
  }
): Promise<ResolvedMarketplaceAppCredential | null> {
  if (input.credentialId) {
    const [row] = await db
      .select()
      .from(marketplaceAppCredentials)
      .where(
        and(
          eq(marketplaceAppCredentials.id, input.credentialId),
          eq(marketplaceAppCredentials.organizationId, input.organizationId),
          eq(marketplaceAppCredentials.platform, input.platform),
          eq(marketplaceAppCredentials.status, ACTIVE)
        )
      )
      .limit(1)
    return row ? mapRow(row) : null
  }

  const region = normalizeMarketplaceRegion(input.region)
  if (region) {
    const [exact] = await db
      .select()
      .from(marketplaceAppCredentials)
      .where(
        and(
          eq(marketplaceAppCredentials.organizationId, input.organizationId),
          eq(marketplaceAppCredentials.platform, input.platform),
          eq(marketplaceAppCredentials.region, region),
          eq(marketplaceAppCredentials.status, ACTIVE)
        )
      )
      .limit(1)
    if (exact) return mapRow(exact)
  }

  const [fallback] = await db
    .select()
    .from(marketplaceAppCredentials)
    .where(
      and(
        eq(marketplaceAppCredentials.organizationId, input.organizationId),
        eq(marketplaceAppCredentials.platform, input.platform),
        eq(marketplaceAppCredentials.region, ""),
        eq(marketplaceAppCredentials.status, ACTIVE)
      )
    )
    .limit(1)
  return fallback ? mapRow(fallback) : null
}

/**
 * Webhook lookup by platform App Key.
 * Multiple rows can share an App Key within one organization (different regions),
 * so callers should disambiguate with the seller's shop when needed.
 */
export async function findMarketplaceAppCredentialsByAppKey(
  db: AppDatabase,
  appKey: string
): Promise<ResolvedMarketplaceAppCredential[]> {
  const rows = await db
    .select()
    .from(marketplaceAppCredentials)
    .where(
      and(
        eq(marketplaceAppCredentials.appKey, appKey),
        eq(marketplaceAppCredentials.status, ACTIVE)
      )
    )
    .orderBy(desc(marketplaceAppCredentials.updatedAt))
    .limit(20)
  return rows.map(mapRow)
}
