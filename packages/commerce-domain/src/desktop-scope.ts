import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm"
import { shops } from "@workspace/db/schema"
import { DesktopScopeError } from "./errors"

export const DESKTOP_PLATFORM = "daraz"
export const DESKTOP_SITE = "LK"

export const DESKTOP_SCOPE_MESSAGE =
  "本期工作台仅开放 Daraz 斯里兰卡，ERP 中其他店铺仍可在 Web 使用。"

export function normalizeMarketplacePlatform(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

export function normalizeMarketplaceSite(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase()
}

export function isDarazLkShop(input: {
  platform?: string | null
  marketplaceCountry?: string | null
  region?: string | null
}): boolean {
  if (normalizeMarketplacePlatform(input.platform) !== DESKTOP_PLATFORM) return false
  const site = normalizeMarketplaceSite(input.marketplaceCountry || input.region)
  return site === DESKTOP_SITE
}

/** 请求若带平台/站点且不是 Daraz LK，则拒绝。未传则默认限定 Daraz LK。 */
export function assertDesktopMarketplaceScope(input?: {
  platform?: string | null
  site?: string | null
  country?: string | null
}): { platform: string; site: string } {
  const platform = normalizeMarketplacePlatform(input?.platform)
  const site = normalizeMarketplaceSite(input?.site || input?.country)
  if (platform && platform !== DESKTOP_PLATFORM) throw new DesktopScopeError()
  if (site && site !== DESKTOP_SITE) throw new DesktopScopeError()
  return { platform: DESKTOP_PLATFORM, site: DESKTOP_SITE }
}

export function darazLkShopCondition(): SQL {
  return and(
    eq(shops.platform, DESKTOP_PLATFORM),
    isNull(shops.deletedAt),
    or(
      eq(shops.marketplaceCountry, DESKTOP_SITE),
      eq(shops.region, DESKTOP_SITE),
      sql`upper(coalesce(${shops.marketplaceCountry}, ${shops.region}, '')) = ${DESKTOP_SITE}`,
    ),
  )!
}
