export type LazopPlatform = "daraz" | "lazada"
export type MarketplaceSyncPlatform = LazopPlatform | "tiktok_shop"

export function isLazopPlatform(platform: string): platform is LazopPlatform {
  return platform === "daraz" || platform === "lazada"
}

export function isOrderListingSyncPlatform(
  platform: string
): platform is MarketplaceSyncPlatform {
  return (
    platform === "daraz" ||
    platform === "lazada" ||
    platform === "tiktok_shop"
  )
}

export function resolveLazopPlatformFromSite(
  site: string | undefined
): LazopPlatform | null {
  const normalized = (site ?? "").trim().toLowerCase()
  if (normalized.startsWith("lazada")) return "lazada"
  if (normalized.startsWith("daraz")) return "daraz"
  return null
}
