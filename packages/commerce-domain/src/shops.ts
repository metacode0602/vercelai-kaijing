import { and, eq, isNull } from "drizzle-orm"
import { shops, type AppDatabase } from "@workspace/db"
import { darazLkShopCondition, isDarazLkShop } from "./desktop-scope"
import { DesktopScopeError, NotFoundError } from "./errors"

export type DesktopShop = {
  id: string
  name: string
  platform: string
  region: string | null
  marketplaceCountry: string | null
  currency: string
  status: string
  inventoryPushEnabled: boolean
  priceWritebackEnabled: boolean
  lastSyncAt: Date | null
}

function mapShop(row: typeof shops.$inferSelect): DesktopShop {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    region: row.region,
    marketplaceCountry: row.marketplaceCountry,
    currency: row.currency,
    status: row.status,
    inventoryPushEnabled: row.inventoryPushEnabled,
    priceWritebackEnabled: row.priceWritebackEnabled,
    lastSyncAt: row.lastSyncAt,
  }
}

export async function listDesktopShops(
  db: AppDatabase,
  organizationId: string,
): Promise<DesktopShop[]> {
  const rows = await db
    .select()
    .from(shops)
    .where(and(eq(shops.organizationId, organizationId), darazLkShopCondition()))
  return rows.map(mapShop)
}

export async function findOrganizationShop(
  db: AppDatabase,
  organizationId: string,
  shopId: string,
): Promise<typeof shops.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(shops)
    .where(
      and(
        eq(shops.id, shopId),
        eq(shops.organizationId, organizationId),
        isNull(shops.deletedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

export async function requireDesktopShop(
  db: AppDatabase,
  organizationId: string,
  shopId: string,
): Promise<DesktopShop> {
  const row = await findOrganizationShop(db, organizationId, shopId)
  if (!row) throw new NotFoundError("店铺不存在")
  if (!isDarazLkShop(row)) throw new DesktopScopeError()
  return mapShop(row)
}

/** 解析 Desktop 工具可用的店铺 ID。未传 shopId 时返回该组织全部 Daraz LK 店铺。 */
export async function resolveDesktopShopIds(
  db: AppDatabase,
  organizationId: string,
  shopId?: string | null,
): Promise<string[]> {
  if (shopId?.trim()) {
    const shop = await requireDesktopShop(db, organizationId, shopId.trim())
    return [shop.id]
  }
  const rows = await listDesktopShops(db, organizationId)
  return rows.map((row) => row.id)
}
