import { eq } from "drizzle-orm"
import { shops } from "@workspace/db/schema"
import {
  resolveMarketplaceAppCredential,
  type MarketplaceAppPlatform,
} from "@workspace/marketplace"
import { db } from "@/lib/db"

export async function resolveShopAppCredential(input: {
  shopId: string
  platform: MarketplaceAppPlatform
  region?: string
}) {
  const [shop] = await db
    .select({ organizationId: shops.organizationId, region: shops.region })
    .from(shops)
    .where(eq(shops.id, input.shopId))
    .limit(1)

  if (!shop) return null

  return resolveMarketplaceAppCredential(db, {
    organizationId: shop.organizationId,
    platform: input.platform,
    region: input.region ?? shop.region ?? undefined,
  })
}
